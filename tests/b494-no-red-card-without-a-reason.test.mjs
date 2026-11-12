/**
 * B494. An unrecorded partial with nothing found stays quiet.
 * Needs a look uses the sentence already written for its reason code.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { NOT_CHECKED_SENTENCES } from "../lib/qc/not-reviewed-reason.mjs";
import { PARTIAL_UNRECORDED } from "../lib/qc/partial-sentence.mjs";
import { readerEvidenceSentence } from "../lib/qc/reader-reason.mjs";
import { shownLabel, shownState, shownTier } from "../lib/qc/shown-verdict.mjs";
import { NOT_CHECKED_SENTENCES as screenMap } from "../../brightline-content-engine-frontend/src/modules/drafting/notCheckedReason.js";
import { readerEvidenceSentence as screenSentence } from "../../brightline-content-engine-frontend/src/modules/drafting/readerReason.js";
import { statementVerdictState } from "../../brightline-content-engine-frontend/src/modules/drafting/displayVerdictLabels.js";

const SENTENCE = "This check did not run, because the match came back empty.";

function partial(bucket) {
  return {
    statement: "We remain constructive on the remaining portfolio.",
    displayVerdict: "supported_partial",
    displayedEvidenceProse: PARTIAL_UNRECORDED,
    sentenceState: "nothing_raised",
    statementVerdict: { state: "nothing_raised" },
    readingNote: { bucket, text: "" },
  };
}

test("24:6 shape stays Nothing raised", () => {
  const card = partial("none");
  assert.equal(shownState(card), "nothing_raised");
  assert.equal(shownLabel(card), "Nothing raised");
  assert.equal(shownTier(shownState(card)), "quiet");
  assert.equal(statementVerdictState(card), "nothing_raised");
});

test("a conflict or a beyond note on the unrecorded line stays raised", () => {
  const held = shownState(partial("other"));
  assert.equal(shownState(partial("conflicts")), held);
  assert.equal(shownState(partial("beyond")), held);
  assert.notEqual(held, "nothing_raised");
});

test("Needs a look uses the mapped sentence, and the screen matches", () => {
  const card = {
    statement: "Total Company revenue grew from SEK 4.2 billion at entry.",
    displayVerdict: "not reviewed",
    sentenceState: "note_withheld",
    statementVerdict: { state: "note_withheld" },
    evidenceNotReviewedReason: "empty_confirmation_refused",
  };
  const reason = readerEvidenceSentence(card);
  assert.equal(reason, SENTENCE);
  assert.equal(reason.length > 0, true);
  assert.equal(screenSentence(card), reason);
});

test("an empty reason code uses the empty completion sentence", () => {
  const sentence = "This check did not run, because the result came back empty.";
  assert.equal(NOT_CHECKED_SENTENCES[""], sentence);
  assert.equal(NOT_CHECKED_SENTENCES[""], NOT_CHECKED_SENTENCES.empty_completion);
  for (const code of ["", "   ", null]) {
    const card = {
      statement: "We see continued strong demand for managed IT services.",
      displayVerdict: "supported_full",
      sentenceState: "note_withheld",
      statementVerdict: { state: "note_withheld" },
      evidenceNotReviewedReason: code,
    };
    const reason = readerEvidenceSentence(card);
    assert.equal(reason, sentence, JSON.stringify(code));
    assert.equal(reason.length > 0, true);
    assert.equal(screenSentence(card), reason);
  }
});

test("the not-checked maps are the same sentences", () => {
  assert.deepEqual(screenMap, NOT_CHECKED_SENTENCES);
});
