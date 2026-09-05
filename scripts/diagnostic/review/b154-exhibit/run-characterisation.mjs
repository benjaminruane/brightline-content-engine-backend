#!/usr/bin/env node
/**
 * B154 characterisation: on the current model build, is the wrong answer
 * on the comparables sentence consistent, or still a flap?
 * Also records whether the cited passage is the same each time.
 *
 * Reuses stored Stage 1 S7. Cache off. Seed 1. No early stop.
 * Does not change Stage 2. Does not build a backstop.
 * Does not regenerate brackenhill-2026-09-02.json.
 *
 * Usage: node scripts/diagnostic/review/b154-exhibit/run-characterisation.mjs
 */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadLocalEnvFiles } from "../../lib/env.mjs";

loadLocalEnvFiles({ liveMeasurement: true });
process.env.QC_LLM_CACHE = "0";
delete process.env.QC_LLM_CACHE_DISK;

const { calculateLlmCostUsd, flushObservability, hasProviderApiKey } = await import(
  "../../../../lib/observability.js"
);
const { STAGE_MODELS } = await import("../../../../lib/qc/model-config.mjs");
const { matchAllSources } = await import(
  "../../../../lib/qc/pipeline-v4/stage2-match-sources.mjs"
);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_DIR = path.resolve(__dirname, "../../revise/per-finding-action-list");
const SOURCE_PATH = path.join(SAMPLE_DIR, "brackenhill-fund-iii-source.txt");
const OUT_PATH = path.join(__dirname, "characterisation-2026-09-05.json");
const COST_CEILING_USD = 2;
const N = 20;
const COMPARATIVE_INDEX = 7;
const OWN_MARK_NEEDLE = "marked at 1.4 times gross MOIC";

function roundUsd(n) {
  return Math.round((Number(n) || 0) * 1e6) / 1e6;
}

function usd(modelRow, inputTokens, outputTokens) {
  return calculateLlmCostUsd(modelRow.provider, modelRow.model, {
    inputTokens,
    outputTokens,
    cachedInputTokens: 0,
  });
}

function collapse(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function passageKey(passage) {
  return collapse(passage);
}

function passageHash(passage) {
  return createHash("sha256").update(passageKey(passage), "utf8").digest("hex");
}

const stage2Model = STAGE_MODELS["stage2-matching"];
const perCallConservativeUsd = roundUsd(usd(stage2Model, 8000, 400));
const observedMaxUsd = 0.0101125;
const expectedConservativeUsd = roundUsd(N * perCallConservativeUsd);
const expectedObservedUsd = roundUsd(N * observedMaxUsd);

const design = {
  question: "On the current model build, is the wrong answer on the comparables sentence consistent, or still a flap?",
  n: N,
  seed: 1,
  temperature: 0,
  cache: "off (QC_LLM_CACHE=0, disk cache unset, in-process cache therefore unused)",
  spanElicit: false,
  stoppingRule: "run all n unless billed reaches the ceiling. No stop on first partial.",
  statementSource: "stored stage1.json S7. No Stage 1 call.",
  passageQuestion: "hash and collapse each cited passage. Count unique passages.",
};

console.log(
  JSON.stringify(
    {
      design,
      expectedConservativeUsd,
      expectedObservedMaxUsd: expectedObservedUsd,
      perCallConservativeUsd,
      costCeilingUsd: COST_CEILING_USD,
    },
    null,
    2
  )
);

if (expectedConservativeUsd >= COST_CEILING_USD) {
  console.error("STOP: conservative pre-flight at or above the ceiling");
  process.exit(1);
}
if (!hasProviderApiKey(stage2Model.provider)) {
  console.error("STOP: no OpenAI API key");
  process.exit(1);
}

const stage1 = JSON.parse(await readFile(path.join(__dirname, "stage1.json"), "utf8"));
const statements = Array.isArray(stage1?.stage1?.statements) ? stage1.stage1.statements : [];
const comparative = statements.find((s) => Number(s.index) === COMPARATIVE_INDEX);
if (!comparative) {
  console.error("STOP: stored stage1.json missing S7");
  process.exit(1);
}

const sourceText = await readFile(SOURCE_PATH, "utf8");
const sources = [{ label: "Fund III Investor Update", text: sourceText }];

let billed = 0;
const runs = [];
for (let i = 0; i < N; i += 1) {
  const { matches } = await matchAllSources({
    statements: [comparative],
    sources,
    traceId: `b154-s7-characterisation-${i + 1}`,
    stage2SpanEnabled: false,
  });
  const pair = matches[0] || {};
  const costUsd = Number(pair.costUsd) || 0;
  billed = roundUsd(billed + costUsd);
  if (billed >= COST_CEILING_USD) {
    console.error(`STOP: billed $${billed} at or above $${COST_CEILING_USD} during characterisation`);
    process.exit(1);
  }
  const passage = typeof pair.passage === "string" ? pair.passage : "";
  const classification = pair.classification ?? null;
  runs.push({
    run: i + 1,
    classification,
    preBackstopClassification: pair.preBackstopClassification ?? null,
    passage,
    passageCollapsed: passageKey(passage),
    passageHash: passageHash(passage),
    ownFundMarkCue: collapse(passage).toLowerCase().includes(OWN_MARK_NEEDLE.toLowerCase()),
    explanation: pair.explanation ?? null,
    costUsd,
    systemFingerprint: pair.systemFingerprint ?? null,
    shapeBThisRun: classification === "partially_confirmed" || classification === "confirmed",
  });
  console.log(
    `run ${i + 1}/${N} class=${classification} fingerprint=${pair.systemFingerprint ?? "null"} billed=${billed}`
  );
}

const classifications = runs.map((r) => r.classification);
const counts = {};
for (const c of classifications) {
  const key = c || "(null)";
  counts[key] = (counts[key] || 0) + 1;
}
const uniquePassageHashes = [...new Set(runs.map((r) => r.passageHash))];
const fingerprints = [...new Set(runs.map((r) => r.systemFingerprint).filter(Boolean))];
const shapeBCount = runs.filter((r) => r.shapeBThisRun).length;
const noSupportCount = runs.filter((r) => r.classification === "no_support").length;
const consistentWrong = shapeBCount === N;
const consistentClean = noSupportCount === N;
const stillFlaps = shapeBCount > 0 && shapeBCount < N;

const out = {
  capturedAt: new Date().toISOString(),
  billedUsd: billed,
  expectedConservativeUsd,
  expectedObservedMaxUsd: expectedObservedUsd,
  costCeilingUsd: COST_CEILING_USD,
  design,
  statement: comparative.text,
  statementIndex: COMPARATIVE_INDEX,
  nCompleted: runs.length,
  classifications,
  counts,
  shapeBCount,
  noSupportCount,
  uniquePassageCount: uniquePassageHashes.length,
  uniquePassageHashes,
  samePassageEveryRun: uniquePassageHashes.length === 1,
  fingerprints,
  consistentWrong,
  consistentClean,
  stillFlaps,
  gateable: consistentWrong,
  runs,
};

await writeFile(OUT_PATH, `${JSON.stringify(out, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      billedUsd: billed,
      counts,
      uniquePassageCount: uniquePassageHashes.length,
      fingerprints,
      consistentWrong,
      stillFlaps,
      wrote: OUT_PATH,
    },
    null,
    2
  )
);
await flushObservability();
