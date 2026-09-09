#!/usr/bin/env node
/**
 * Draw Group B = 100 - |A| from the non-A pool.
 * Seed 20260905. Weighted by per-fixture non-A statement count.
 * F15 capped at 6. No per-fixture floor.
 *
 *   node scripts/diagnostic/accuracy/sample.mjs \
 *     --design path --statements path --out path [--group-a-cap 60]
 *
 * Defaults stay corpus 1. Writing those defaults is P29-refused.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  F15_CAP,
  GROUP_A_HARD_CAP,
  LABEL_BUDGET,
  SAMPLE_SEED,
  assertGroupAWithinCap,
  assertNotP29ProtectedWrite,
  flattenStatements,
  joinKey,
  mapGroupA,
  resolveGroupAHardCap,
  sampleGroupB,
  writeAccuracyFile,
} from "./lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const DEFAULT_STATEMENTS_PATH = path.join(__dirname, "statements.json");
export const DEFAULT_DESIGN_PATH = path.join(__dirname, "group-a-design.json");
export const DEFAULT_OUT_PATH = path.join(__dirname, "sample-manifest.json");

function runningAsMain() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(path.resolve(entry)).href;
  } catch {
    return false;
  }
}

export function parseSampleArgs(argv) {
  const out = { design: null, statements: null, out: null, groupACap: null };
  const args = Array.isArray(argv) ? argv : [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--design" && args[i + 1]) out.design = args[++i];
    else if (args[i] === "--statements" && args[i + 1]) out.statements = args[++i];
    else if (args[i] === "--out" && args[i + 1]) out.out = args[++i];
    else if (args[i] === "--group-a-cap" && args[i + 1]) out.groupACap = args[++i];
  }
  return out;
}

export async function buildSample({ statementsDoc, design, groupACap }) {
  const cap = resolveGroupAHardCap(groupACap ?? GROUP_A_HARD_CAP);
  const statements = flattenStatements(statementsDoc);
  const mapped = mapGroupA(statements, design);
  if (mapped.failed.length > 0) {
    const detail = mapped.failed
      .map((f) => `${f.id} status=${f.status} matchCount=${f.matchCount}`)
      .join("; ");
    throw new Error(`Group A span failed to map to exactly one statement: ${detail}`);
  }
  assertGroupAWithinCap(mapped.groupA.length, cap);
  const groupAKeys = mapped.groupA.map((s) => joinKey(s.fixtureId, s.text, s.occurrence));
  const targetB = LABEL_BUDGET - mapped.groupA.length;
  const sampled = sampleGroupB({
    statements,
    groupAKeys,
    seed: SAMPLE_SEED,
    targetCount: targetB,
    f15Cap: F15_CAP,
  });
  if (sampled.groupB.length !== targetB) {
    throw new Error(
      `Group B drew ${sampled.groupB.length}, expected ${targetB}. Pool may be too small.`
    );
  }
  const f15Drawn = sampled.drawnPerFixture["15"] || 0;
  if (f15Drawn > F15_CAP) {
    throw new Error(`F15 Group B draw ${f15Drawn} exceeds cap ${F15_CAP}`);
  }
  return {
    mapped,
    manifest: {
      seed: SAMPLE_SEED,
      labelBudget: LABEL_BUDGET,
      groupACount: mapped.groupA.length,
      groupBCount: sampled.groupB.length,
      groupAHardCap: cap,
      f15Cap: F15_CAP,
      perFixtureFloor: 0,
      weighting: {
        method: "hamilton-largest-remainder then F15 cap then cap-to-pool",
        weight: "non-A statement count per fixture",
        f15CapApplied: true,
        rawWeights: sampled.rawWeights,
        allocationBeforeCap: sampled.allocationBeforeCap,
        allocationAfterCap: sampled.allocationAfterCap,
        drawnPerFixture: sampled.drawnPerFixture,
        excessRedistributed: sampled.excessRedistributed,
        nonACount: sampled.nonACount,
      },
      groupA: mapped.groupA.map((s) => ({
        fixtureId: s.fixtureId,
        statementText: s.text,
        occurrence: s.occurrence,
        index: s.index,
        designIds: s.designIds,
      })),
      groupB: sampled.groupB.map((s) => ({
        fixtureId: s.fixtureId,
        statementText: s.text,
        occurrence: s.occurrence,
        index: s.index,
      })),
    },
  };
}

export async function writeSample({ statementsPath, designPath, outPath, groupACap }) {
  const resolvedOut = path.resolve(outPath);
  assertNotP29ProtectedWrite(resolvedOut);
  const statementsDoc = JSON.parse(await readFile(path.resolve(statementsPath), "utf8"));
  const design = JSON.parse(await readFile(path.resolve(designPath), "utf8"));
  const { mapped, manifest } = await buildSample({ statementsDoc, design, groupACap });
  await writeAccuracyFile(resolvedOut, `${JSON.stringify(manifest, null, 2)}\n`);
  return { mapped, manifest, outPath: resolvedOut };
}

async function main() {
  const args = parseSampleArgs(process.argv.slice(2));
  const statementsPath = args.statements
    ? path.resolve(args.statements)
    : DEFAULT_STATEMENTS_PATH;
  const designPath = args.design ? path.resolve(args.design) : DEFAULT_DESIGN_PATH;
  const outPath = args.out ? path.resolve(args.out) : DEFAULT_OUT_PATH;
  const { mapped, manifest } = await writeSample({
    statementsPath,
    designPath,
    outPath,
    groupACap: args.groupACap,
  });
  console.log(`Group A unique statements: ${mapped.groupA.length}`);
  for (const row of mapped.mapping) {
    console.log(`  ${row.id} ${row.status} matches=${row.matchCount}`);
  }
  console.log(`Group B: ${manifest.groupBCount} seed=${manifest.seed}`);
  console.log(`F15 B draw: ${manifest.weighting.drawnPerFixture["15"] || 0} cap=${F15_CAP}`);
  console.log(`wrote ${outPath}`);
}

if (runningAsMain()) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
