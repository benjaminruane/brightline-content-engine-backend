/**
 * B561. A card labelled Nothing raised is not amber because of an editorial or house-style note.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { classifyCard } from "../lib/qc/review-summary.mjs";
import { shownLabel } from "../lib/qc/shown-verdict.mjs";

const ON = { evidenceEnabled: true, editorialEnabled: true, complianceEnabled: true };

function quietCard(extra) {
  return {
    statement: "Customers increased from 5,500 a year ago to nearly 10,000.",
    statementVerdict: { state: "nothing_raised", tier: "quiet", setBy: null },
    sentenceState: "nothing_raised",
    displayVerdict: "supported_full",
    editorialVerdict: "clean",
    editorialConcerns: [],
    complianceVerdict: "clean",
    complianceConcerns: [],
    ...extra,
  };
}

test("an editorial note does not turn Nothing raised amber", () => {
  const card = quietCard({
    editorialVerdict: "concern",
    editorialConcerns: [{ concernCode: "immateriality", note: "The statement does not add meaningful information." }],
  });
  assert.equal(shownLabel(card), "Nothing raised");
  assert.equal(classifyCard(card, ON).cardTone, "green");
});

test("a house-style note does not turn Nothing raised amber", () => {
  const card = quietCard({
    editorialVerdict: "concern",
    editorialConcerns: [{ concernCode: "thousand_separator", note: "Use a comma." }],
  });
  assert.equal(shownLabel(card), "Nothing raised");
  assert.equal(classifyCard(card, ON).cardTone, "green");
});

test("a compliance hard concern still colours the card", () => {
  const card = quietCard({ complianceVerdict: "hard_concern", complianceConcerns: [{ concernCode: "precise_confidential_detail_in_public_version" }] });
  assert.equal(classifyCard(card, ON).cardTone, "red");
});

test("a soft compliance note does not turn Nothing raised amber", () => {
  const card = quietCard({
    complianceVerdict: "soft_concern",
    complianceConcerns: [{ concernCode: "caution_absolute", note: "The phrase is an absolute claim." }],
  });
  assert.equal(shownLabel(card), "Nothing raised");
  assert.equal(classifyCard(card, ON).cardTone, "green");
});
