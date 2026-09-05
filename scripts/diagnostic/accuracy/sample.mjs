#!/usr/bin/env node
/**
 * Draw Group B = 100 - |A| from the non-A pool.
 * Seed 20260905. Weighted by per-fixture non-A statement count.
 * F15 capped at 6. No per-fixture floor.
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  F15_CAP,
  GROUP_A_HARD_CAP,
  LABEL_BUDGET,
  SAMPLE_SEED,
  flattenStatements,
  joinKey,
  mapGroupA,
  sampleGroupB,
} from "./lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function runningAsMain() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(path.resolve(entry)).href;
  } catch {
    return false;
  }
}

export async function buildSample({ statementsDoc, design }) {
  const statements = flattenStatements(statementsDoc);
  const mapped = mapGroupA(statements, design);
  if (mapped.failed.length > 0) {
    const detail = mapped.failed
      .map((f) => `${f.id} status=${f.status} matchCount=${f.matchCount}`)
      .join("; ");
    throw new Error(`Group A span failed to map to exactly one statement: ${detail}`);
  }
  if (mapped.groupA.length > GROUP_A_HARD_CAP) {
    throw new Error(
      `Group A mapping yielded ${mapped.groupA.length} statements, above the hard cap of ${GROUP_A_HARD_CAP}. Stop. Ben cuts the design file in writing before Group B is sampled.`
    );
  }
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

async function main() {
  const statementsDoc = JSON.parse(await readFile(path.join(__dirname, "statements.json"), "utf8"));
  const design = JSON.parse(await readFile(path.join(__dirname, "group-a-design.json"), "utf8"));
  const { mapped, manifest } = await buildSample({ statementsDoc, design });
  console.log(`Group A unique statements: ${mapped.groupA.length}`);
  for (const row of mapped.mapping) {
    console.log(`  ${row.id} ${row.status} matches=${row.matchCount}`);
  }
  console.log(`Group B: ${manifest.groupBCount} seed=${manifest.seed}`);
  console.log(`F15 B draw: ${manifest.weighting.drawnPerFixture["15"] || 0} cap=${F15_CAP}`);
  await writeFile(
    path.join(__dirname, "sample-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );
  console.log("wrote sample-manifest.json");
}

if (runningAsMain()) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
