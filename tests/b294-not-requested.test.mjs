/**
 * B294. A switched-off check is not a miss and is never clean.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { assembleCard } from "../lib/qc/pipeline-v3/stage7-assemble-card.mjs";
import { classifyCard, summariseReview } from "../lib/qc/review-summary.mjs";

const STATEMENT = "Oakfield Partners closed Fund III at EUR 400 million in March 2025.";

function statementEntry(editorialResult) {
  return {
    statementText: STATEMENT,
    startChar: 0,
    endChar: STATEMENT.length,
    sourceMatches: [{ sourceIndex: 0, classification: "confirmed", sourceLabel: "memo", passage: STATEMENT }],
    verdictResult: {
      verdict: "confirmed",
      hasConflict: false,
      contributingSourceIndices: [0],
    },
    excerptResult: {
      primaryExcerpt: { passage: STATEMENT, sourceLabel: "memo" },
    },
    supportSpans: [{ passage: STATEMENT, classification: "confirmed" }],
    editorialResult,
  };
}

const EVIDENCE_ONLY = {
  evidenceEnabled: true,
  editorialEnabled: false,
  complianceEnabled: false,
};

describe("B294 not requested is not a miss", () => {
  test("assemble still stamps not_reviewed when editorial is off, and classifyCard keeps that off", async () => {
    const card = await assembleCard(
      statementEntry({
        editorialVerdict: "clean",
        editorialConcerns: [],
        complianceVerdict: "clean",
        complianceConcerns: [],
      }),
      0,
      {
        pipelineRoute: "v4",
        reviewOptions: EVIDENCE_ONLY,
        skipEditorialDuplicationJudge: true,
        sources: [{ text: STATEMENT, label: "memo" }],
      }
    );
    assert.equal(card.editorialVerdict, "not_reviewed");
    assert.equal(card.complianceVerdict, "not_reviewed");
    const cls = classifyCard(card, EVIDENCE_ONLY);
    assert.equal(cls.evidence, "confirmed");
    assert.equal(cls.editorial, null);
    assert.equal(cls.compliance, null);
    assert.equal(cls.cardTone, "green");
  });

  test("a switched-off check is not counted clean and is not counted as a hole", () => {
    const cards = [
      {
        displayVerdict: "supported_full",
        editorialVerdict: "not_reviewed",
        complianceVerdict: "not_reviewed",
      },
    ];
    const summary = summariseReview(cards, EVIDENCE_ONLY);
    assert.equal(summary.editorial, null);
    assert.equal(summary.compliance, null);
    assert.equal(summary.notChecked, 0);
    assert.equal(summary.readiness, "Ready");
    assert.equal(summary.evidence.confirmed, 1);
  });

  test("a requested miss is still not clean", () => {
    const on = {
      evidenceEnabled: true,
      editorialEnabled: true,
      complianceEnabled: true,
    };
    const cards = [
      {
        displayVerdict: "supported_full",
        editorialVerdict: "not_reviewed",
        complianceVerdict: "clean",
      },
    ];
    const cls = classifyCard(cards[0], on);
    assert.equal(cls.editorial, "notChecked");
    assert.equal(cls.compliance, "clean");
    assert.equal(cls.cardTone, "amber");
    const summary = summariseReview(cards, on);
    assert.equal(summary.editorial.notChecked, 1);
    assert.equal(summary.editorial.concerns, 0);
    assert.equal(summary.readiness, "Not fully checked");
  });
});
