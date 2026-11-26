/**
 * B604. The matcher labels a sentence a conflict but writes that the source
 * confirms it, and every figure, date and name matched (Aldermoor S3).
 * The card is quiet, never "the reason was not recorded".
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { applyReadingContract } from "../lib/qc/reading-contract.mjs";

const STATEMENT = "Aldermoor plans to build a portfolio of 12-15 portfolio companies with enterprise values of EUR 150-500 million.";
const CONFIRMED = "The sentence is confirmed by the source, which states the same portfolio size and enterprise value range.";
const facts = [
  { kind: "name", surface: "Aldermoor", status: "matched" },
  { kind: "figure", surface: "12-15", status: "matched" },
  { kind: "figure", surface: "EUR 150-500 million", status: "matched" },
];

test("a conflict written as a confirmation, with every fact matched, is quiet", () => {
  const card = applyReadingContract({
    statement: STATEMENT,
    displayVerdict: "conflict",
    displayVerdictReason: null,
    matchExplanations: [{ classification: "conflicting", writtenFor: "confirmed", explanation: CONFIRMED }],
  }, { facts, note: null });
  assert.equal(card.sentenceLabel, "Nothing raised");
  assert.doesNotMatch(card.displayedEvidenceProse || "", /reason was not recorded/i);
});

test("the same card with an unmatched figure stays Needs a look", () => {
  const card = applyReadingContract({
    statement: STATEMENT,
    displayVerdict: "conflict",
    displayVerdictReason: null,
    matchExplanations: [{ classification: "conflicting", writtenFor: "confirmed", explanation: CONFIRMED }],
  }, { facts: [...facts.slice(0, 2), { kind: "figure", surface: "EUR 150-500 million", status: "not_found" }], note: null });
  assert.notEqual(card.sentenceLabel, "Nothing raised");
});
