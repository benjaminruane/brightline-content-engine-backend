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
import { NO_PROPOSAL, sortFinding } from "../lib/revise-actions/sort.mjs";
import { fillAction } from "../lib/revise-actions/run.mjs";

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

function notSupportedCard(extra = {}) {
  return {
    supportState: "not_supported",
    displayVerdict: "not_supported",
    hasConflict: false,
    stage2SourceFingerprints: [],
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

function editorialFinding(card) {
  return {
    kind: "editorial",
    rule: "marketing_language_excess",
    statement: "Comparable managers have returned 2.3 times gross MOIC.",
    suggestedDirection: "Drop the marketing claim.",
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
    assert.equal(sorted.sort?.reasonCode, "partial_no_edit");
  });

  test("conflict-free partial is silent but evidence copy is partial_no_edit", () => {
    const card = partialCard();
    assert.equal(statementIsSilent(card), true);
    const sorted = sortFinding(evidenceFinding(card), statementIsSilent(card));
    assert.equal(sorted.disposition, "ACKNOWLEDGE");
    assert.equal(sorted.sort?.reasonCode, "partial_no_edit");
    assert.equal(sorted.noProposalReason, NO_PROPOSAL.partial_no_edit);
  });

  test("not_supported with no conflict signal still uses silence_no_edit", () => {
    const card = notSupportedCard();
    assert.equal(statementIsSilent(card), true);
    const sorted = sortFinding(
      { kind: "evidence", rule: "not_supported", statement: "Net IRR is 18.4%.", card },
      statementIsSilent(card)
    );
    assert.equal(sorted.disposition, "ACKNOWLEDGE");
    assert.equal(sorted.sort?.reasonCode, "silence_no_edit");
    assert.equal(
      sorted.noProposalReason,
      "No supplied source speaks to this claim, either way. Nothing is proposed and the wording is yours."
    );
    assert.equal(sorted.noProposalReason, NO_PROPOSAL.silence_no_edit);
  });

  test("editorial on a conflict-free partial uses partial_policy not policy_forbids", () => {
    const card = partialCard();
    assert.equal(statementIsSilent(card), true);
    const sorted = sortFinding(editorialFinding(card), statementIsSilent(card));
    assert.equal(sorted.disposition, "ACKNOWLEDGE");
    assert.equal(sorted.sort?.reasonCode, "partial_policy");
    assert.equal(sorted.noProposalReason, NO_PROPOSAL.partial_policy);
    assert.notEqual(sorted.sort?.reasonCode, "policy_forbids");
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

describe("conflict-signal cards stay ACTION at sort; fill cheap-paths when not closable", () => {
  async function fillConflicting(statement) {
    let called = 0;
    const result = await fillAction(
      {
        id: "S0:evidence:conflicting:0",
        disposition: "ACTION",
        statementId: "0",
        statement,
        kind: "evidence",
        rule: "conflicting",
        thing1: null,
        thing1State: "NONE",
        thing2: "",
        primaryExcerpt: "",
        sort: {
          policyPermit: true,
          silenceOnCard: false,
          rule: "conflicting",
          reasonCode: "permitted",
        },
      },
      {
        callModel: async () => {
          called += 1;
          return { text: "{}" };
        },
      }
    );
    return { result, called };
  }

  test("Stage 3 conflicting supportState fill is ACKNOWLEDGE when not closable", async () => {
    const { result, called } = await fillConflicting("Net IRR is 18.4%.");
    assert.equal(called, 0);
    assert.equal(result.disposition, "ACKNOWLEDGE");
    assert.equal(result.sort?.reasonCode, "conflict_unaddressed");
  });

  test("hasConflict on a partial card fill is ACKNOWLEDGE when the finding is conflicting and not closable", async () => {
    const { result, called } = await fillConflicting("Comparable managers have returned 2.3 times gross MOIC.");
    assert.equal(called, 0);
    assert.equal(result.disposition, "ACKNOWLEDGE");
    assert.equal(result.sort?.reasonCode, "conflict_unaddressed");
  });

  test("Stage 2 single-pick conflicting fill is ACKNOWLEDGE when not closable", async () => {
    const { result, called } = await fillConflicting("Net IRR is 18.4%.");
    assert.equal(called, 0);
    assert.equal(result.disposition, "ACKNOWLEDGE");
    assert.equal(result.sort?.reasonCode, "conflict_unaddressed");
  });
});
