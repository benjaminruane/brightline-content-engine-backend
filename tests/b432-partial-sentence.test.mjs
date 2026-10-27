/**
 * B432. A quiet partial is partly in the source, and the card says the split.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { editPartialExplanation, partialSentence, PARTIAL_UNRECORDED } from "../lib/qc/partial-sentence.mjs";
import { shownLabel, shownState, shownTier } from "../lib/qc/shown-verdict.mjs";
import { summaryBulletsFromReview } from "../lib/qc/summary-bullets.mjs";

test("a quiet partial is not labelled Nothing raised", () => {
  const card = {
    displayVerdict: "supported_partial",
    statementVerdict: { state: "nothing_raised", tier: "quiet" },
    sentenceState: "nothing_raised",
  };
  assert.equal(shownState(card), "partial");
  assert.equal(shownLabel(card), "Partly in the source");
  assert.equal(shownTier("partial"), "light");
});

test("a beyond partial keeps the louder label", () => {
  const card = {
    displayVerdict: "supported_partial",
    statementVerdict: { state: "beyond", tier: "light" },
  };
  assert.equal(shownState(card), "beyond");
  assert.equal(shownLabel(card), "Goes beyond the source");
});

test("the three edit rules, and a missing explanation is not a split", () => {
  const edited = editPartialExplanation(
    "The source supports the position but does not explicitly mention 'unit economics', making the statement partially confirmed."
  );
  assert.equal(edited, "The source supports the position but does not mention 'unit economics'.");
  assert.equal(edited.includes("explicitly"), false);
  assert.equal(edited.includes("partially confirmed"), false);

  const said = partialSentence({
    statement: "Shopify combines exceptional unit economics and a defensible position.",
    matchExplanations: [
      {
        classification: "confirmed",
        explanation: "The source confirms the competitive position.",
      },
      {
        classification: "partially_confirmed",
        explanation: "The source supports the position but does not explicitly mention 'exceptional unit economics.'",
      },
    ],
  });
  assert.match(said, /does not mention 'exceptional unit economics\.'/);
  assert.equal(said.includes("confirms the competitive"), false);

  assert.equal(partialSentence({ displayVerdict: "supported_partial" }), PARTIAL_UNRECORDED);
  assert.equal(
    partialSentence({
      statement: "Revenue grew.",
      unsupportedSpans: [{ text: "grew" }],
    }),
    'Not in the source: "grew". Which part the source covers was not recorded.'
  );
});

test("the summary uses the card name", () => {
  const bullets = summaryBulletsFromReview({
    version: 1,
    readiness: "Minor points to address",
    evidence: { partial: 2, beyond: 0, conflicting: 0, notSupported: 0 },
    notChecked: 0,
    signalConcerns: 0,
    editorial: { concerns: 0 },
    compliance: { concerns: 0 },
  });
  assert.equal(bullets[0], "2 statements are partly in the source.");
});
