/**
 * B563. A card keeps its verdict. Prose that contradicts it is replaced
 * with the excerpt line, and the colour follows the label.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { enforceCardConsistency } from "../lib/qc/card-consistency.mjs";
import { shownLabel } from "../lib/qc/shown-verdict.mjs";

const ROYAL_SANDERS = "Royal Sanders, a European private label and contract manufacturing producer of personal care products, was the largest contributor to Private Equity performance growth after Action.";
const ROYAL_PASSAGE = "Royal Sanders, a leading European private label and contract manufacturing producer of personal care products, was the largest contributor to our Private Equity performance growth in FY2025, excluding Action.";
const DENIAL = "The sources do not address the statement. They do not mention Royal Sanders or its contribution to Private Equity performance growth after Action.";

function quietCard(prose, extra = {}) {
  return {
    statement: ROYAL_SANDERS,
    statementVerdict: { state: "nothing_raised" },
    displayVerdict: "supported_full",
    summaryClass: { cardTone: "green", compliance: "clean", evidence: "nothingRaised", editorial: "clean" },
    reasoningParagraph: prose,
    evidenceSummary: prose,
    readingNote: {
      bucket: "none",
      text: "",
      documentValues: [{ document: "3i-press-release-fy2025.pdf", value: ROYAL_PASSAGE }],
    },
    ...extra,
  };
}

test("the Royal Sanders card stays Nothing raised and loses the denial", () => {
  const card = quietCard(DENIAL);
  assert.equal(shownLabel(card), "Nothing raised");
  const cases = enforceCardConsistency(card);
  assert.equal(shownLabel(card), "Nothing raised");
  assert.equal(card.summaryClass.cardTone, "green");
  assert.equal(card.statementVerdict.state, "nothing_raised");
  assert.equal(/do not mention|do not address|not supported|contradict/i.test(card.reasoningParagraph), false);
  assert.match(card.reasoningParagraph, /The source says /);
  assert.doesNotMatch(card.reasoningParagraph, /\bstates "/);
  assert.match(card.reasoningParagraph, /Royal Sanders/);
  assert.equal(card.evidenceSummary, card.reasoningParagraph);
  assert.equal(cases.length, 1);
  assert.equal(cases[0].kind, "prose");
  assert.match(cases[0].before, /do not mention Royal Sanders/);
  assert.equal(cases[0].after, card.reasoningParagraph);
  assert.equal(enforceCardConsistency(card).length, 0);
});

test("a quiet card does not say the claim is unsupported or contradicted", () => {
  for (const prose of [
    "The claim is not supported by the sources.",
    "The statement is contradicted by the sources.",
    "This is not in the source.",
  ]) {
    const card = quietCard(prose);
    enforceCardConsistency(card);
    assert.equal(/not supported|contradict|not in the source/i.test(card.reasoningParagraph), false);
    assert.match(card.reasoningParagraph, /Royal Sanders/);
    assert.equal(card.summaryClass.cardTone, "green");
    assert.equal(enforceCardConsistency(card).length, 0);
  }
});

test("a quiet quote is left alone", () => {
  const line = `3i-press-release-fy2025 states "${ROYAL_PASSAGE}"`;
  const card = quietCard(line);
  assert.deepEqual(enforceCardConsistency(card), []);
  assert.equal(card.reasoningParagraph, line);
});

test("a Conflicts card names both passages", () => {
  const card = {
    statement: "Revenue grew 22%.",
    statementVerdict: { state: "conflicts" },
    displayVerdict: "conflicting",
    summaryClass: { cardTone: "red", compliance: "clean", evidence: "conflicting" },
    reasoningParagraph: "The source says 10%.",
    evidenceSummary: "The source says 10%.",
    primaryExcerpt: "Action reported 10.3% like-for-like sales growth.",
    conflictExcerpt: "Revenue grew 22% in the year.",
    readingNote: { bucket: "conflicts", text: "", documentValues: [{ document: "3i-press-release-fy2025.pdf", value: "Action reported 10.3% like-for-like sales growth." }] },
  };
  assert.equal(shownLabel(card), "Conflicts with the source");
  const cases = enforceCardConsistency(card);
  assert.equal(card.summaryClass.cardTone, "red");
  assert.equal(card.statementVerdict.state, "conflicts");
  assert.match(card.reasoningParagraph, /10\.3%/);
  assert.match(card.reasoningParagraph, /22%/);
  assert.equal(cases.some((row) => row.kind === "prose"), true);
  assert.equal(enforceCardConsistency(card).length, 0);
});

test("an amber card has a reason", () => {
  const card = {
    statement: "The board approved the dividend.",
    statementVerdict: { state: "note_withheld" },
    summaryClass: { cardTone: "amber", compliance: "clean", evidence: "needsLook" },
    reasoningParagraph: "",
    evidenceSummary: "",
    primaryExcerpt: "The Board has recommended a total dividend of 73.0 pence per share.",
    readingNote: { bucket: "none", text: "", documentValues: [{ document: "3i-press-release-fy2025.pdf", value: "The Board has recommended a total dividend of 73.0 pence per share." }] },
  };
  assert.equal(shownLabel(card), "Needs a look");
  enforceCardConsistency(card);
  assert.equal(card.summaryClass.cardTone, "amber");
  assert.match(card.reasoningParagraph, /73\.0 pence/);
  assert.equal(enforceCardConsistency(card).length, 0);
});

test("Nothing raised is green, and a compliance hard concern stays red", () => {
  const amber = quietCard(`3i-press-release-fy2025 states "${ROYAL_PASSAGE}"`, {
    summaryClass: { cardTone: "amber", compliance: "clean", evidence: "nothingRaised", editorial: "concern" },
  });
  const colour = enforceCardConsistency(amber);
  assert.equal(amber.summaryClass.cardTone, "green");
  assert.equal(colour.some((row) => row.kind === "colour" && row.before === "amber" && row.after === "green"), true);
  assert.equal(enforceCardConsistency(amber).length, 0);

  const hard = quietCard(`3i-press-release-fy2025 states "${ROYAL_PASSAGE}"`, {
    summaryClass: { cardTone: "red", compliance: "hardConcern", evidence: "nothingRaised", editorial: "clean" },
  });
  assert.deepEqual(enforceCardConsistency(hard), []);
  assert.equal(hard.summaryClass.cardTone, "red");
  assert.equal(shownLabel(hard), "Nothing raised");
});
