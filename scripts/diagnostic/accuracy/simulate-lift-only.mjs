#!/usr/bin/env node
/**
 * Free simulation of lift-only span voting over a stored evidence-pass cards.json.
 * No LLM. No spend.
 *
 *   node scripts/diagnostic/accuracy/simulate-lift-only.mjs \
 *     --cards scripts/diagnostic/accuracy/runs/evidence-pass-rt-1/cards.json
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { applyIntraSourceReducer } from "../../../lib/qc/pipeline-v4/intra-source-reducer.mjs";
import { aggregateVerdict } from "../../../lib/qc/pipeline-v4/stage3-aggregate-verdict.mjs";
import {
  joinKey,
  padFixtureId,
  scoreAccuracy,
  wilsonInterval,
} from "./lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PROTECTED = [
  { id: "F13 320", needle: "employs 320 people" },
  { id: "F18 380", needle: "serves 380 property" },
  { id: "F18 ARR from 38", needle: "ARR growth from EUR 38" },
];

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
  const out = {
    cards: path.join(__dirname, "runs/evidence-pass-rt-1/cards.json"),
    labels: path.join(__dirname, "labels.json"),
    manifest: path.join(__dirname, "sample-manifest.json"),
    design: path.join(__dirname, "group-a-design.json"),
  };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith("--") && argv[i + 1]) {
      out[argv[i].slice(2)] = argv[++i];
    }
  }
  return out;
}

function toDisplay(verdict) {
  if (verdict === "conflicting") return "conflict";
  if (verdict === "confirmed") return "supported_full";
  if (verdict === "partially_confirmed") return "supported_partial";
  if (verdict === "not_supported" || verdict === "no_support") return "not_supported";
  return verdict;
}

function fakeSources(card) {
  const by = new Map();
  for (const m of Array.isArray(card.sourceMatches) ? card.sourceMatches : []) {
    const i = Number(m.sourceIndex);
    if (!Number.isFinite(i)) continue;
    by.set(i, `${by.get(i) || ""}\n${typeof m.passage === "string" ? m.passage : ""}`);
  }
  for (const s of Array.isArray(card.supportSpans) ? card.supportSpans : []) {
    const i = Number.isFinite(Number(s.sourceRefId)) ? Number(s.sourceRefId) : Number(s.sourceIndex);
    if (!Number.isFinite(i)) continue;
    by.set(i, `${by.get(i) || ""}\n${typeof s.passage === "string" ? s.passage : ""}`);
  }
  const max = by.size ? Math.max(...by.keys()) : -1;
  const sources = [];
  for (let i = 0; i <= max; i += 1) {
    sources[i] = { text: by.get(i) || "" };
  }
  return sources;
}

function simulateCard(card) {
  const sourceMatches = Array.isArray(card.sourceMatches) ? card.sourceMatches : [];
  const reduced = applyIntraSourceReducer({
    sourceMatches,
    supportSpans: card.supportSpans,
    sources: fakeSources(card),
    statementText: typeof card.statement === "string" ? card.statement : "",
  });
  const agg = aggregateVerdict({ statementMatches: reduced });
  return {
    ...card,
    displayVerdict: toDisplay(agg.verdict),
    hasConflict: agg.hasConflict === true,
    reducedMatches: reduced,
  };
}

function findCard(cards, needle) {
  return cards.find((c) => String(c.statement || "").includes(needle));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const run = JSON.parse(await readFile(path.resolve(args.cards), "utf8"));
  const labelsDoc = JSON.parse(await readFile(path.resolve(args.labels), "utf8"));
  const manifest = JSON.parse(await readFile(path.resolve(args.manifest), "utf8"));
  const design = JSON.parse(await readFile(path.resolve(args.design), "utf8"));

  const simulated = (Array.isArray(run.cards) ? run.cards : []).map(simulateCard);
  const groupAKeys = new Set(
    (manifest.groupA || []).map((r) => joinKey(r.fixtureId, r.statementText, r.occurrence))
  );
  const groupBKeys = new Set(
    (manifest.groupB || []).map((r) => joinKey(r.fixtureId, r.statementText, r.occurrence))
  );
  const scored = scoreAccuracy({
    labels: labelsDoc.labels,
    cards: simulated,
    groupAKeys,
    groupBKeys,
  });

  const catchN = scored.groupA.agreements;
  const catchW = wilsonInterval(catchN, 11);
  const leave = scored.groupB.amongBenConfirmed;

  console.log(`cards=${simulated.length} unmatchedLabels=${scored.unmatchedLabels.length}`);
  console.log(`CATCH ${catchN} of 11 wilson95=[${catchW.low.toFixed(4)}, ${catchW.high.toFixed(4)}]`);
  console.log(
    `LEAVE-ALONE ${leave.pipelineAlsoConfirmed} of ${leave.n} = ${
      leave.n ? ((100 * leave.pipelineAlsoConfirmed) / leave.n).toFixed(2) : "n/a"
    }%`
  );

  let protectedMoved = false;
  console.log("PROTECTED CATCHES");
  for (const row of PROTECTED) {
    const orig = findCard(run.cards, row.needle);
    const sim = findCard(simulated, row.needle);
    const origV = orig?.displayVerdict;
    const simV = sim?.displayVerdict;
    const moved = origV === "conflict" && simV !== "conflict" && simV !== "conflicting";
    if (moved) protectedMoved = true;
    console.log(`  ${row.id} stored=${origV} sim=${simV}${moved ? " MOVED" : ""}`);
  }

  for (const needle of [
    "Total Company revenue grew from SEK 4.2",
    "own-brand share has grown from 38%",
    "approximately 19 percent",
    "compound annual rate of 17%",
  ]) {
    const orig = findCard(run.cards, needle);
    const sim = findCard(simulated, needle);
    console.log(`WATCH ${needle.slice(0, 40)} stored=${orig?.displayVerdict} sim=${sim?.displayVerdict}`);
  }

  function planted(card) {
    return (design.faults || []).some(
      (f) =>
        padFixtureId(f.fixtureId) === padFixtureId(card.fixtureId) &&
        String(card.statement || "").includes(f.span)
    );
  }
  const nonPlantedRed = simulated.filter((card) => {
    if (card.displayVerdict !== "conflict" && card.displayVerdict !== "conflicting") return false;
    if (planted(card)) return false;
    const bySrc = new Map();
    for (const m of card.sourceMatches || []) bySrc.set(Number(m.sourceIndex), m.classification);
    return (card.supportSpans || []).some((s) => {
      const pick = bySrc.get(Number(s.sourceRefId));
      return pick === "confirmed" && s.classification === "conflicting";
    });
  });
  console.log(`NON-PLANTED intra confirm-plus-conflict displayed red: ${nonPlantedRed.length}`);
  for (const c of nonPlantedRed) {
    console.log(`  F${padFixtureId(c.fixtureId)} ${String(c.statement).slice(0, 90)}`);
  }

  if (protectedMoved) {
    console.error("PROTECTED CATCH MOVED. Not spending.");
    process.exit(2);
  }
  if (catchN !== 9) {
    console.error(`CATCH is ${catchN}, expected 9. Not spending.`);
    process.exit(2);
  }
}

if (runningAsMain()) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
