#!/usr/bin/env node
/**
 * Score Ben labels against a later evidence run. Do not average Group A and Group B.
 *
 *   node scripts/diagnostic/accuracy/score.mjs --labels path --cards path --manifest path
 *
 * This pass ships the scorer. Do not run an evidence pass here.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { formatScoreReport, joinKey, scoreAccuracy } from "./lib.mjs";

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

export { formatScoreReport, scoreAccuracy };

function parseArgs(argv) {
  const out = { labels: null, cards: null, manifest: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--labels" && argv[i + 1]) out.labels = argv[++i];
    else if (argv[i] === "--cards" && argv[i + 1]) out.cards = argv[++i];
    else if (argv[i] === "--manifest" && argv[i + 1]) out.manifest = argv[++i];
  }
  return out;
}

function keysFromManifest(manifest, side) {
  const rows = side === "A" ? manifest.groupA : manifest.groupB;
  return new Set((rows || []).map((r) => joinKey(r.fixtureId, r.statementText, r.occurrence)));
}

export async function runScore({ labelsPath, cardsPath, manifestPath }) {
  const labelsDoc = JSON.parse(await readFile(labelsPath, "utf8"));
  const cardsDoc = JSON.parse(await readFile(cardsPath, "utf8"));
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const labels = Array.isArray(labelsDoc.labels) ? labelsDoc.labels : labelsDoc;
  const cards = Array.isArray(cardsDoc.cards) ? cardsDoc.cards : cardsDoc;
  const result = scoreAccuracy({
    labels,
    cards,
    groupAKeys: keysFromManifest(manifest, "A"),
    groupBKeys: keysFromManifest(manifest, "B"),
  });
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.labels || !args.cards || !args.manifest) {
    console.error("usage: node score.mjs --labels <file> --cards <file> --manifest <file>");
    process.exit(2);
  }
  const result = await runScore({
    labelsPath: path.resolve(args.labels),
    cardsPath: path.resolve(args.cards),
    manifestPath: path.resolve(args.manifest),
  });
  console.log(formatScoreReport(result));
}

void __dirname;

if (runningAsMain()) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
