/**
 * B300. Every path that marks a check not-completed records why.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test, vi } from "vitest";
import * as observability from "../lib/observability.js";
import { RateLimitBoundError } from "../lib/qc/request-budget.mjs";
import {
  isZeroTokenFailure,
  notReviewedReasonFromFailure,
  NOT_REVIEWED_REASONS,
} from "../lib/qc/not-reviewed-reason.mjs";
import { runEditorialComplianceReview } from "../lib/qc/editorial-compliance-reviewer.mjs";
import { assembleCard } from "../lib/qc/pipeline-v3/stage7-assemble-card.mjs";

const STATEMENT = "The company generated EUR 92 million of revenue in FY2024.";

const REVIEWS_ON = {
  evidenceEnabled: true,
  editorialEnabled: true,
  complianceEnabled: true,
};

const CLEAN_EDITORIAL_JSON = JSON.stringify({
  verdict: "clean",
  concerns: [],
  verdictNote: "No editorial or style concerns identified under the listed rules.",
});

function emptyQcCard() {
  return {
    suppressInQcWorkbench: false,
    editorialVerdict: null,
    editorialConcerns: null,
    editorialNote: null,
    editorialSuggestedDirection: null,
    editorialSuggestedRewrite: null,
    complianceVerdict: null,
    complianceConcerns: null,
    complianceNote: null,
    complianceSuggestedDirection: null,
    complianceSuggestedRewrite: null,
  };
}

function statementEntry(editorialResult) {
  return {
    statementText: STATEMENT,
    startChar: 0,
    endChar: STATEMENT.length,
    sourceMatches: [{ sourceIndex: 0, classification: "confirmed", sourceLabel: "memo" }],
    verdictResult: {
      verdict: "confirmed",
      hasConflict: false,
      confirmingMatches: [{ sourceIndex: 0, sourceLabel: "memo" }],
      contributingSourceIndices: [0],
    },
    excerptResult: {
      primaryExcerpt: { passage: STATEMENT, sourceLabel: "memo" },
    },
    editorialResult,
  };
}

function reviewContext() {
  return {
    pipelineRoute: "v4",
    outputType: "reporting_commentary",
    requiredVersion: "complete",
    draftText: STATEMENT,
    sources: [{ text: STATEMENT, label: "memo" }],
    editorialEnabled: true,
    complianceEnabled: true,
    authoringOrganisation: "Brightline",
  };
}

async function reviewThenAssemble(stubCallLLM) {
  const qcCard = emptyQcCard();
  const reviewStatement = { text: STATEMENT, qcCard };
  vi.spyOn(observability, "hasProviderApiKey").mockReturnValue(true);
  vi.spyOn(observability, "callLLM").mockImplementation(stubCallLLM);
  await runEditorialComplianceReview([reviewStatement], reviewContext());
  const card = await assembleCard(statementEntry(reviewStatement.qcCard), 0, {
    pipelineRoute: "v4",
    skipEditorialDuplicationJudge: true,
    reviewOptions: REVIEWS_ON,
  });
  return { qcCard: reviewStatement.qcCard, card };
}

const prevGate = process.env.BRIGHTLINE_EDITORIAL_REVIEW;

beforeEach(() => {
  process.env.BRIGHTLINE_EDITORIAL_REVIEW = "1";
});

afterEach(() => {
  if (prevGate === undefined) delete process.env.BRIGHTLINE_EDITORIAL_REVIEW;
  else process.env.BRIGHTLINE_EDITORIAL_REVIEW = prevGate;
  vi.restoreAllMocks();
});

describe("B300 not-reviewed reasons", () => {
  test("reason vocabulary names the failure classes that occur", () => {
    assert.equal(NOT_REVIEWED_REASONS.RATE_LIMIT_WINDOW, "rate_limit_window");
    assert.equal(NOT_REVIEWED_REASONS.SCHEMA_INVALID, "schema_invalid");
    assert.equal(NOT_REVIEWED_REASONS.EMPTY_COMPLETION, "empty_completion");
    assert.equal(NOT_REVIEWED_REASONS.THROWN_CALL, "thrown_call");
    assert.equal(NOT_REVIEWED_REASONS.ZERO_TOKEN_FAILURE, "zero_token_failure");
    assert.equal(NOT_REVIEWED_REASONS.EMPTY_RESULT, "empty_result");
    assert.equal(NOT_REVIEWED_REASONS.MISSING_PROVIDER_KEY, "missing_provider_key");
  });

  test("a zero-token sub-second throw is zero_token_failure, not schema_invalid", () => {
    const err = new Error("provider returned nothing");
    err.latencyMs = 228;
    assert.equal(isZeroTokenFailure(err), true);
    assert.equal(notReviewedReasonFromFailure(err), NOT_REVIEWED_REASONS.ZERO_TOKEN_FAILURE);
  });

  test("a throw without a fast empty completion is thrown_call", () => {
    const err = new Error("provider down");
    assert.equal(notReviewedReasonFromFailure(err), NOT_REVIEWED_REASONS.THROWN_CALL);
  });

  test("a rate-limit bound is still rate_limit_window", () => {
    const err = new RateLimitBoundError("bound", { waitMs: 1, boundMs: 1 });
    assert.equal(notReviewedReasonFromFailure(err), NOT_REVIEWED_REASONS.RATE_LIMIT_WINDOW);
  });

  test("an unparseable compliance reply stamps schema_invalid on the card", async () => {
    const { qcCard, card } = await reviewThenAssemble(async (args) => {
      if (args?.spanName === "qc-compliance-review") {
        return { text: "this is not json at all" };
      }
      return { text: CLEAN_EDITORIAL_JSON };
    });
    assert.equal(qcCard.complianceVerdict, "not_reviewed");
    assert.equal(qcCard.complianceNotReviewedReason, NOT_REVIEWED_REASONS.SCHEMA_INVALID);
    assert.equal(card.complianceNotReviewedReason, NOT_REVIEWED_REASONS.SCHEMA_INVALID);
  });

  test("an empty editorial completion stamps empty_completion", async () => {
    const { qcCard, card } = await reviewThenAssemble(async (args) => {
      if (args?.spanName === "editorial-style-review") {
        return { text: "" };
      }
      return { text: JSON.stringify({ violations: [] }) };
    });
    assert.equal(qcCard.editorialVerdict, "not_reviewed");
    assert.equal(qcCard.editorialNotReviewedReason, NOT_REVIEWED_REASONS.EMPTY_COMPLETION);
    assert.equal(card.editorialNotReviewedReason, NOT_REVIEWED_REASONS.EMPTY_COMPLETION);
  });

  test("a thrown editorial call stamps thrown_call and reaches the assembled card", async () => {
    const { qcCard, card } = await reviewThenAssemble(async () => {
      throw new Error("provider down");
    });
    assert.equal(qcCard.editorialVerdict, "not_reviewed");
    assert.equal(qcCard.editorialNotReviewedReason, NOT_REVIEWED_REASONS.THROWN_CALL);
    assert.equal(card.editorialNotReviewedReason, NOT_REVIEWED_REASONS.THROWN_CALL);
    assert.equal(qcCard.complianceNotReviewedReason, NOT_REVIEWED_REASONS.THROWN_CALL);
  });

  test("a zero-token sub-second throw on the editorial call stamps zero_token_failure", async () => {
    const { qcCard, card } = await reviewThenAssemble(async () => {
      const err = new Error("empty generation");
      err.latencyMs = 228;
      throw err;
    });
    assert.equal(qcCard.editorialNotReviewedReason, NOT_REVIEWED_REASONS.ZERO_TOKEN_FAILURE);
    assert.equal(card.editorialNotReviewedReason, NOT_REVIEWED_REASONS.ZERO_TOKEN_FAILURE);
  });
});
