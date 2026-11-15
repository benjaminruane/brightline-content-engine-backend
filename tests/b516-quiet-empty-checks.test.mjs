/**
 * B516. A sentence the reader accepts is not raised when the evidence match
 * did not finish. The fallback sentence names that, and does not invent a cause.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { NOT_CHECKED_SENTENCES } from "../lib/qc/not-reviewed-reason.mjs";
import { readerEvidenceSentence } from "../lib/qc/reader-reason.mjs";
import { shownState, shownTrace } from "../lib/qc/shown-verdict.mjs";

const MATCH = "This check did not run, because the match came back empty.";
const RESULT = "This check did not run, because the result came back empty.";
const SHORT = "The check that reads the whole claim did not finish, so read this sentence against the source yourself.";
const FULL = `The figures in this sentence match the source. ${SHORT}`;

function card(over = {}) {
  return {
    statement: "Revenue grew from EUR 10 million to EUR 12 million.",
    displayVerdict: "not reviewed",
    supportState: "skipped",
    evidenceNotReviewedReason: "empty_confirmation_refused",
    statementVerdict: { state: "nothing_raised" },
    sentenceState: "nothing_raised",
    readingNote: { bucket: "none", text: "Supported.", refused: false },
    readingFacts: [{ kind: "figure", status: "matched", surface: "EUR 10 million" }],
    ...over,
  };
}

test("A1 an accepted note with nothing found stays quiet when the match did not finish", () => {
  for (const reason of ["empty_confirmation_refused", "schema_invalid", "thrown_call", "could_not_determine", ""]) {
    const traced = shownTrace(card({ evidenceNotReviewedReason: reason }));
    assert.equal(traced.state, "nothing_raised", reason);
    assert.equal(traced.setBy.branch, "readerSupportedCheckIncomplete", reason);
  }
  const missed = card({
    readingFacts: [{ kind: "figure", status: "not_found", surface: "EUR 10 million" }],
    statementVerdict: { state: "not_in_source" },
    sentenceState: "not_in_source",
  });
  assert.equal(shownState(missed), "not_in_source");
  const dated = card({
    readingFacts: [{ kind: "date", status: "matched_disputed", surface: "2024" }],
    statementVerdict: { state: "not_in_source" },
    sentenceState: "not_in_source",
  });
  assert.equal(shownState(dated), "not_in_source");
});

test("A2 a wording note follows the same rule", () => {
  const traced = shownTrace(card({
    readingNote: { bucket: "wording", text: "Same facts, different words.", refused: false },
  }));
  assert.equal(traced.state, "nothing_raised");
  assert.equal(traced.setBy.branch, "readerSupportedCheckIncomplete");
});

test("A3 a missing note and a refused note stay as they were", () => {
  const missing = card({ readingNote: null });
  assert.equal(shownState(missing), "note_withheld");
  assert.equal(readerEvidenceSentence(missing), MATCH);
  const refused = card({
    readingNote: { refused: true },
    displayVerdict: "supported_full",
    supportState: "supported",
    evidenceNotReviewedReason: "",
    statementVerdict: { state: "note_withheld", setBy: { source: "note", refused: true } },
    sentenceState: "note_withheld",
  });
  assert.equal(shownState(refused), "note_withheld");
  assert.equal(readerEvidenceSentence(refused), FULL);
});

test("B1 a blank reason does not say the result came back empty", () => {
  assert.notEqual(NOT_CHECKED_SENTENCES[""], RESULT);
  assert.equal(NOT_CHECKED_SENTENCES[""], SHORT);
  const bare = {
    statement: "The team recommends the investment.",
    displayVerdict: "supported_full",
    sentenceState: "note_withheld",
    statementVerdict: { state: "note_withheld" },
    evidenceNotReviewedReason: "",
    readingNote: { bucket: "conflicts", text: "It goes further.", refused: false },
  };
  assert.equal(shownState(bare), "note_withheld");
  assert.equal(readerEvidenceSentence(bare), SHORT);
  const figured = {
    ...bare,
    readingFacts: [{ kind: "figure", status: "matched", surface: "EUR 10 million" }],
  };
  assert.equal(readerEvidenceSentence(figured), FULL);
});

test("B2 each empty sentence is shown only for its own cause", () => {
  const held = {
    statement: "The team recommends the investment.",
    displayVerdict: "not reviewed",
    supportState: "skipped",
    sentenceState: "note_withheld",
    statementVerdict: { state: "note_withheld" },
  };
  assert.equal(readerEvidenceSentence({ ...held, evidenceNotReviewedReason: "empty_confirmation_refused" }), MATCH);
  assert.equal(readerEvidenceSentence({ ...held, evidenceNotReviewedReason: "empty_result" }), RESULT);
  assert.equal(readerEvidenceSentence({ ...held, evidenceNotReviewedReason: "empty_completion" }), RESULT);
  assert.equal(readerEvidenceSentence({ ...held, evidenceNotReviewedReason: "" }).includes("came back empty"), false);
  assert.equal(NOT_CHECKED_SENTENCES.empty_confirmation_refused, MATCH);
  assert.equal(NOT_CHECKED_SENTENCES.empty_result, RESULT);
  assert.equal(NOT_CHECKED_SENTENCES.empty_completion, RESULT);
});
