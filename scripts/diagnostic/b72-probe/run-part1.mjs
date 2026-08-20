#!/usr/bin/env node
/**
 * B72 Part 1: prove the false percent force on CURRENT extractPercents.
 * Does not change pipeline code. Live Stage 2 for this fixture only.
 *
 * Usage:
 *   node scripts/diagnostic/b72-probe/run-part1.mjs
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import { loadLocalEnvFiles } from "../lib/env.mjs";
import { DIAG_ROOT } from "../lib/paths.mjs";

loadLocalEnvFiles();

const PROBE_DIR = path.join(DIAG_ROOT, "b72-probe");

const { extractStatements } = await import("../../../lib/qc/pipeline-v4/stage1-extract-statements.mjs");
const {
  matchAllSources,
  collectBackstopFigures,
  hasEgregiousMagnitudeGap,
} = await import("../../../lib/qc/pipeline-v4/stage2-match-sources.mjs");
const { createTraceId, startTrace, flushObservability } = await import("../../../lib/observability.js");
const { beginCacheRun, endCacheRun, logCacheRunSummary, getLlmCacheStore } = await import(
  "../../../lib/qc/llm-cache.mjs"
);

function keysOf(text) {
  return collectBackstopFigures(text)
    .filter((f) => f.kind === "percent")
    .map((f) => ({
      raw: f.raw,
      value: f.value,
      keys: Array.isArray(f.keys) ? f.keys : [],
      metric: f.metric || null,
    }));
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is required");
    process.exit(1);
  }

  const store = getLlmCacheStore();
  console.log("# B72 Part 1 (current main, before extractor change)");
  console.log(`store.kind=${store?.kind} path=${store?.filePath || ""}`);

  const draft = await readFile(path.join(PROBE_DIR, "draft.txt"), "utf8");
  const sourceText = await readFile(path.join(PROBE_DIR, "source_ebitda_margin.txt"), "utf8");
  const sources = [{ text: sourceText, label: "EBITDA margin note" }];

  const stmtFigs = keysOf(draft);
  const srcFigs = keysOf(sourceText);
  console.log("");
  console.log("## Key bags (current extractPercents)");
  console.log(`draft figures: ${JSON.stringify(stmtFigs)}`);
  console.log(`source figures: ${JSON.stringify(srcFigs)}`);
  console.log(`hasEgregiousMagnitudeGap=${hasEgregiousMagnitudeGap(draft.trim(), sourceText)}`);

  const traceId = createTraceId();
  startTrace({
    traceId,
    traceName: "b72-part1-probe",
    metadata: { pipelineRoute: "v4", runStartedAt: new Date().toISOString() },
  });
  console.log(`langfuseTrace=${traceId}`);

  beginCacheRun({ recordEvents: false });
  const stage1 = await extractStatements({ draftText: draft, traceId });
  const statements = Array.isArray(stage1?.statements) ? stage1.statements : [];
  const matched = await matchAllSources({ statements, sources, traceId });
  const matches = Array.isArray(matched?.matches) ? matched.matches : [];
  const cacheSummary = endCacheRun();
  logCacheRunSummary(cacheSummary, "b72-part1");
  await flushObservability();

  console.log("");
  console.log("## Stage 2 pairs");
  for (const stmt of statements) {
    const text = typeof stmt?.text === "string" ? stmt.text : "";
    const rowMatches = matches.filter((m) => Number(m.statementIndex) === Number(stmt.index));
    for (const m of rowMatches) {
      const passage = typeof m.passage === "string" ? m.passage : "";
      const gap = hasEgregiousMagnitudeGap(text, passage);
      console.log(`S${stmt.index} x ${m.sourceLabel}`);
      console.log(`  statement=${JSON.stringify(text)}`);
      console.log(`  classification=${m.classification}`);
      console.log(`  passage=${JSON.stringify(passage)}`);
      console.log(`  explanation=${JSON.stringify(m.explanation || "")}`);
      console.log(`  stmtFigs=${JSON.stringify(keysOf(text))}`);
      console.log(`  srcFigs=${JSON.stringify(keysOf(passage))}`);
      console.log(`  backstopForced=${gap}`);
      console.log(`  costUsd=${m.costUsd}`);
    }
  }
  console.log(`stage1CostUsd=${stage1?.costUsd}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
