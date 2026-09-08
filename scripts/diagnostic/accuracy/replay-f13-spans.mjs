#!/usr/bin/env node
/**
 * Diagnostic: one Stage 2 pair plus one widened pair for F13 statement index 7.
 * Cache off. Ceiling USD 1. Persists supportSpans in full.
 *
 *   node scripts/diagnostic/accuracy/replay-f13-spans.mjs
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { loadLocalEnvFiles } from "../lib/env.mjs";
import { loadAllFixtures, filterFixtures } from "../lib/fixtures.mjs";
import { loadPipelineSources } from "../lib/sources.mjs";
import { padFixtureId } from "./lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CEILING_USD = 1;
const STATEMENT_INDEX = 7;
const STATEMENT_TEXT =
  "The Company employs 320 people across offices in London, Hamburg, Lisbon, and Bangalore.";
const NEEDLE_285 = "total team of 285 people";

function runningAsMain() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(path.resolve(entry)).href;
  } catch {
    return false;
  }
}

function tokensFromChars(chars) {
  return Math.ceil(Math.max(0, Number(chars) || 0) / 4);
}

function estimateUsd(inputChars, outputChars) {
  const input = 2.5;
  const output = 10;
  return (tokensFromChars(inputChars) / 1e6) * input + (tokensFromChars(outputChars) / 1e6) * output;
}

function mentions285(passage) {
  const t = String(passage || "");
  return /285/.test(t) && /people|team|staff|employees/i.test(t);
}

async function main() {
  loadLocalEnvFiles({ liveMeasurement: true });
  process.env.QC_LLM_CACHE = "0";
  delete process.env.QC_LLM_CACHE_DISK;

  const { matchAllSources } = await import("../../../lib/qc/pipeline-v4/stage2-match-sources.mjs");
  const { matchMultipassagePair, buildSupportSpans } = await import(
    "../../../lib/qc/pipeline-v4/stage2-match-multipassage.mjs"
  );
  const { isLlmCacheEnabled } = await import("../../../lib/qc/llm-cache.mjs");
  const { flushObservability, hasProviderApiKey, calculateLlmCostUsd } = await import(
    "../../../lib/observability.js"
  );
  const { STAGE_MODELS } = await import("../../../lib/qc/model-config.mjs");

  if (isLlmCacheEnabled()) throw new Error("QC_LLM_CACHE must be off");
  if (!hasProviderApiKey(STAGE_MODELS["stage2-matching"]?.provider)) {
    throw new Error("OPENAI_API_KEY required");
  }

  const fixtures = filterFixtures(await loadAllFixtures(), { range: { from: "13", to: "13" } });
  const fixture = fixtures[0];
  if (!fixture) throw new Error("Fixture 13 not found");
  const sources = await loadPipelineSources(fixture.data.sources || []);
  if (sources.length !== 1) {
    throw new Error(`Expected one F13 source, got ${sources.length}`);
  }
  const sourceText = sources[0].text;
  const sourceLabel = sources[0].label;

  const stage2Prompt = await readFile(
    path.join(__dirname, "../../../lib/qc/pipeline-v4/prompts/stage2_v4.md"),
    "utf8"
  );
  const widenedPrompt = await readFile(
    path.join(__dirname, "../../../lib/qc/pipeline-v4/prompts/stage2_v4_multipassage.md"),
    "utf8"
  );

  const userChars = STATEMENT_TEXT.length + sourceText.length + 80;
  const estimateStage2 = estimateUsd(stage2Prompt.length + userChars, 400);
  const estimateWidened = estimateUsd(widenedPrompt.length + userChars, 800);
  const estimateTotal = estimateStage2 + estimateWidened;
  console.log(
    `preflight estimateUsd=${estimateTotal.toFixed(4)} stage2=${estimateStage2.toFixed(4)} widened=${estimateWidened.toFixed(4)} ceiling=${CEILING_USD}`
  );
  if (estimateTotal > CEILING_USD) {
    throw new Error(
      `Preflight estimate ${estimateTotal.toFixed(4)} exceeds ceiling ${CEILING_USD}. Stopping.`
    );
  }

  const statements = [
    {
      index: STATEMENT_INDEX,
      text: STATEMENT_TEXT,
      charStart: 0,
      charEnd: STATEMENT_TEXT.length,
      attempt: "frozen",
    },
  ];

  const stage2Result = await matchAllSources({
    statements,
    sources,
    traceId: "f13-spans-replay",
    stage2SpanEnabled: false,
  });
  const stage2Match = Array.isArray(stage2Result?.matches) ? stage2Result.matches[0] : null;
  if (!stage2Match) throw new Error("Stage 2 returned no match");
  const stage2Cost = Number(stage2Match.costUsd) || 0;
  console.log(
    `stage2 classification=${stage2Match.classification} costUsd=${stage2Cost.toFixed(4)} passageChars=${String(stage2Match.passage || "").length}`
  );
  if (stage2Cost > CEILING_USD) {
    throw new Error(`Stage 2 spent ${stage2Cost.toFixed(4)} which exceeds ceiling ${CEILING_USD}. Stopping.`);
  }

  const widenedRows = await matchMultipassagePair({
    statementText: STATEMENT_TEXT,
    sourceText,
    statementIndex: STATEMENT_INDEX,
    sourceIndex: 0,
    sourceLabel,
    traceId: "f13-spans-replay",
  });
  await flushObservability();

  const widenedWithIndex = (Array.isArray(widenedRows) ? widenedRows : []).map((row) => ({
    sourceIndex: 0,
    sourceLabel,
    passage: typeof row?.passage === "string" ? row.passage : "",
    classification: typeof row?.classification === "string" ? row.classification : "no_support",
    costUsd: Number(row?.costUsd) || 0,
  }));
  const supportSpans = buildSupportSpans(widenedWithIndex, {
    statementIndex: STATEMENT_INDEX,
    sources,
  });

  const widenedCost = widenedWithIndex.reduce((sum, row) => Math.max(sum, Number(row.costUsd) || 0), 0);
  const spent = stage2Cost + widenedCost;
  console.log(
    `widened spansRaw=${widenedWithIndex.length} costUsd=${widenedCost.toFixed(4)} spent=${spent.toFixed(4)}`
  );
  if (spent > CEILING_USD) {
    console.error(`Spent ${spent.toFixed(4)} which exceeds ceiling ${CEILING_USD}. Persisting and stopping.`);
  }

  const spans285 = supportSpans.filter((s) => mentions285(s.passage) || String(s.passage || "").includes("285"));
  const needleHit = supportSpans.filter((s) => String(s.passage || "").includes(NEEDLE_285));

  const payload = {
    fixtureId: padFixtureId("13"),
    statementIndex: STATEMENT_INDEX,
    statement: STATEMENT_TEXT,
    cache: "off",
    ceilingUsd: CEILING_USD,
    estimateUsd: estimateTotal,
    costUsd: {
      stage2Actual: stage2Cost,
      widenedActual: widenedCost,
      combined: spent,
    },
    extractedAt: new Date().toISOString(),
    stage2: {
      classification: stage2Match.classification,
      passage: stage2Match.passage,
      explanation: stage2Match.explanation,
      costUsd: stage2Cost,
      usage: stage2Match.usage || null,
    },
    widenedRaw: widenedWithIndex,
    supportSpans,
    spansMentioning285: spans285.map((s) => ({
      classification: s.classification,
      passage: s.passage,
      start: s.start,
      end: s.end,
    })),
    spansWithVerbatimNeedle: needleHit.map((s) => ({
      classification: s.classification,
      passage: s.passage,
    })),
  };

  const outDir = path.join(__dirname, "runs", "f13-spans");
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "result.json");
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`wrote ${outPath} supportSpans=${supportSpans.length} spans285=${spans285.length} needle=${needleHit.length}`);
  for (const [i, span] of supportSpans.entries()) {
    console.log(
      `span[${i}] classification=${span.classification} start=${span.start} end=${span.end} passage=${JSON.stringify(span.passage)}`
    );
  }
  void calculateLlmCostUsd;
  if (spent > CEILING_USD) process.exit(1);
}

if (runningAsMain()) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
