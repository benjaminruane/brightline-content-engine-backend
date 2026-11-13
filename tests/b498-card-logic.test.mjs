/**
 * B498. One severity scale, an incomplete check is amber, recency once per draft.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { applyClearingLine, CLEARING_LINE } from "../lib/qc/clearing-line.mjs";
import { combinedVerdict } from "../lib/qc/combined-verdict.mjs";
import { readerEvidenceSentence } from "../lib/qc/reader-reason.mjs";
import { recencyLine, recencySummary } from "../lib/qc/recency-summary.mjs";
import { dropSharedPhrase } from "../lib/qc/same-phrase.mjs";
import { summariseReview } from "../lib/qc/review-summary.mjs";
import { shownLabel, shownState, shownTier } from "../lib/qc/shown-verdict.mjs";
import { statementClaimsDone } from "../lib/qc/transaction-state.mjs";

const REFUSED_SENTENCE = "The figures in this sentence match the source. The check that reads the whole claim did not finish, so read this sentence against the source yourself.";
const OPTIONS = { evidenceEnabled: true, editorialEnabled: true, complianceEnabled: true };

function edge(card) {
  return combinedVerdict({
    verdict: { state: shownState(card) || "nothing_raised" },
    editorialConcerns: Array.isArray(card.editorialConcerns) ? card.editorialConcerns : [],
    complianceVerdict: card.complianceVerdict,
    complianceConcerns: Array.isArray(card.complianceConcerns) ? card.complianceConcerns : [],
  }).tone;
}

test("a status card shown as Conflicts has a red edge", () => {
  const card = {
    statement: "We are writing to inform you of a new investment in Pinterest.",
    statementVerdict: { state: "nothing_raised" },
    sentenceState: "nothing_raised",
    displayVerdict: "supported_full",
    readingNote: { bucket: "beyond", text: "The documents are still open.", completion: "pending" },
  };
  assert.equal(shownLabel(card), "Conflicts with the source");
  assert.equal(shownTier(shownState(card)), "demands");
  assert.equal(edge(card), "red");
});

test("a refused reading that the evidence backed is Needs a look, amber, and says why", () => {
  const card = {
    statement: "Revenue was EUR 10 million.",
    displayVerdict: "supported_full",
    statementVerdict: { state: "note_withheld" },
    readingNote: { refused: true },
    evidenceNotReviewedReason: "",
  };
  assert.equal(shownState(card), "note_withheld");
  assert.equal(shownLabel(card), "Needs a look");
  assert.equal(shownTier("note_withheld"), "light");
  assert.equal(edge(card), "amber");
  assert.equal(readerEvidenceSentence(card), REFUSED_SENTENCE);
  assert.equal(readerEvidenceSentence(card).includes("came back empty"), false);
});

test("a refused reading the evidence did not back shows the evidence verdict", () => {
  const card = {
    statement: "Revenue was EUR 10 million.",
    displayVerdict: "not_supported",
    statementVerdict: { state: "note_withheld" },
    readingNote: { refused: true },
  };
  assert.equal(shownState(card), "not_in_source");
  assert.equal(shownLabel(card), "Not in the source");
});

test("a refused reading of an invested claim against a recommendation is Conflicts", () => {
  const card = {
    statement: "We have invested EUR 158 million.",
    displayVerdict: "supported_partial",
    statementVerdict: { state: "note_withheld" },
    readingNote: { refused: true },
    primaryExcerpt: "We recommend an investment of EUR 158 million.",
  };
  assert.equal(shownState(card), "conflicts");
  assert.equal(shownLabel(card), "Conflicts with the source");
  assert.equal(edge(card), "red");
});

test("partial is shown as Goes beyond the source and counted with it", () => {
  const partial = { statementVerdict: { state: "partial" }, displayVerdict: "supported_partial" };
  const beyond = { statementVerdict: { state: "beyond" }, displayVerdict: "supported_full" };
  assert.equal(shownLabel(partial), "Goes beyond the source");
  assert.equal(shownLabel(beyond), "Goes beyond the source");
  const summary = summariseReview([partial, beyond], OPTIONS);
  assert.equal(summary.evidence.beyond, 2);
  assert.equal(summary.evidence.partial || 0, 0);
});

test("recency is a draft list, one source with its count", () => {
  const summary = recencySummary([
    { sourceRecencyConcerns: [{ sourceName: "IC memo", date: "14 March 2023", age: "3 years", statementIndex: 1 }] },
    { sourceRecencyConcerns: [{ sourceName: "IC memo", date: "14 March 2023", age: "3 years", statementIndex: 4 }] },
  ]);
  assert.equal(summary.length, 1);
  assert.equal(summary[0].name, "IC memo");
  assert.deepEqual(summary[0].statementIndices, [1, 4]);
  assert.match(recencyLine(summary[0]), /2 sentences are written as current but rest on IC memo, dated 14 March 2023 \(3 years\)/);
});

test("the closing-document sentence never remains in shown text", () => {
  const text = "The memo still recommends the investment. Adding the closing document will clear this.";
  assert.equal(applyClearingLine(text).includes(CLEARING_LINE), false);
});

test("an editorial concern that quotes the compliance phrase is not shown", () => {
  const editorial = [{ note: "The draft says the firm is 'exceptionally well positioned'." }];
  const compliance = [{ note: "Do not claim the firm is 'exceptionally well positioned'." }];
  const dropped = dropSharedPhrase(editorial, compliance);
  assert.equal(dropped.editorial.length, 0);
  assert.equal(dropped.silences.length, 1);
  assert.equal(dropped.silences[0].id, "same_phrase");
});

test("header labels and summary counts agree", () => {
  const cards = [
    { statementVerdict: { state: "conflicts" }, displayVerdict: "conflict" },
    { statementVerdict: { state: "partial" }, displayVerdict: "supported_partial" },
    { statementVerdict: { state: "beyond" }, displayVerdict: "supported_full" },
    { statementVerdict: { state: "note_withheld" }, displayVerdict: "supported_full", evidenceNotReviewedReason: "empty_completion" },
    { statementVerdict: { state: "nothing_raised" }, displayVerdict: "supported_full" },
  ];
  const labels = cards.map((card) => shownLabel(card));
  const summary = summariseReview(cards, OPTIONS);
  assert.equal(summary.evidence.conflicting, labels.filter((label) => label === "Conflicts with the source").length);
  assert.equal(summary.evidence.beyond, labels.filter((label) => label === "Goes beyond the source").length);
  assert.equal(summary.evidence.needsLook, labels.filter((label) => label === "Needs a look").length);
});

test("a word limit does not change the assessment verdict", () => {
  const cards = [{
    statementVerdict: { state: "nothing_raised" },
    displayVerdict: "supported_full",
    editorialVerdict: "clean",
    complianceVerdict: "clean",
  }];
  const over = cards.map((card) => ({ ...card, wordLimitOver: 40 }));
  assert.equal(summariseReview(cards, OPTIONS).readiness, "Ready");
  assert.equal(summariseReview(over, OPTIONS).readiness, summariseReview(cards, OPTIONS).readiness);
});

test("as the hold progresses is not a done claim", () => {
  assert.equal(statementClaimsDone("We look forward to providing further updates as the hold progresses."), false);
});
