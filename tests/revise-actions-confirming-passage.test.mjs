/**
 * Confirming passage: same document, remaining figure only.
 * The confirmed-figure sentence is emitted only when that passage is present.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import {
  CONFIRMING_PASSAGE_LABEL,
  applyConflictProposal,
  selectConfirmingPassage,
} from "../lib/revise-actions/conflict-engagement.mjs";
import { fillAction } from "../lib/revise-actions/run.mjs";

const STATEMENT =
  "The Company currently serves 380 property management companies across Sweden, Norway, Denmark, and Finland, collectively managing more than 240'000 residential units.";
const CONFLICTING =
  "The Company currently serves 412 property management companies, not 380 as stated in our initial memo.";
const CONFIRMING = "The platform collectively manages more than 240'000 residential units across the Nordics.";
const OTHER_DOC =
  "The platform serves over 380 property management companies across Sweden, Norway, Denmark, and Finland, collectively managing more than 240'000 residential units.";
const UNRELATED = "The Company was founded in 2013 by Erik Lindqvist and three co-founders.";

const PINNED_WITH_PASSAGE =
  "The source gives 412 property management companies, not the 380 in this sentence. It confirms the residential unit count, which is left unchanged.";
const PINNED_WITHOUT_PASSAGE =
  "The source gives 412 property management companies, not the 380 in this sentence.";

function throwingModel() {
  return async () => {
    throw new Error("rewrite model must not be called on contradicted evidence");
  };
}

function conflictEntry(card) {
  return {
    id: "S3:evidence:conflicting:0",
    disposition: "ACTION",
    statementId: "3",
    statement: STATEMENT,
    kind: "evidence",
    rule: "conflicting",
    thing1: null,
    thing1State: "NONE",
    thing2: "",
    primaryExcerpt: CONFLICTING,
    card,
    sort: {
      policyPermit: true,
      silenceOnCard: false,
      rule: "conflicting",
      reasonCode: "permitted",
    },
  };
}

function sameDocumentCard(extraSpans = []) {
  return {
    primaryExcerpt: { passage: CONFLICTING, sourceRefId: 1, sourceLabel: "18b_synth_cross_source_pair_update.txt" },
    supportSpans: [
      {
        sourceRefId: 1,
        classification: "conflicting",
        passage: CONFLICTING,
      },
      ...extraSpans,
    ],
  };
}

describe("confirming passage selection", () => {
  test("selects a same-document span that supports a figure left in the sentence", () => {
    const finding = conflictEntry(
      sameDocumentCard([
        { sourceRefId: 1, classification: "confirmed", passage: CONFIRMING },
      ])
    );
    const outcome = applyConflictProposal(finding);
    assert.equal(outcome.status, "replace");
    const selected = selectConfirmingPassage(
      finding,
      STATEMENT,
      CONFLICTING,
      outcome.pairs
    );
    assert.equal(selected.passage, CONFIRMING);
    assert.equal(selected.label, CONFIRMING_PASSAGE_LABEL);
    assert.equal(selected.figureLabel, "residential unit count");
  });

  test("does not select a confirming span from a different document", () => {
    const finding = conflictEntry({
      primaryExcerpt: { passage: CONFLICTING, sourceRefId: 1 },
      supportSpans: [
        { sourceRefId: 1, classification: "conflicting", passage: CONFLICTING },
        { sourceRefId: 0, classification: "confirmed", passage: OTHER_DOC },
      ],
    });
    const outcome = applyConflictProposal(finding);
    assert.equal(outcome.status, "replace");
    assert.equal(outcome.confirming, null);
    assert.equal(
      selectConfirmingPassage(finding, STATEMENT, CONFLICTING, outcome.pairs),
      null
    );
  });

  test("does not select a passage that supports nothing remaining in the draft sentence", () => {
    const finding = conflictEntry(
      sameDocumentCard([{ sourceRefId: 1, classification: "confirmed", passage: UNRELATED }])
    );
    const outcome = applyConflictProposal(finding);
    assert.equal(outcome.status, "replace");
    assert.equal(outcome.confirming, null);
  });

  test("when more than one same-document span qualifies, the first in card order wins", () => {
    const first = "Investors back a platform managing more than 240'000 residential units.";
    const second = "Portfolio coverage remains more than 240'000 residential units after the update.";
    const finding = conflictEntry(
      sameDocumentCard([
        { sourceRefId: 1, classification: "confirmed", passage: first },
        { sourceRefId: 1, classification: "confirmed", passage: second },
      ])
    );
    const outcome = applyConflictProposal(finding);
    assert.equal(outcome.confirming.passage, first);
  });
});

describe("confirmed-figure sentence", () => {
  test("emits the second sentence only when the confirming passage is present", async () => {
    const withPassage = await fillAction(
      conflictEntry(
        sameDocumentCard([{ sourceRefId: 1, classification: "confirmed", passage: CONFIRMING }])
      ),
      { callModel: throwingModel() }
    );
    assert.equal(withPassage.disposition, "ACTION");
    assert.equal(withPassage.confirmingPassage, CONFIRMING);
    assert.equal(withPassage.confirmingPassageLabel, CONFIRMING_PASSAGE_LABEL);
    assert.equal(withPassage.explanation, PINNED_WITH_PASSAGE);

    const without = await fillAction(conflictEntry(sameDocumentCard()), { callModel: throwingModel() });
    assert.equal(without.disposition, "ACTION");
    assert.equal(without.confirmingPassage, undefined);
    assert.equal(without.explanation, PINNED_WITHOUT_PASSAGE);
  });
});
