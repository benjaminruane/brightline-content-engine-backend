/**
 * B425. Count stored extracts that carry no letter or digit.
 * No model call.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { excerptIsReadable } from "../../../lib/qc/readable-excerpt.mjs";
import { lineIdsCovering } from "../../../lib/qc/excerpt-sentences.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const review = JSON.parse(readFileSync(path.join(root, "tests/fixtures/real-runs-2026-10-04-hicl/clean-review.json"), "utf8"));
const actions = JSON.parse(readFileSync(path.join(root, "tests/fixtures/real-runs-2026-10-04-hicl/clean-actions.json"), "utf8"));

const dropped = [];

function consider(where, text) {
  if (typeof text !== "string") return;
  const trimmed = text.trim();
  if (!trimmed || excerptIsReadable(trimmed)) return;
  dropped.push({ where, text: trimmed });
}

for (const row of review.statements || []) {
  const card = row.qcCard || {};
  const label = `S${card.index ?? row.id}`;
  consider(`${label} primaryExcerpt`, card.primaryExcerpt);
  consider(`${label} primaryExcerptText`, card.primaryExcerptText);
  consider(`${label} conflictExcerpt`, card.conflictExcerpt?.passage);
  for (const span of card.supportSpans || []) consider(`${label} supportSpan`, span?.passage);
  for (const hover of card.citationHovers || []) consider(`${label} citationHover`, hover?.excerptText);
}

for (const entry of actions.entries || []) {
  consider(`${entry.id || "entry"} quotedPassage`, entry.quotedPassage);
  consider(`${entry.id || "entry"} confirmingPassage`, entry.confirmingPassage);
  for (const row of entry.disagreementPassages || []) consider(`${entry.id || "entry"} disagreement`, row?.passage);
}

const source = review.sources?.[0]?.text || "";
const lines = source.split("\n");
const quoteAt = source.indexOf("\"");
const quoteLine = lineIdsCovering(source, quoteAt, quoteAt + 1);
const definitions = lines[7] || "";

const linesOut = [];
const say = (line) => linesOut.push(line);
say("# B425. Unreadable extracts");
say("");
say("An extract is readable when it contains a letter or a digit. A quotation mark on its own is not displayed.");
say("");
say(`Dropped on the stored clean HICL payload: ${dropped.length}.`);
if (!dropped.length) {
  say("No stored primary excerpt, support-span passage, citation hover, quoted passage, or disagreement passage is without a letter or digit.");
} else {
  for (const row of dropped) say(`- ${row.where}: ${JSON.stringify(row.text)}`);
}
say("");
say(`The first double quote in the source is at offset ${quoteAt}, ${quoteLine.join(" ") || "(no line)"}.`);
say(`L8 is the definitions line. It begins ${JSON.stringify(definitions.slice(0, 48))} and is ${definitions.length} characters. It is not stored as a card excerpt.`);
say("The operational performance card's stored excerpt is the chair's sentence, offsets 518-781, source line 16.");
say("");
say("USD 0. No model call.");
say("");

const report = linesOut.join("\n");
writeFileSync(path.join(root, "scripts/diagnostic/b425/report.md"), report);
console.log(report);
if (dropped.length !== 0) process.exitCode = 1;
