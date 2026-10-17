/**
 * B396. Element check on the nine cards B395 left without a conclusion.
 * The displayed passage is the recovered passage in b395/runs/diff.json.
 * The whole source is the source text on the committed review.
 * No model call.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { extractElements, elementFound } from "../b392/elements.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const OUT = path.join(ROOT, "scripts/diagnostic/b396/runs");

const FILES = {
  "cp-doc": "tests/fixtures/real-runs-2026-10-06-clearpoint/dirty1-review.json",
  "cp-clean": "tests/fixtures/real-runs-2026-10-06-clearpoint/clean1-review.json",
  "gpi-clean-run3": "tests/fixtures/real-runs-2026-10-06-gpi/clean-run3-review.json",
  "gpi-clean-run4": "tests/fixtures/real-runs-2026-10-06-gpi/clean-run4-review.json",
  "gpi-clean-run5": "tests/fixtures/real-runs-2026-10-06-gpi/clean-run5-review.json",
};

const NINE = [
  ["cp-doc", 1, "doctored"],
  ["cp-doc", 3, "doctored"],
  ["cp-clean", 0, "clean"],
  ["cp-clean", 1, "clean"],
  ["cp-clean", 7, "clean"],
  ["cp-clean", 8, "clean"],
  ["gpi-clean-run3", 1, "clean"],
  ["gpi-clean-run4", 1, "clean"],
  ["gpi-clean-run5", 1, "clean"],
];

function load(rel) {
  return JSON.parse(readFileSync(path.join(ROOT, rel), "utf8"));
}

function sourceText(review) {
  const sources = Array.isArray(review.sources) ? review.sources : [];
  return sources.map((row) => (typeof row?.text === "string" ? row.text : "")).join("\n");
}

function bucket(elements) {
  if (elements.length === 0) return "no-element";
  if (elements.every((row) => row.inPassage)) return "all-in-passage";
  return "some-missing-from-passage";
}

function main() {
  const diff = load("scripts/diagnostic/b395/runs/diff.json");
  const reviews = new Map();
  const cards = [];
  for (const [name, index, side] of NINE) {
    if (!reviews.has(name)) reviews.set(name, load(FILES[name]));
    const review = reviews.get(name);
    const row = diff.rows.find((item) => item.name === name && item.index === index);
    if (!row?.changed) throw new Error(`missing B395 mover ${name} S${index}`);
    const statement = review.statements[index].text;
    const draft = review.statements.map((item) => item.text).join("\n");
    const source = sourceText(review);
    const passage = row.on.passage;
    if (!statement || !source.trim() || !passage.trim()) {
      throw new Error(`empty input ${name} S${index}`);
    }
    const elements = extractElements(statement, draft, source).map((element) => ({
      kind: element.kind,
      surface: element.surface,
      key: element.key || null,
      inPassage: elementFound(element, passage),
      inSource: elementFound(element, source),
    }));
    cards.push({
      name,
      index,
      side,
      statement,
      passageChars: passage.length,
      class: bucket(elements),
      elements,
    });
  }
  const tally = (list) => ({
    cards: list.length,
    allInPassage: list.filter((card) => card.class === "all-in-passage").length,
    someMissing: list.filter((card) => card.class === "some-missing-from-passage").length,
    noElement: list.filter((card) => card.class === "no-element").length,
  });
  const summary = {
    all: tally(cards),
    clean: tally(cards.filter((card) => card.side === "clean")),
    doctored: tally(cards.filter((card) => card.side === "doctored")),
  };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(path.join(OUT, "nine.json"), JSON.stringify({ summary, cards }, null, 2));
  console.log(JSON.stringify(summary));
  for (const card of cards) {
    console.log(`\n${card.side} ${card.name} S${card.index} ${card.class} elements ${card.elements.length}`);
    console.log(card.statement);
    for (const element of card.elements) {
      console.log(
        `  ${element.kind} ${JSON.stringify(element.surface)} passage=${element.inPassage} source=${element.inSource}`
      );
    }
  }
}

main();
