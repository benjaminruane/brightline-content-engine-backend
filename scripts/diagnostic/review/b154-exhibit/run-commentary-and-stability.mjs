#!/usr/bin/env node
/**
 * B154 exhibit unfinished business.
 * B1: characterise whether the comparatives sentence classifies stably.
 *     Not a hunt for the false green.
 * B2: capture Stage 5 commentary on the first-close sentence (and the
 *     comparatives sentence) so the exhibit contains what the user sees.
 *
 * Does not regenerate brackenhill-2026-09-02.json.
 * Does not change the Stage 2 prompt or pin.
 *
 * Usage: node scripts/diagnostic/review/b154-exhibit/run-commentary-and-stability.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadLocalEnvFiles } from "../../lib/env.mjs";

loadLocalEnvFiles({ liveMeasurement: true });

const { calculateLlmCostUsd, flushObservability, hasProviderApiKey } = await import(
  "../../../../lib/observability.js"
);
const { STAGE_MODELS } = await import("../../../../lib/qc/model-config.mjs");
const { matchAllSources } = await import(
  "../../../../lib/qc/pipeline-v4/stage2-match-sources.mjs"
);
const { generateCommentary } = await import(
  "../../../../lib/qc/pipeline-v4/stage5-generate-commentary.mjs"
);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE_DIR = path.resolve(__dirname, "../../revise/per-finding-action-list");
const SOURCE_PATH = path.join(SAMPLE_DIR, "brackenhill-fund-iii-source.txt");
const COST_CEILING_USD = 2;
const STABILITY_RUNS = 3;
const COMPARATIVE_INDEX = 7;
const FIRST_CLOSE_INDEX = 8;

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

function slimPair(m) {
  return {
    statementIndex: m.statementIndex,
    classification: m.classification,
    preBackstopClassification: m.preBackstopClassification,
    passage: m.passage,
    explanation: m.explanation,
    periodAssessment: m.periodAssessment ?? null,
    costUsd: m.costUsd,
    systemFingerprint: m.systemFingerprint ?? null,
  };
}

function displayLabels(displayVerdict) {
  if (displayVerdict === "supported_full") {
    return { badge: "Confirmed", line: "Confirmed by sources" };
  }
  if (displayVerdict === "supported_partial") {
    return { badge: "Partially confirmed", line: "Partially confirmed by sources" };
  }
  if (displayVerdict === "conflict") {
    return { badge: "Conflicting", line: "Conflicts with sources" };
  }
  return { badge: "No support", line: "No support from sources" };
}

const stage2Model = STAGE_MODELS["stage2-matching"];
const stage5Model = STAGE_MODELS["stage5-commentary"];
const preflightUsd = roundUsd(
  STABILITY_RUNS * usd(stage2Model, 8000, 400) + 2 * usd(stage5Model, 2500, 250)
);

const doing = {
  b1: "characterising whether S7 classifies stably at shipped seed 1 temperature 0. Three live pair calls. Cache off. Stop if any run is partial or confirmed. 3/3 no_support is a stable clean result.",
  b1Not: "hunting for the false green. Extra seeds. Full pipeline. Regenerating the action-list sample.",
  b2: "Stage 5 commentary on stored S8 (first close) and S7 (comparatives), using the production Stage 5 inputs from the saved exhibit pairs.",
};

console.log(JSON.stringify({ doing, preflightUsd, costCeilingUsd: COST_CEILING_USD }, null, 2));

if (preflightUsd >= COST_CEILING_USD) {
  console.error("STOP: pre-flight at or above the ceiling");
  process.exit(1);
}
if (!hasProviderApiKey(stage2Model.provider)) {
  console.error("STOP: no OpenAI API key");
  process.exit(1);
}

const stage1 = JSON.parse(await readFile(path.join(__dirname, "stage1.json"), "utf8"));
const savedPairs = JSON.parse(await readFile(path.join(__dirname, "stage2-pairs.json"), "utf8"));
const statements = Array.isArray(stage1?.stage1?.statements) ? stage1.stage1.statements : [];
const comparative = statements.find((s) => Number(s.index) === COMPARATIVE_INDEX);
const firstClose = statements.find((s) => Number(s.index) === FIRST_CLOSE_INDEX);
if (!comparative || !firstClose) {
  console.error("STOP: saved stage1.json missing S7 or S8");
  process.exit(1);
}

const sourceText = await readFile(SOURCE_PATH, "utf8");
const sources = [{ label: "Fund III Investor Update", text: sourceText }];
const savedMatches = Array.isArray(savedPairs?.matches) ? savedPairs.matches : [];
const savedS7 = savedMatches.find((m) => Number(m.statementIndex) === COMPARATIVE_INDEX);
const savedS8 = savedMatches.find((m) => Number(m.statementIndex) === FIRST_CLOSE_INDEX);

let billed = 0;
const stabilityRuns = [];
for (let i = 0; i < STABILITY_RUNS; i++) {
  const { matches } = await matchAllSources({
    statements: [comparative],
    sources,
    traceId: `b154-s7-stability-${i + 1}`,
  });
  const pair = slimPair(matches[0] || {});
  billed = roundUsd(billed + (Number(pair.costUsd) || 0));
  if (billed >= COST_CEILING_USD) {
    console.error(`STOP: billed $${billed} at or above $${COST_CEILING_USD} during stability`);
    process.exit(1);
  }
  const shapeBThisRun =
    pair.classification === "partially_confirmed" || pair.classification === "confirmed";
  stabilityRuns.push({
    run: i + 1,
    ...pair,
    shapeBThisRun,
  });
  if (shapeBThisRun) {
    break;
  }
}

const classifications = stabilityRuns.map((r) => r.classification);
const allNoSupport = classifications.length === STABILITY_RUNS && classifications.every((c) => c === "no_support");
const anyShapeB = stabilityRuns.some((r) => r.shapeBThisRun === true);

async function captureCommentary(label, statement, savedPair) {
  const result = await generateCommentary({
    statement: statement.text,
    verdict: "not_supported",
    hasConflict: false,
    primaryExcerpt: null,
    conflictExcerpt: null,
    sourceExplanations: [
      {
        classification: savedPair?.classification ?? "no_support",
        explanation: savedPair?.explanation ?? "",
      },
    ],
    traceId: `b154-commentary-${label}`,
    statementIndex: statement.index,
  });
  billed = roundUsd(billed + (Number(result.costUsd) || 0));
  const labels = displayLabels("not_supported");
  return {
    statementIndex: statement.index,
    statement: statement.text,
    productionVerdict: "not_supported",
    productionHasConflict: false,
    productionPrimaryExcerpt: null,
    sourceExplanations: [
      {
        classification: savedPair?.classification ?? "no_support",
        explanation: savedPair?.explanation ?? "",
      },
    ],
    preBackstopClassification: savedPair?.preBackstopClassification ?? null,
    commentary: result.commentary,
    commentaryCostUsd: result.costUsd,
    userFacing: {
      badge: labels.badge,
      line: labels.line,
      commentary: result.commentary,
    },
  };
}

const commentaryS8 = await captureCommentary("s8", firstClose, savedS8);
if (billed >= COST_CEILING_USD) {
  console.error(`STOP: billed $${billed} at or above $${COST_CEILING_USD} after S8 commentary`);
  process.exit(1);
}
const commentaryS7 = await captureCommentary("s7", comparative, savedS7);

const out = {
  capturedAt: new Date().toISOString(),
  billedUsd: billed,
  costCeilingUsd: COST_CEILING_USD,
  doing,
  b1: {
    design: doing.b1,
    runs: stabilityRuns,
    classifications,
    stableClean: allNoSupport,
    falseGreenAppeared: anyShapeB,
    stoppedEarly: stabilityRuns.length < STABILITY_RUNS,
    priorExhibitClassification: savedS7?.classification ?? null,
  },
  b2: {
    firstClose: commentaryS8,
    comparatives: commentaryS7,
  },
};

await writeFile(path.join(__dirname, "stability.json"), `${JSON.stringify(out.b1, null, 2)}\n`);
await writeFile(path.join(__dirname, "commentary.json"), `${JSON.stringify(out.b2, null, 2)}\n`);
await writeFile(path.join(__dirname, "part-b-summary.json"), `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify({ billedUsd: billed, b1: out.b1, b2Preview: {
  s8Badge: commentaryS8.userFacing.badge,
  s8Commentary: commentaryS8.commentary,
  s7Commentary: commentaryS7.commentary,
} }, null, 2));
await flushObservability();
