/**
 * B574. Cards say what Review found. No model call.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

import { splitSentences } from "../lib/text/sentences.mjs";
import { stripLengthClaims } from "../lib/qc/writer-note-length.mjs";
import { writerDraftText } from "../lib/qc/reading-review.mjs";
import {
  cardReason,
  displayLabel,
  quoteDraftPhrase,
  shortFormIsReal,
  visibleConcerns,
  CHECK_UNFINISHED,
  CHECK_UNFINISHED_REPLACEMENT,
} from "../lib/qc/card-reason.mjs";
import { applyDisplayHouseStyle } from "../lib/qc/note-house-style.mjs";
import { passageForCard } from "../lib/qc/passage-trim.mjs";
import { pageFurnitureIndexes } from "../lib/extract/page-furniture.mjs";
import { dropDatedForwardLooking } from "../lib/qc/editorial-compliance-reviewer.mjs";
import { applyPence, scanPenceForm } from "../lib/style-guide/pence.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => JSON.parse(readFileSync(path.join(ROOT, "fixtures/b574", `${name}.json`), "utf8"));
const card = (review, index) => review.statements[index].qcCard;
const sourceText = (review) => review.sources.map((source) => source.text).join("\n");

const NAMES = ["gemspring-clean", "gemspring-dirty", "patria-clean", "patria-dirty", "marks-clean", "marks-dirty"];

test("decimals, abbreviations and quotations stay inside one sentence", () => {
  const decimal = "The comparison is the $3.0 billion target to Fund III, not Fund IV.";
  assert.equal(splitSentences(decimal).length, 1);
  assert.match(splitSentences(decimal)[0], /\$3\.0 billion target to Fund III/);
  const abbrev = "The U.S. market, e.g. the one Marks describes, rose 5% p.a. in No. 2 fund.";
  assert.equal(splitSentences(abbrev).length, 1);
  const quoted = 'He wrote "The fund rose 8.5%. It held." Then the letter stopped.';
  assert.equal(splitSentences(quoted).length, 1);
  assert.match(splitSentences(quoted)[0], /8\.5%\. It held\./);
});

test("a length sentence is removed and the decimal sentence stays whole", () => {
  const note = "The piece is 180 words. NAV total return was 12.5% and the share price return was 8.5% against the market. Net gearing is 1.7%. Drawdowns were £175.7 million for the period.";
  const out = stripLengthClaims(note);
  assert.match(out, /12\.5%/);
  assert.match(out, /8\.5% against the market/);
  assert.match(out, /1\.7%/);
  assert.match(out, /£175\.7 million for the period/);
  assert.doesNotMatch(out, /^5% share/);
  assert.doesNotMatch(out, /180 words/);
});

test("all six reviewer notes are loaded and a rebuilt decimal sentence is not chopped", () => {
  for (const name of NAMES) {
    const review = fixture(name);
    assert.equal(typeof review.writerFeedback, "string");
    assert.ok(review.writerFeedback.length > 40, name);
    const whole = stripLengthClaims(`The piece is 90 words. ${review.writerFeedback}`);
    assert.equal(whole.includes(review.writerFeedback.slice(0, 24)), true);
  }
});

test("the note writer is given the greeting, not only the statements", () => {
  const draft = "Dear Investors,\n\nPrivate credit has grown.\n\nYours sincerely,\nThe firm";
  const seen = writerDraftText(draft, ["Private credit has grown."]);
  assert.match(seen, /Dear Investors/);
  assert.match(seen, /Yours sincerely/);
  const marks = fixture("marks-dirty");
  assert.ok(marks.dropped.some((line) => /Dear Investors/.test(line)));
});

test("card text uses US and leaves a quotation alone", () => {
  const styled = applyDisplayHouseStyle('The U.S. market moved. The source says "the U.S. market".');
  assert.match(styled, /The US market moved/);
  assert.match(styled, /"the U\.S\. market"/);
  const marks = fixture("marks-clean");
  const reason = cardReason(card(marks, 0), { sourceText: sourceText(marks) });
  assert.doesNotMatch(reason, /\bU\.S\./);
});

test("the full explanation is shown, and the short form is not", () => {
  const gem = fixture("gemspring-dirty");
  const s5 = cardReason(card(gem, 4), { sourceText: sourceText(gem) });
  assert.doesNotMatch(s5, /; the draft says /);
  assert.doesNotMatch(s5, /a different value/);
  assert.match(s5, /Gemspring/);
  const marks = fixture("marks-dirty");
  const s2 = cardReason(card(marks, 1), { sourceText: sourceText(marks) });
  assert.match(s2, /Howard Marks/);
  assert.doesNotMatch(s2, /says over/);
  const s4 = cardReason(card(marks, 3), { sourceText: sourceText(marks) });
  assert.match(s4, /high yield bonds|government paper/i);
  assert.doesNotMatch(s4, /says carry/);
  const s6 = cardReason(card(marks, 5), { sourceText: sourceText(marks) });
  assert.match(s6, /20x/);
  assert.doesNotMatch(s6, /matching\.$/);
  assert.equal(shortFormIsReal("The source says largest; the draft says second-largest.", "the largest fund", "the second-largest fund"), true);
  assert.equal(shortFormIsReal("The source says over; the draft says Citibank.", "over the period", "Citibank traces this"), false);
});

test("an unfinished check yields to the explanation, or to the plain fallback", () => {
  const withNote = cardReason({
    sentenceLabel: "Needs a look",
    readingNote: { bucket: "conflicts", text: "The source gives 3.1%, not 3.6%." },
    evidenceLine: CHECK_UNFINISHED,
  });
  assert.match(withNote, /3\.1%/);
  assert.doesNotMatch(withNote, /did not finish/);
  const none = cardReason({ sentenceLabel: "Needs a look", readingNote: { text: "" }, evidenceLine: CHECK_UNFINISHED });
  assert.equal(none, CHECK_UNFINISHED_REPLACEMENT);
});

test("every named quiet card has one reason", () => {
  const marks = fixture("marks-clean");
  for (const index of [2, 3, 4, 5, 6, 9, 10]) {
    const reason = cardReason(card(marks, index), { sourceText: sourceText(marks) });
    assert.ok(reason.length > 10, `marks-clean S${index + 1}`);
    assert.equal(reason.split(/(?<=[.!?])\s+/).length <= 3 || reason.length < 500, true);
  }
  const model = cardReason(card(marks, 7), { sourceText: sourceText(marks) });
  assert.match(model, /source/i);
  const patria = fixture("patria-clean");
  for (const index of [1, 2, 4]) {
    const reason = cardReason(card(patria, index), { sourceText: sourceText(patria) });
    assert.ok(reason.length > 10, `patria-clean S${index + 1}`);
  }
});

test("an amber card with an unmatched name says so", () => {
  const patria = fixture("patria-clean");
  const reason = cardReason(card(patria, 0), { sourceText: sourceText(patria) });
  assert.match(reason, /'Middle East' does not appear in the source/);
});

test("a different value is a conflict, including the header label", () => {
  const patria = fixture("patria-dirty");
  for (const index of [0, 2, 3, 4]) {
    assert.equal(displayLabel(card(patria, index)), "Conflicts with the source", `patria-dirty S${index + 1}`);
  }
  const gem = fixture("gemspring-dirty");
  assert.equal(displayLabel(card(gem, 2)), "Conflicts with the source");
  const marks = fixture("marks-dirty");
  assert.notEqual(displayLabel(card(marks, 1)), "Conflicts with the source");
});

test("passages keep the fact and drop the duplicate and the furniture", () => {
  const patriaClean = fixture("patria-clean");
  for (const index of [1, 2, 4]) {
    const passage = passageForCard(card(patriaClean, index), sourceText(patriaClean)).passage;
    assert.ok(passage.length > 0, `patria-clean S${index + 1}`);
    assert.ok(passage.length <= 400, `patria-clean S${index + 1} ${passage.length}`);
  }
  const marks = fixture("marks-clean");
  const s9 = passageForCard(card(marks, 8), sourceText(marks)).passage;
  assert.ok(s9.length > 0 && s9.length <= 400);
  const gem = fixture("gemspring-dirty");
  for (const index of [1, 4]) {
    const passage = passageForCard(card(gem, index), sourceText(gem)).passage;
    assert.doesNotMatch(passage, /Also in the source/);
    const head = passage.slice(0, 48);
    assert.equal(head.length > 20 && passage.indexOf(head) === passage.lastIndexOf(head), true);
  }
  const dirty = fixture("patria-dirty");
  const nav = passageForCard(card(dirty, 1), sourceText(dirty)).passage;
  assert.match(nav, /862\.5p/);
  const investments = passageForCard(card(dirty, 2), sourceText(dirty)).passage;
  assert.match(investments, /10 new investments/);
  const header = "29/06/2026, 08:55 Half-year Financial Report";
  const indexes = pageFurnitureIndexes(sourceText(dirty));
  assert.ok(indexes.length >= 3);
  const evidence = passageForCard(card(dirty, 0), sourceText(dirty)).passage;
  assert.doesNotMatch(evidence, /London Stock Exchange/);
  assert.doesNotMatch(evidence, new RegExp(header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(evidence, /3\.1%|six months/i);
});

test("an empty concern is not shown, and voice and materiality stay off the card", () => {
  const gem = fixture("gemspring-dirty");
  const editorial = visibleConcerns(card(gem, 2).editorialConcerns);
  assert.equal(editorial.length, 0);
  const voice = visibleConcerns([
    { concernCode: "voice_consistency", note: "Change Marks emphasizes to We emphasize." },
    { concernCode: "materiality", note: "The sentence does not add meaningful information." },
    { concernCode: "clarity", note: "Name the fund." },
  ], { evidenceRaised: false });
  assert.equal(voice.length, 1);
  assert.equal(voice[0].concernCode, "clarity");
  const held = visibleConcerns([
    { concernCode: "clarity", note: "Name the fund." },
  ], { evidenceRaised: true });
  assert.equal(held.length, 0);
});

test("a date on or before the reference date is not forward-looking", () => {
  const gem = fixture("gemspring-dirty");
  const concerns = card(gem, 2).complianceConcerns;
  assert.equal(concerns.length, 1);
  const dropped = dropDatedForwardLooking(concerns, {
    statementText: card(gem, 2).statement,
    referenceDate: "November 2026",
  });
  assert.equal(dropped.concerns.length, 0);
  assert.equal(dropped.dropped.length, 1);
});

test("wording notes quote the draft words", () => {
  const note = quoteDraftPhrase("Change June 2026 to the year of the close.", "June 2026");
  assert.match(note, /"June 2026"/);
  assert.equal(quoteDraftPhrase('Keep "June 2026" as written.', "June 2026"), 'Keep "June 2026" as written.');
});

test("pence is a house-style choice and is never turned into pounds", () => {
  assert.equal(applyPence("NAV was 862.5p at the close.", "words"), "NAV was 862.5 pence at the close.");
  assert.equal(applyPence("NAV was 862.5 pence at the close.", "symbol"), "NAV was 862.5p at the close.");
  assert.doesNotMatch(applyPence("862.5p", "words"), /£/);
  assert.equal(scanPenceForm({ statement: "NAV was 862.5p.", pence: "words" }).length, 1);
  assert.equal(scanPenceForm({ statement: "NAV was 862.5 pence.", pence: "symbol" }).length, 1);
  assert.equal(scanPenceForm({ statement: "NAV was 862.5 pence.", pence: "words" }).length, 0);
});
