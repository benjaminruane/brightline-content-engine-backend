#!/usr/bin/env node
/**
 * Stage 1 only. Default fixtures 01-20. Cache off. No Stage 1b.
 *
 *   node scripts/diagnostic/accuracy/extract-stage1.mjs --stability-gate --out path.json
 *   node scripts/diagnostic/accuracy/extract-stage1.mjs --out path.json
 *   node scripts/diagnostic/accuracy/extract-stage1.mjs --ids 01,03,05 --out path.json
 *
 * Stability gate (locked before the run): mismatched statement slots across
 * two cache-off extracts must be <= STABILITY_MISMATCH_THRESHOLD (5).
 * Freeze run 1 to --out on pass. Never writes the corpus 1 P29 files.
 * Cost ceiling $1 for both passes.
 */

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { loadLocalEnvFiles } from "../lib/env.mjs";
import { filterFixtures, loadAllFixtures, parseIdsArg } from "../lib/fixtures.mjs";
import {
  STABILITY_MISMATCH_THRESHOLD,
  addOccurrenceIndices,
  assertNotP29ProtectedWrite,
  countMismatchedSlots,
  normalizeStatementText,
  padFixtureId,
  writeAccuracyFile,
} from "./lib.mjs";

export {
  P29_PROTECTED_NAMES,
  assertNotP29ProtectedWrite,
  p29ProtectedPaths,
} from "./lib.mjs";

const COST_CEILING_USD = 1;
export const RANGE = { from: "01", to: "20" };

export function parseExtractArgs(argv) {
  const out = { ids: [], out: null, stabilityGate: false };
  const args = Array.isArray(argv) ? argv : [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--ids" && args[i + 1]) {
      out.ids = parseIdsArg(args[++i]);
    } else if (args[i] === "--out" && args[i + 1]) {
      out.out = args[++i];
    } else if (args[i] === "--stability-gate") {
      out.stabilityGate = true;
    }
  }
  return out;
}

export function extractFilterFromArgs(args) {
  if (Array.isArray(args?.ids) && args.ids.length > 0) return { ids: args.ids };
  return { range: RANGE };
}

export function filterLabel(filter) {
  if (Array.isArray(filter?.ids) && filter.ids.length > 0) {
    return filter.ids.map((id) => padFixtureId(id)).join(",");
  }
  if (filter?.range) return `${filter.range.from}-${filter.range.to}`;
  return "01-20";
}

/**
 * New freezes only. Does not read or re-validate the corpus 1 freeze.
 */
export function assertNoIntraFixtureNormalizedDuplicates(freezeDoc) {
  const fixtures = Array.isArray(freezeDoc?.fixtures) ? freezeDoc.fixtures : [];
  const dups = [];
  for (const fx of fixtures) {
    const counts = new Map();
    for (const s of Array.isArray(fx.statements) ? fx.statements : []) {
      const norm = normalizeStatementText(s?.text);
      if (!norm) continue;
      counts.set(norm, (counts.get(norm) || 0) + 1);
    }
    for (const [text, count] of counts) {
      if (count > 1) {
        dups.push({ fixtureId: padFixtureId(fx.fixtureId), text, count });
      }
    }
  }
  if (dups.length > 0) {
    const detail = dups.map((d) => `F${d.fixtureId} ${JSON.stringify(d.text)}`).join("; ");
    throw new Error(
      `Freeze has duplicate normalised statement text within a fixture: ${detail}`
    );
  }
}

function unfrozenCompanion(outPath, tag) {
  const parsed = path.parse(path.resolve(outPath));
  return path.join(parsed.dir, `${parsed.name}-${tag}${parsed.ext || ".json"}`);
}

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

export async function extractRange({ extractStatements, fixtures, filter }) {
  const applied = filter && typeof filter === "object" ? filter : { range: RANGE };
  const selected = filterFixtures(fixtures, applied);
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
    range: filterLabel(applied),
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
    range: run1.range ?? "01-20",
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
  await writeAccuracyFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
  const args = parseExtractArgs(process.argv.slice(2));
  if (!args.out) {
    throw new Error(
      "statements.json is P29-protected and corpus 1 is closed. Pass --out <path>. Every write requires an explicit --out."
    );
  }
  const outPath = path.resolve(args.out);
  assertNotP29ProtectedWrite(outPath);
  const filter = extractFilterFromArgs(args);

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

  const fixtures = await loadAllFixtures();

  if (!args.stabilityGate) {
    const run = await extractRange({ extractStatements, fixtures, filter });
    await writeJson(outPath, run);
    console.log(`wrote ${outPath} costUsd=${run.costUsd.toFixed(4)}`);
    return;
  }

  console.log(
    `stability gate: two cache-off extracts, fail if mismatched slots > ${STABILITY_MISMATCH_THRESHOLD}`
  );
  console.log("run 1");
  const run1 = await extractRange({ extractStatements, fixtures, filter });
  console.log(`run 1 costUsd=${run1.costUsd.toFixed(4)}`);
  const remaining = COST_CEILING_USD - run1.costUsd;
  if (remaining <= 0) {
    throw new Error(
      `Run 1 cost ${run1.costUsd.toFixed(4)} used the $1 ceiling. Not starting run 2.`
    );
  }
  console.log("run 2");
  const run2 = await extractRange({ extractStatements, fixtures, filter });
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
    const run1Path = unfrozenCompanion(outPath, "run1-unfrozen");
    const run2Path = unfrozenCompanion(outPath, "run2-unfrozen");
    await writeJson(run1Path, run1);
    await writeJson(run2Path, run2);
    console.error("STABILITY GATE FAILED. Not freezing. Not continuing.");
    process.exit(1);
  }

  const frozen = freezeRun1(run1, run2, comparison);
  assertNoIntraFixtureNormalizedDuplicates(frozen);
  await writeJson(outPath, frozen);
  console.log(`STABILITY GATE PASSED. froze ${outPath} from run 1`);
}

if (runningAsMain()) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
