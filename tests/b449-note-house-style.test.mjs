/**
 * B449. The craft note that reaches the reader uses the house style.
 * A quoted percent word is left alone. A long dash is not.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { applyNoteHouseStyle, noteHouseStyleCounts } from "../lib/qc/note-house-style.mjs";
import { writerText } from "../lib/qc/reading-review.mjs";

const EM = "\u2014";
const EN = "\u2013";

describe("B449 note house style", () => {
  test("a missing text is refused", () => {
    assert.throws(() => applyNoteHouseStyle(undefined), /text is missing/);
    assert.throws(() => noteHouseStyleCounts(null), /text is missing/);
  });

  test("long dashes become hyphens, including inside a quotation", () => {
    const text = `The close was early ${EM} ahead of plan. The draft says "late ${EN} by a week".`;
    const out = applyNoteHouseStyle(text);
    assert.equal(out, 'The close was early - ahead of plan. The draft says "late - by a week".');
    assert.equal(noteHouseStyleCounts(text).emDashes, 1);
    assert.equal(noteHouseStyleCounts(text).enDashes, 1);
    assert.equal(noteHouseStyleCounts(out).dashes, 0);
  });

  test("a spelled percentage becomes the symbol, and a quoted one does not", () => {
    const text = 'Margin is 11 percent, and the draft still says "11 percent" and \u201C5.4 per cent\u201D.';
    const out = applyNoteHouseStyle(text);
    assert.equal(out, 'Margin is 11%, and the draft still says "11 percent" and "5.4 per cent".');
    assert.equal(noteHouseStyleCounts(text).percentWords, 1);
    assert.equal(noteHouseStyleCounts(text).quotedPercentWords, 2);
    assert.equal(noteHouseStyleCounts(out).percentWords, 0);
    assert.equal(noteHouseStyleCounts(out).quotedPercentWords, 2);
  });

  test("the writer step applies the substitution to the note the reader sees", () => {
    const raw = JSON.stringify({ note: `One claim ${EM} and 14 percent growth.` });
    assert.equal(writerText(raw), "One claim - and 14% growth.");
    assert.equal(writerText("{}"), "");
  });
});
