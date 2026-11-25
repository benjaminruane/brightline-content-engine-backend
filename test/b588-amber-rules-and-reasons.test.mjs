/**
 * B588. An unmatched fact stays amber. A reader-only card is counted.
 * The reader is given the evidence point. An amber reason that still agrees
 * falls back to the match explanation. Every incomplete check is a problem.
 * No model call.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";
import { cardReason } from "../lib/qc/card-reason.mjs";
import { READING_NOTE_PROMPT } from "../lib/qc/reading-contract.mjs";
import { evidenceFindingsForReader, readingNoteSystem, readingUserPrompt } from "../lib/qc/reading-review.mjs";
import { summariseReview } from "../lib/qc/review-summary.mjs";
import { stampReviewReference } from "../lib/export/review-reference.mjs";
import {
  incompleteEvidenceProblem,
  readerOnlyIncomplete,
  recordIncompleteEvidenceProblem,
  shownLabel,
  shownState,
} from "../lib/qc/shown-verdict.mjs";

const adapt = JSON.parse(readFileSync(new URL("./fixtures/b588/patria-adapt-s1.json", import.meta.url), "utf8"));
const gemspring = JSON.parse(readFileSync(new URL("./fixtures/b582/gemspring-dirty-after-b581.json", import.meta.url), "utf8"));
const stored = JSON.parse(readFileSync(new URL("./fixtures/b588/stored-review-response.json", import.meta.url), "utf8"));

test("an unmatched fact on an incomplete adapt card stays Needs a look and names the fact", () => {
  assert.equal(shownState(adapt), "note_withheld");
  assert.equal(shownLabel(adapt), "Needs a look");
  const reason = cardReason(adapt);
  assert.match(reason, /Middle East/);
  assert.equal(/\bin line with\b/i.test(reason), false);
  assert.equal(readerOnlyIncomplete(adapt), false);
});

test("a reader-only card is counted as not fully checked, and an unmatched fact is not", () => {
  const quiet = { ...adapt, unmatchedElements: [] };
  assert.equal(readerOnlyIncomplete(quiet), true);
  const summary = summariseReview([quiet], {
    evidenceEnabled: true,
    editorialEnabled: false,
    complianceEnabled: false,
  });
  assert.equal(summary.notChecked, 1);
  assert.equal(summary.readiness, "Not fully checked");
  const raised = summariseReview([adapt], {
    evidenceEnabled: true,
    editorialEnabled: false,
    complianceEnabled: false,
  });
  assert.equal(raised.notChecked, 0);
});

test("every incomplete evidence check is a review problem, and one finished check is not", () => {
  const problem = incompleteEvidenceProblem([adapt, { ...adapt }]);
  assert.equal(problem.route, "review");
  assert.match(problem.message, /incomplete/);
  const calls = [];
  return recordIncompleteEvidenceProblem([adapt, adapt], (item) => {
    calls.push(item);
  }).then((recorded) => {
    assert.equal(recorded.route, "review");
    assert.equal(calls.length, 1);
    assert.equal(incompleteEvidenceProblem([adapt, { evidenceNotReviewedReason: "", matchExplanations: [{ classification: "confirmed" }] }]), null);
  });
});

test("the reader is told to write an evidence point without agreement wording", () => {
  assert.match(READING_NOTE_PROMPT, /When the user message includes an evidence check/);
  assert.match(READING_NOTE_PROMPT, /Do not use supports, in line with, consistent with, as the sentence says/);
  const card = gemspring.statements[0].qcCard;
  const evidence = evidenceFindingsForReader(card);
  const user = readingUserPrompt(card.statement, [], evidence);
  assert.match(user, /Evidence check:/);
  assert.match(user, /more selective/);
  const system = readingNoteSystem("The fund closed in three months.", "");
  assert.match(system, /evidence check/);
});

test("an amber reason that agrees anywhere falls back to the match explanation", () => {
  const card = gemspring.statements[0].qcCard;
  const reason = cardReason(card);
  assert.equal(/\bsupports\b/i.test(reason), false);
  assert.match(reason, /does not explicitly state that the market has become more selective/);
  assert.equal(/additional evaluative claim/i.test(reason), false);
});

test("a stored review response carries the reference the export and the heading share", () => {
  const stamped = stampReviewReference({ traceId: stored.meta.traceId }, stored.meta.analysisRunId);
  assert.equal(stamped.reviewReference, stored.meta.reviewReference);
  assert.match(stored.meta.reviewReference, /^R-[0-9A-F]{4}$/);
  assert.throws(() => stampReviewReference({}, ""), /review id is missing/);
});
