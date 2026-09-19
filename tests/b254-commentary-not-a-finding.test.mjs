/**
 * B254 / B262: a commentary call that did not succeed is not a finding.
 */
import assert from "node:assert/strict";
import { afterEach, describe, test, vi } from "vitest";
import * as observability from "../lib/observability.js";
import { generateCommentary } from "../lib/qc/pipeline-v4/stage5-generate-commentary.mjs";
import { assembleCard } from "../lib/qc/pipeline-v3/stage7-assemble-card.mjs";
import { classifyCard, summariseReview } from "../lib/qc/review-summary.mjs";
import { evidenceFindingForExport, renderCanonicalExportText } from "../lib/qc/export-review-data.mjs";

export const STANDIN_FRAGMENT = "Specific commentary is unavailable from the system";

export const STANDIN_STRINGS = [
  "Verdict: confirmed. Specific commentary is unavailable from the system; please review the source directly before finalizing.",
  "Verdict: partially confirmed. Specific commentary is unavailable from the system; please review the source and adjust the statement to match the source language.",
  "Verdict: conflicting. Specific commentary is unavailable from the system; please reconcile the contradiction or remove the claim.",
  "Verdict: not supported. Specific commentary is unavailable from the system; add a supporting source or remove the claim.",
];

const EXPORT_NOT_CHECKED = "Not checked.";

const REVIEWS_ON = {
  evidenceEnabled: true,
  editorialEnabled: true,
  complianceEnabled: true,
};

function rateLimitError() {
  const err = new Error(
    "Rate limit reached for gpt-4o. Limit 2000000, Used 2000000, Requested 1428. Please try again in 42ms."
  );
  err.status = 429;
  return err;
}

function statementEntry(commentaryResult) {
  return {
    statementText: "Revenue grew 12% year on year.",
    startChar: 0,
    endChar: 30,
    sourceMatches: [{ sourceIndex: 0, classification: "no_support", sourceLabel: "memo" }],
    verdictResult: {
      verdict: "not_supported",
      hasConflict: false,
      confirmingMatches: [],
      contributingSourceIndices: [],
    },
    excerptResult: { primaryExcerpt: null, conflictExcerpt: null },
    commentaryResult,
    editorialResult: {
      editorialVerdict: "clean",
      editorialConcerns: [],
      editorialNote: "No editorial or style concerns identified under the listed rules.",
      complianceVerdict: "clean",
      complianceConcerns: [],
      complianceNote: "No compliance concerns identified under the listed rules.",
    },
  };
}

describe("B254 a commentary miss is not a finding", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("a thrown commentary call returns empty prose, not a stand-in sentence", async () => {
    vi.spyOn(observability, "hasProviderApiKey").mockReturnValue(true);
    vi.spyOn(observability, "callLLM").mockRejectedValue(rateLimitError());
    const result = await generateCommentary({
      statement: "Revenue grew 12% year on year.",
      verdict: "not_supported",
      hasConflict: false,
      primaryExcerpt: null,
      conflictExcerpt: null,
      statementIndex: 0,
    });
    assert.equal(result.notReviewed, true);
    assert.equal(result.schemaValid, false);
    assert.equal(result.commentary, "");
    for (const standin of STANDIN_STRINGS) {
      assert.equal(JSON.stringify(result).includes(standin), false);
    }
    assert.equal(JSON.stringify(result).includes(STANDIN_FRAGMENT), false);
  });

  test("a schema miss returns empty prose, not a stand-in sentence", async () => {
    vi.spyOn(observability, "hasProviderApiKey").mockReturnValue(true);
    vi.spyOn(observability, "callLLM").mockResolvedValue({ text: "{not json", usage: {} });
    const result = await generateCommentary({
      statement: "Revenue grew 12% year on year.",
      verdict: "confirmed",
      hasConflict: false,
      primaryExcerpt: "ok",
      conflictExcerpt: null,
      statementIndex: 1,
    });
    assert.equal(result.notReviewed, true);
    assert.equal(result.commentary, "");
    assert.equal(JSON.stringify(result).includes(STANDIN_FRAGMENT), false);
  });

  test("the assembled card, counts, summary and export treat it as not checked", async () => {
    const card = await assembleCard(
      statementEntry({ commentary: "", schemaValid: false, notReviewed: true }),
      0,
      { pipelineRoute: "v4", skipEditorialDuplicationJudge: true, reviewOptions: REVIEWS_ON }
    );
    assert.equal(card.commentaryNotReviewed, true);
    assert.equal(card.evidenceSummary, "");
    assert.equal(card.reasoningParagraph, null);
    assert.equal(String(card.evidenceSummary || "").includes(STANDIN_FRAGMENT), false);
    assert.equal(card.displayVerdict, "not_supported");

    const cls = classifyCard(card, REVIEWS_ON);
    assert.equal(cls.evidence, "notChecked");
    const summary = summariseReview([card], REVIEWS_ON);
    assert.equal(summary.notChecked, 1);
    assert.equal(summary.evidence.notSupported, 0);
    assert.equal(summary.readiness, "Not fully checked");

    const finding = evidenceFindingForExport(card, false);
    assert.equal(finding, EXPORT_NOT_CHECKED);
    const exportText = renderCanonicalExportText({
      qcResult: { statements: [{ qcCard: card }], meta: { reviewOptions: REVIEWS_ON } },
      qualityReviewSummary: { readiness: summary.readiness, bullets: [] },
      reviewOptions: REVIEWS_ON,
    });
    assert.equal(exportText.includes(`Evidence finding: ${EXPORT_NOT_CHECKED}`), true);
    assert.equal(exportText.includes(STANDIN_FRAGMENT), false);
    for (const standin of STANDIN_STRINGS) {
      assert.equal(exportText.includes(standin), false);
    }
  });
});
