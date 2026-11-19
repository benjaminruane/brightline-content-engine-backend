/**
 * B535. A red or amber card needs a real reason.
 * The Harbourline closing stays a non-claim under the existing rule.
 * Conflicts with no reason stay the amber Needs a look that B531 locked.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { EMPTY_HEADLINE_REASON } from "../lib/qc/evidence-findings.mjs";
import { PARTIAL_UNRECORDED } from "../lib/qc/partial-sentence.mjs";
import { applyReadingContract } from "../lib/qc/reading-contract.mjs";
import { partitionClaimStatements, resolveIsClaim } from "../lib/qc/pipeline-v4/stage1-extract-statements.mjs";
import { statementEdgeTone, statementVerdictState } from "../../brightline-content-engine-frontend/src/modules/drafting/displayVerdictLabels.js";
import { readerEvidenceSentence } from "../../brightline-content-engine-frontend/src/modules/drafting/readerReason.js";

const CLOSING = "We will write again when Kestrel reports on the stake it holds.";
const PROCEEDS = "We will report the final proceeds of EUR 560 million in January.";
const KEEP_INFORMED = "We will keep you informed.";
const FALLBACK = /reason was not recorded/i;

function review(card, note, facts = []) {
  return applyReadingContract(card, { facts, note });
}

function screenTone(card) {
  return statementEdgeTone(statementVerdictState(card));
}

test("the B533 closing card is not red and does not show the fallback", () => {
  const card = review({
    statement: CLOSING,
    displayVerdict: "not_supported",
    displayVerdictReason: null,
  }, { bucket: "none", text: "" });
  assert.notEqual(card.sentenceState, "not_in_source");
  assert.notEqual(card.combinedVerdict.tone, "red");
  assert.notEqual(card.combinedVerdict.tone, "amber");
  assert.equal(FALLBACK.test(card.displayedEvidenceProse || ""), false);
  assert.notEqual(card.displayedEvidenceProse, EMPTY_HEADLINE_REASON);
  assert.notEqual(screenTone(card), "red");
  assert.notEqual(screenTone(card), "amber");
  assert.equal(FALLBACK.test(readerEvidenceSentence(card) || ""), false);
  assert.equal(card.silences.some((row) => row.id === "unexplained_flag_not_claimed"), true);
});

test("not in the source with no reason does not reach the screen", () => {
  const card = review({
    statement: "The board met in London.",
    displayVerdict: "not_supported",
  }, { bucket: "none", text: "" });
  assert.equal(card.sentenceState, "nothing_raised");
  assert.equal(card.combinedVerdict.tone, "none");
  assert.equal(screenTone(card), "green");
  assert.equal(FALLBACK.test(card.displayedEvidenceProse || ""), false);
});

test("not in the source with a missing figure stays raised", () => {
  const card = review({
    statement: "Revenue was EUR 10 million.",
    displayVerdict: "not_supported",
  }, { bucket: "none", text: "" }, [{ kind: "figure", status: "not_found", surface: "EUR 10 million" }]);
  assert.equal(card.sentenceState, "not_in_source");
  assert.equal(card.combinedVerdict.tone, "red");
});

test("beyond the source with no reason does not reach the screen", () => {
  const card = review({
    statement: "The fund will open a new office.",
    displayVerdict: "supported_full",
  }, { bucket: "beyond", text: "" });
  assert.equal(card.sentenceState, "nothing_raised");
  assert.notEqual(card.combinedVerdict.tone, "amber");
  assert.notEqual(screenTone(card), "amber");
  assert.equal(FALLBACK.test(readerEvidenceSentence(card) || ""), false);
});

test("beyond the source with a reason stays amber", () => {
  const reason = "The draft adds an office the source does not mention.";
  const card = review({
    statement: "The fund will open a new office.",
    displayVerdict: "supported_full",
  }, { bucket: "beyond", text: reason });
  assert.equal(card.sentenceState, "beyond");
  assert.equal(card.combinedVerdict.tone, "amber");
  assert.equal(card.displayedEvidenceProse, reason);
});

test("conflicts with no reason stay Needs a look and are not red", () => {
  const card = review({
    statement: "The figure is 10.",
    displayVerdict: "conflict",
    displayVerdictReason: null,
    matchExplanations: [{ classification: "conflicting", writtenFor: "candidate" }],
  }, null);
  assert.notEqual(card.combinedVerdict.tone, "red");
  assert.notEqual(screenTone(card), "red");
  assert.equal(card.sentenceLabel, "Needs a look");
  assert.equal(card.combinedVerdict.tone, "amber");
  assert.equal(card.silences.some((row) => row.id === "conflict_without_reason_downgraded"), true);
  assert.equal(FALLBACK.test(readerEvidenceSentence(card) || ""), false);
});

test("a partial with no recorded part is not red and does not use the empty headline", () => {
  const card = review({
    statement: "Revenue grew and the margin widened.",
    displayVerdict: "supported_partial",
  }, null);
  assert.equal(card.sentenceState, "partial");
  assert.notEqual(card.combinedVerdict.tone, "red");
  assert.notEqual(screenTone(card), "red");
  assert.equal(card.displayedEvidenceProse, PARTIAL_UNRECORDED);
  assert.equal(readerEvidenceSentence(card), PARTIAL_UNRECORDED);
  assert.equal(FALLBACK.test(card.displayedEvidenceProse), false);
});

test("needs a look with a dropped gross or net word keeps that reason", () => {
  const card = review({
    statement: "The IRR was 12 percent.",
    displayVerdict: "supported_full",
  }, { bucket: "none", text: "The source gives a net IRR.", escalate: "gross_net" });
  assert.equal(card.sentenceState, "note_withheld");
  assert.equal(card.combinedVerdict.tone, "amber");
  assert.match(card.displayedEvidenceProse, /gross|net/i);
  assert.equal(FALLBACK.test(card.displayedEvidenceProse), false);
});

test("the Harbourline closing is a non-claim and the proceeds sentence stays a claim", () => {
  assert.equal(resolveIsClaim(CLOSING, true), false);
  assert.equal(resolveIsClaim(CLOSING, false), false);
  assert.equal(resolveIsClaim(KEEP_INFORMED, true), false);
  assert.equal(resolveIsClaim(PROCEEDS, false), true);
  assert.equal(resolveIsClaim(PROCEEDS, true), true);
  const split = partitionClaimStatements([
    { text: CLOSING, charStart: 0, charEnd: CLOSING.length, isClaim: true },
    { text: PROCEEDS, charStart: 80, charEnd: 80 + PROCEEDS.length, isClaim: false },
  ]);
  assert.deepEqual(split.statements.map((row) => row.text), [PROCEEDS]);
  assert.deepEqual(split.droppedNonClaims.map((row) => row.text), [CLOSING]);
  assert.equal(split.droppedNonClaims[0].reason, "not_a_claim");
});
