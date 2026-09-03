/**
 * B149: a widened supportSpan classified conflicting must not grant
 * permission to edit. Widened spans never feed Stage 3.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import {
  sourceSpokeTestsFired,
  statementIsSilent,
} from "../lib/revise-actions/silence.mjs";
import { sortFinding } from "../lib/revise-actions/sort.mjs";

function partialCard(extra = {}) {
  return {
    supportState: "partial",
    displayVerdict: "supported_partial",
    hasConflict: false,
    stage2SourceFingerprints: [{ classification: "partially_confirmed" }],
    unsupportedSpans: [],
    supportSpans: [],
    claims: [],
    conflictExcerpt: null,
    conflictValues: null,
    conflictEvidence: null,
    ...extra,
  };
}

function evidenceFinding(card) {
  return {
    kind: "evidence",
    rule: "partial",
    statement: "Comparable managers have returned 2.3 times gross MOIC.",
    card,
  };
}

describe("B149 silence does not read widened span conflicts", () => {
  test("partial card whose only conflict mark is supportSpans is silent", () => {
    const card = partialCard({
      supportSpans: [{ classification: "conflicting", passage: "marked at 1.4 times" }],
    });
    assert.equal(sourceSpokeTestsFired(card).includes("supportSpan_classification_conflicting"), false);
    assert.equal(statementIsSilent(card), true);
    const sorted = sortFinding(evidenceFinding(card), statementIsSilent(card));
    assert.equal(sorted.disposition, "ACKNOWLEDGE");
    assert.equal(sorted.sort?.reasonCode, "silence_no_edit");
  });

  test("Stage 3 conflicting supportState alone still grants ACTION", () => {
    const card = partialCard({
      supportState: "conflicting",
      displayVerdict: "conflict",
      hasConflict: false,
      stage2SourceFingerprints: [],
    });
    assert.deepEqual(sourceSpokeTestsFired(card), ["supportState_conflicting"]);
    assert.equal(statementIsSilent(card), false);
    const sorted = sortFinding(
      { kind: "evidence", rule: "conflicting", statement: "Net IRR is 18.4%.", card },
      statementIsSilent(card)
    );
    assert.equal(sorted.disposition, "ACTION");
  });

  test("hasConflict on a partial card still grants ACTION", () => {
    const card = partialCard({ hasConflict: true });
    assert.deepEqual(sourceSpokeTestsFired(card), ["hasConflict"]);
    assert.equal(statementIsSilent(card), false);
    const sorted = sortFinding(evidenceFinding(card), statementIsSilent(card));
    assert.equal(sorted.disposition, "ACTION");
  });

  test("Stage 2 single-pick conflicting on a partial card still grants ACTION", () => {
    const card = partialCard({
      stage2SourceFingerprints: [{ classification: "conflicting" }],
    });
    assert.deepEqual(sourceSpokeTestsFired(card), ["stage2_classification_conflicting"]);
    assert.equal(statementIsSilent(card), false);
    const sorted = sortFinding(evidenceFinding(card), statementIsSilent(card));
    assert.equal(sorted.disposition, "ACTION");
  });
});
