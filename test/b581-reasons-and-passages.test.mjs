/**
 * B581. The reader writes every reason. A stage 2 explanation is shown whole,
 * with only the two confirms replacements and internal labels removed.
 * Passages are separate pieces on the source line numbers.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { cardReason } from "../lib/qc/card-reason.mjs";
import { factPassage, INTERNAL_LABELS, shownReason } from "../lib/qc/fact-passages.mjs";
import { passageForCard } from "../lib/qc/passage-trim.mjs";
import { READING_NOTE_PROMPT } from "../lib/qc/reading-contract.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const gem = JSON.parse(readFileSync(path.join(root, "fixtures/b581/gemspring-dirty-after-b580.json"), "utf8"));
const patria = JSON.parse(readFileSync(path.join(root, "fixtures/b581/patria-clean-after-b580.json"), "utf8"));

function card(pack, index) {
  return pack.statements[index].qcCard;
}

const RAW_S2 = "The source confirms the NAV per share increase to 862.5p and attributes it to portfolio revenue and earnings growth, with a 2.7% local-currency return, matching the statement on a like-for-like basis.";
const RAW_S4 = "The source confirms the figures for realisations and drawdowns. However, it does not explicitly state that these figures reflect continued but slower M&A activity, making the statement partially_confirmed.";

test("the stage 2 fallback keeps the sentence and drops the label", () => {
  const s2 = shownReason(RAW_S2);
  const s4 = shownReason(RAW_S4);
  assert.equal(s2, "The source states the NAV per share increase to 862.5p and attributes it to portfolio revenue and earnings growth, with a 2.7% local-currency return, matching the statement on a like-for-like basis.");
  assert.equal(s4, "The source states the figures for realisations and drawdowns. However, it does not explicitly state that these figures reflect continued but slower M&A activity.");
  for (const reason of [s2, s4]) {
    assert.match(reason, /\.$/);
    for (const label of INTERNAL_LABELS) assert.equal(reason.toLowerCase().includes(label), false, label);
  }
});

test("no shown reason contains an internal label", () => {
  for (const pack of [gem, patria]) {
    for (const row of pack.statements) {
      const reason = cardReason(row.qcCard);
      for (const label of INTERNAL_LABELS) {
        assert.equal(reason.toLowerCase().includes(label), false, reason);
      }
    }
  }
});

test("the reader prompt asks for a reason on a green card", () => {
  assert.match(READING_NOTE_PROMPT, /which supports the statement/);
  assert.match(READING_NOTE_PROMPT, /in line with the statement/);
  assert.match(READING_NOTE_PROMPT, /as the statement says/);
  assert.match(READING_NOTE_PROMPT, /Do not write confirms/);
  assert.match(READING_NOTE_PROMPT, /matching the statement/);
  assert.doesNotMatch(READING_NOTE_PROMPT, /Only this bucket has an empty note/);
});

test("gemspring passages are not repeated and use the source line numbers", () => {
  const text = gem.sources[0].text;
  const s2 = factPassage(card(gem, 1), text);
  assert.deepEqual(s2.pieces.map((piece) => piece.lineIds), [["L1"], ["L2"]]);
  assert.equal(s2.pieces[0].text.includes("closed Gemspring Capital Fund IV"), true);
  assert.equal(s2.pieces[1].text.includes("$3 billion target"), true);
  const shown = passageForCard(card(gem, 1), text);
  assert.equal(shown.also, "");
  const s5 = factPassage(card(gem, 4), text);
  assert.equal(s5.pieces.length, 1);
  assert.deepEqual(s5.pieces[0].lineIds, ["L3"]);
  const again = passageForCard(card(gem, 4), text);
  assert.equal(again.also, "");
  assert.equal((again.passage.match(/largest single investor/g) || []).length, 1);
});

test("patria pieces keep their own line numbers and a table row has no pipes", () => {
  const text = patria.sources[0].text;
  const s2 = factPassage(card(patria, 1), text);
  assert.equal(s2.pieces.some((piece) => piece.text.includes("|")), false);
  assert.match(s2.pieces[0].text, /862\.5p/);
  assert.deepEqual(s2.pieces[0].lineIds, ["L70"]);
  const s5 = factPassage(card(patria, 4), text);
  assert.equal(s5.pieces.length, 4);
  assert.deepEqual(s5.pieces.map((piece) => piece.lineIds[0]), ["L22", "L23", "L24", "L64"]);
  for (const piece of s5.pieces) assert.equal(piece.lineIds.length, 1);
});
