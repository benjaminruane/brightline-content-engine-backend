/**
 * B579. Passages come from the lines where the figures were found.
 * The count drops terms, ampersand fragments, and sentence-initial ordinary words.
 * A reason does not claim what the passage does not show, and an unmatched fact is named.
 * No model call.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { cardReason } from "../lib/qc/card-reason.mjs";
import { factCounts, factPassage } from "../lib/qc/fact-passages.mjs";
import { splitHouseStyle } from "../lib/qc/house-style.mjs";
import { passageForCard } from "../lib/qc/passage-trim.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const patria = JSON.parse(readFileSync(path.join(ROOT, "fixtures/b579/patria-clean.json"), "utf8"));
const gem = JSON.parse(readFileSync(path.join(ROOT, "fixtures/b579/gemspring-dirty.json"), "utf8"));
const card = (pack, index) => pack.statements[index].qcCard;

test("patria-clean passages show the lines that carry the figures", () => {
  const s2 = factPassage(card(patria, 1));
  assert.match(s2.passage, /862\.5p/);
  assert.match(s2.passage, /2\.7%/);
  assert.deepEqual(s2.lineIds, ["L77", "L78"]);
  assert.equal(passageForCard(card(patria, 1)).passage, s2.passage);

  const s3 = factPassage(card(patria, 2));
  assert.match(s3.passage, /10 new investments and commitments totalling £175\.9 million/);
  assert.match(s3.passage, /Five new primary fund commitments/);
  assert.match(s3.passage, /One secondary investment/);
  assert.match(s3.passage, /Three new direct investments/);
  assert.ok(!s3.lineIds.includes("L1"));

  const s4 = factPassage(card(patria, 3));
  assert.match(s4.passage, /£125\.6 million/);
  assert.match(s4.passage, /£95\.6 million/);
  assert.deepEqual(s4.lineIds, ["L22"]);

  const s5 = factPassage(card(patria, 4));
  assert.match(s5.passage, /£824\.9 million/);
  assert.match(s5.passage, /39\.4%/);
  assert.match(s5.passage, /£276\.7 million/);
  assert.match(s5.passage, /9\.7%/);
  assert.deepEqual(s5.lineIds, ["L27", "L28", "L29", "L71"]);
});

test("patria-clean count drops terms, ordinary openers, and a split ampersand", () => {
  const counts = factCounts(patria.statements);
  assert.equal(counts.matched, 23);
  assert.equal(counts.total, 24);
});

test("reasons stay inside the passage, and an unmatched name is named", () => {
  const s1 = card(patria, 0);
  const reason1 = cardReason(s1);
  assert.match(reason1, /The source reports/);
  assert.doesNotMatch(reason1, /confirms/i);
  assert.match(reason1, /'Middle East' does not appear in the source\./);
  assert.doesNotMatch(reason1, /volatile markets/);

  const s2 = card(patria, 1);
  const reason2 = cardReason(s2);
  assert.match(reason2, /862\.5p/);
  assert.match(reason2, /2\.7%/);
  assert.doesNotMatch(reason2, /portfolio revenue and earnings growth/);
  assert.doesNotMatch(reason2, /confirms/i);
  assert.doesNotMatch(reason2, /matching the statement/);

  const split = splitHouseStyle(s2.editorialConcerns);
  assert.equal(split.editorial.length, 0);
  assert.equal(split.houseStyle[0].concernCode, "pence_form");
  assert.match(split.houseStyle[0].note, /862\.5p as 862\.5 pence/);
});

test("gemspring conflict reasons keep their findings", () => {
  const s2 = cardReason(card(gem, 0));
  assert.match(s2, /\$3\.5 billion/);
  assert.match(s2, /\$4\.5 billion/);
  assert.match(s2, /75% larger than Fund III/);
  assert.doesNotMatch(s2, /does not appear in the source/);

  const raw3 = card(gem, 1).matchExplanations[0].explanation;
  const s3 = cardReason(card(gem, 1));
  assert.match(s3, /less than three months, not under two months/);
  assert.match(s3, /does not specify June 2026/);
  assert.doesNotMatch(s3, /confirms/i);
  assert.equal(s3, raw3.replace("The source confirms the", "The source reports the"));

  const s5 = cardReason(card(gem, 2));
  assert.equal(s5, card(gem, 2).matchExplanations[0].explanation.replace(/\bis confirmed\b/g, "is in the source"));
  assert.doesNotMatch(s5, /confirm/i);
});
