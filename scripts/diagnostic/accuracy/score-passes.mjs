#!/usr/bin/env node
/**
 * Score run 1 against labels.json. Compare run 2 only for stability.
 *
 *   node scripts/diagnostic/accuracy/score-passes.mjs \
 *     --labels labels.json --manifest sample-manifest.json \
 *     --run1 runs/evidence-pass-1/cards.json \
 *     --run2 runs/evidence-pass-2/cards.json
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  formatScoreReport,
  joinKey,
  mapDisplayVerdict,
  scoreAccuracy,
} from "./lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const F05_5_NEEDLE = "Halden Group will support continued growth";

function runningAsMain() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(path.resolve(entry)).href;
  } catch {
    return false;
  }
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith("--") && argv[i + 1]) {
      out[argv[i].slice(2)] = argv[++i];
    }
  }
  return out;
}

function keysFromManifest(manifest, side) {
  const rows = side === "A" ? manifest.groupA : manifest.groupB;
  return new Set((rows || []).map((r) => joinKey(r.fixtureId, r.statementText, r.occurrence)));
}

function cardMap(cards) {
  const m = new Map();
  for (const c of cards) {
    m.set(joinKey(c.fixtureId, c.statement ?? c.text, c.occurrence), c);
  }
  return m;
}

export function stabilityOf100(labels, cards1, cards2) {
  const m1 = cardMap(cards1);
  const m2 = cardMap(cards2);
  const moved = [];
  let same = 0;
  let missing = 0;
  for (const row of labels) {
    const key = joinKey(row.fixtureId, row.statementText, row.occurrence);
    const a = m1.get(key);
    const b = m2.get(key);
    if (!a || !b) {
      missing += 1;
      moved.push({
        fixtureId: row.fixtureId,
        statementText: row.statementText,
        run1: a ? mapDisplayVerdict(a.displayVerdict) : null,
        run2: b ? mapDisplayVerdict(b.displayVerdict) : null,
        missing: true,
      });
      continue;
    }
    const v1 = mapDisplayVerdict(a.displayVerdict);
    const v2 = mapDisplayVerdict(b.displayVerdict);
    if (v1 === v2) same += 1;
    else {
      moved.push({
        fixtureId: row.fixtureId,
        statementText: row.statementText,
        run1: v1,
        run2: v2,
        run1Raw: a.displayVerdict,
        run2Raw: b.displayVerdict,
      });
    }
  }
  return { same, moved, missing, n: labels.length };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const labelsDoc = JSON.parse(await readFile(path.resolve(args.labels), "utf8"));
  const manifest = JSON.parse(await readFile(path.resolve(args.manifest), "utf8"));
  const run1 = JSON.parse(await readFile(path.resolve(args.run1), "utf8"));
  const run2 = JSON.parse(await readFile(path.resolve(args.run2), "utf8"));
  const labels = labelsDoc.labels;
  const stab = stabilityOf100(labels, run1.cards, run2.cards);
  console.log("STABILITY");
  console.log(`  same=${stab.same}/${stab.n} moved=${stab.moved.length} missing=${stab.missing}`);
  for (const m of stab.moved) {
    console.log(`  MOVED F${m.fixtureId} ${m.run1} -> ${m.run2}${m.missing ? " (missing card)" : ""}`);
    console.log(`    ${m.statementText}`);
  }
  const groupAKeys = keysFromManifest(manifest, "A");
  const groupBKeys = keysFromManifest(manifest, "B");
  const scored = scoreAccuracy({
    labels,
    cards: run1.cards,
    groupAKeys,
    groupBKeys,
  });
  console.log("SCORE RUN 1");
  console.log(`  run1 costUsd=${run1.costUsd} run2 costUsd=${run2.costUsd}`);
  console.log(formatScoreReport(scored));
  const f05 = scored.groupA.disagreements.concat(scored.groupB.disagreements).find((d) =>
    String(d.statementText || "").includes(F05_5_NEEDLE)
  );
  if (f05) {
    console.log(
      "KNOWN ITEM F05.5: labelled X under the severity rule. A pipeline not_supported reading is defensible. Do not treat as a silent hard miss."
    );
    console.log(`  pipeline=${f05.pipelineMapped} displayVerdict=${f05.pipelineDisplayVerdict}`);
  }
  if (stab.moved.length > 0) {
    console.log("RUN 2 WOULD HAVE PRODUCED");
    const alt = scoreAccuracy({
      labels,
      cards: run2.cards,
      groupAKeys,
      groupBKeys,
    });
    console.log(
      `  Group A rate=${alt.groupA.rate} n=${alt.groupA.n}  Group B rate=${alt.groupB.rate} n=${alt.groupB.n}`
    );
  }
}

void __dirname;

if (runningAsMain()) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
