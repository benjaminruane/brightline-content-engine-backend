/**
 * B519. A partial whose reason was not recorded is not quieted to Nothing raised.
 * When that fallback is all the partial sentence has, and the card has an
 * evidence summary, the summary is the sentence.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { PARTIAL_UNRECORDED, partialSentence } from "../lib/qc/partial-sentence.mjs";
import { shownLabel, shownState } from "../lib/qc/shown-verdict.mjs";

function unrecorded(bucket) {
  return {
    statement: "The remaining portfolio is concentrated in one sector.",
    displayVerdict: "supported_partial",
    displayedEvidenceProse: PARTIAL_UNRECORDED,
    sentenceState: "nothing_raised",
    statementVerdict: { state: "nothing_raised" },
    readingNote: { bucket, text: "" },
  };
}

test("an unrecorded partial is not Nothing raised", () => {
  for (const bucket of ["wording", "none"]) {
    const card = unrecorded(bucket);
    assert.notEqual(shownLabel(card), "Nothing raised", bucket);
    assert.notEqual(shownState(card), "nothing_raised", bucket);
    const label = shownLabel(card);
    assert.equal(
      label === "Goes beyond the source" || label === "Needs a look",
      true,
      label
    );
  }
});

test("the unrecorded fallback uses a non-empty evidence summary", () => {
  const summary = "The memo states the remaining portfolio is still compounding.";
  const card = {
    displayVerdict: "supported_partial",
    statement: "The remaining portfolio is concentrated in one sector.",
    evidenceSummary: summary,
  };
  assert.notEqual(partialSentence(card), PARTIAL_UNRECORDED);
  assert.equal(partialSentence(card).includes("remaining portfolio"), true);
});

test("a partial with no summary and no explanation stays on the fallback", () => {
  assert.equal(
    partialSentence({ displayVerdict: "supported_partial", statement: "Revenue grew." }),
    PARTIAL_UNRECORDED
  );
});
