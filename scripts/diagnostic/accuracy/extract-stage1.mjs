#!/usr/bin/env node
/**
 * Stage 1 only, fixtures 01-20. Cache off. No Stage 1b.
 *
 *   node scripts/diagnostic/accuracy/extract-stage1.mjs --stability-gate
 *   node scripts/diagnostic/accuracy/extract-stage1.mjs --out path.json
 *
 * Stability gate (locked before the run): mismatched statement slots across
 * two cache-off extracts must be <= STABILITY_MISMATCH_THRESHOLD (5).
 * Freeze run 1 as statements.json on pass. Cost ceiling $1 for both passes.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { loadLocalEnvFiles } from "../lib/env.mjs";
import { filterFixtures, loadAllFixtures } from "../lib/fixtures.mjs";
import {
  STABILITY_MISMATCH_THRESHOLD,
  addOccurrenceIndices,
  countMismatchedSlots,
  padFixtureId,
} from "./lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COST_CEILING_USD = 1;
const RANGE = { from: "01", to: "20" };

function runningAsMain() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(path.resolve(entry)).href;
  } catch {
    return false;
  }
}

export function buildFixtureRecord(fixture, stage1) {
  const fixtureId = padFixtureId(fixture.data.id);
  const raw = Array.isArray(stage1?.statements) ? stage1.statements : [];
  const withOcc = addOccurrenceIndices(
    raw.map((s, i) => ({
      fixtureId,
      text: typeof s?.text === "string" ? s.text : "",
      index: Number.isFinite(s?.index) ? s.index : i,
      charStart: Number.isFinite(s?.charStart) ? s.charStart : null,
      charEnd: Number.isFinite(s?.charEnd) ? s.charEnd : null,
    }))
  );
  return {
    fixtureId,
    label: fixture.data.label ?? "",
    source: stage1?.source ?? "unknown",
    costUsd: Number(stage1?.costUsd) || 0,
    usage: stage1?.usage ?? null,
    errors: Array.isArray(stage1?.errors) ? stage1.errors : [],
    statements: withOcc.map((s) => ({
      index: s.index,
      text: s.text,
      charStart: s.charStart,
      charEnd: s.charEnd,
      occurrence: s.occurrence,
    })),
  };
}

export async function extractRange({ extractStatements, fixtures }) {
  const selected = filterFixtures(fixtures, { range: RANGE });
  const records = [];
  let costUsd = 0;
  for (const fixture of selected) {
    const draft = typeof fixture.data.draft === "string" ? fixture.data.draft : "";
    const stage1 = await extractStatements({ draftText: draft });
    const rec = buildFixtureRecord(fixture, stage1);
    costUsd += rec.costUsd;
    records.push(rec);
    console.log(
      `F${rec.fixtureId} ${rec.label} statements=${rec.statements.length} source=${rec.source} costUsd=${rec.costUsd.toFixed(4)}`
    );
    if (costUsd > COST_CEILING_USD) {
      throw new Error(
        `Stage 1 cost ${costUsd.toFixed(4)} exceeded the accepted $1 ceiling. Stopping.`
      );
    }
  }
  return {
    extractedAt: new Date().toISOString(),
    range: "01-20",
    stage1b: false,
    cache: "off",
    costUsd,
    fixtures: records,
  };
}

export function freezeRun1(run1, run2, comparison) {
  const counts = {};
  for (const f of run1.fixtures) counts[f.fixtureId] = f.statements.length;
  return {
    extractedAt: run1.extractedAt,
    range: "01-20",
    stage1b: false,
    cache: "off",
    frozenFrom: "run1",
    stability: {
      threshold: STABILITY_MISMATCH_THRESHOLD,
      mismatchedSlots: comparison.mismatchedSlots,
      passed: comparison.mismatchedSlots <= STABILITY_MISMATCH_THRESHOLD,
      diffs: comparison.diffs,
      run1CostUsd: run1.costUsd,
      run2CostUsd: run2.costUsd,
      totalCostUsd: (Number(run1.costUsd) || 0) + (Number(run2.costUsd) || 0),
    },
    costUsd: run1.costUsd,
    perFixtureCounts: counts,
    fixtures: run1.fixtures,
  };
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main() {
  loadLocalEnvFiles({ liveMeasurement: true });
  process.env.QC_LLM_CACHE = "0";
  delete process.env.QC_LLM_CACHE_DISK;

  const { extractStatements } = await import("../../../lib/qc/pipeline-v4/stage1-extract-statements.mjs");
  const { isLlmCacheEnabled } = await import("../../../lib/qc/llm-cache.mjs");
  const { hasProviderApiKey } = await import("../../../lib/observability.js");
  const { STAGE_MODELS } = await import("../../../lib/qc/model-config.mjs");

  if (isLlmCacheEnabled()) {
    throw new Error("QC_LLM_CACHE must be off for the accuracy extract");
  }
  const stageModel = STAGE_MODELS["stage1-splitting"];
  if (!stageModel || !hasProviderApiKey(stageModel.provider)) {
    throw new Error("OPENAI_API_KEY is required for Stage 1 extract");
  }

  const argv = process.argv.slice(2);
  const outIdx = argv.indexOf("--out");
  const freezePath = path.join(__dirname, "statements.json");

  const fixtures = await loadAllFixtures();

  if (outIdx >= 0 && argv[outIdx + 1]) {
    const run = await extractRange({ extractStatements, fixtures });
    await writeJson(path.resolve(argv[outIdx + 1]), run);
    console.log(`wrote ${argv[outIdx + 1]} costUsd=${run.costUsd.toFixed(4)}`);
    return;
  }

  console.log(
    `stability gate: two cache-off extracts, fail if mismatched slots > ${STABILITY_MISMATCH_THRESHOLD}`
  );
  console.log("run 1");
  const run1 = await extractRange({ extractStatements, fixtures });
  console.log(`run 1 costUsd=${run1.costUsd.toFixed(4)}`);
  const remaining = COST_CEILING_USD - run1.costUsd;
  if (remaining <= 0) {
    throw new Error(
      `Run 1 cost ${run1.costUsd.toFixed(4)} used the $1 ceiling. Not starting run 2.`
    );
  }
  console.log("run 2");
  const run2 = await extractRange({ extractStatements, fixtures });
  console.log(`run 2 costUsd=${run2.costUsd.toFixed(4)}`);
  const total = run1.costUsd + run2.costUsd;
  console.log(`total costUsd=${total.toFixed(4)}`);
  if (total > COST_CEILING_USD) {
    console.warn(`WARNING: total ${total.toFixed(4)} exceeded the $1 ceiling after the fact`);
  }

  const comparison = countMismatchedSlots(run1, run2);
  console.log(`mismatchedSlots=${comparison.mismatchedSlots} threshold=${STABILITY_MISMATCH_THRESHOLD}`);
  for (const d of comparison.diffs) {
    console.log(`  DIFF F${d.fixtureId}[${d.index}]`);
    console.log(`    run1: ${JSON.stringify(d.run1)}`);
    console.log(`    run2: ${JSON.stringify(d.run2)}`);
  }
  for (const f of run1.fixtures) {
    const f2 = run2.fixtures.find((x) => x.fixtureId === f.fixtureId);
    console.log(
      `count F${f.fixtureId} run1=${f.statements.length} run2=${f2 ? f2.statements.length : "missing"} source1=${f.source}`
    );
  }

  if (comparison.mismatchedSlots > STABILITY_MISMATCH_THRESHOLD) {
    await writeJson(path.join(__dirname, "statements-run1-unfrozen.json"), run1);
    await writeJson(path.join(__dirname, "statements-run2-unfrozen.json"), run2);
    console.error("STABILITY GATE FAILED. Not freezing statements.json. Not continuing.");
    process.exit(1);
  }

  const frozen = freezeRun1(run1, run2, comparison);
  await writeJson(freezePath, frozen);
  console.log(`STABILITY GATE PASSED. froze ${freezePath} from run 1`);
}

if (runningAsMain()) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
