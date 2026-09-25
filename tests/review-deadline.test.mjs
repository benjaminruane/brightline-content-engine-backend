/**
 * B329. An incomplete review returns no cards and an honest account.
 * Deadline is proved by setting it low. No model calls.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { beginRequestBudget, RateLimitBoundError } from "../lib/qc/request-budget.mjs";
import { preflightReview, PREFLIGHT_REFUSAL_TEXT } from "../lib/qc/preflight-guard.mjs";
import { INCOMPLETE_CAUSES } from "../lib/qc/not-reviewed-reason.mjs";
import {
  REVIEW_COPY,
  REVIEW_COPY_AWAITING_BEN,
  REVIEW_RESPONSE_MARGIN_MS,
  buildIncompleteReviewResponse,
  causeClassFromHandlerError,
  isReviewComplete,
  isReviewDeadlineError,
  reviewOutcomeFromPipeline,
  surfacesFromReviewPayload,
  throwIfReviewDeadlineExceeded,
  ReviewDeadlineError,
} from "../lib/qc/review-deadline.mjs";
import { ReviewDidNotStartError } from "../lib/observability.js";

function hugeDraft(words) {
  return Array.from({ length: words }, (_, i) => `word${i}`).join(" ");
}

function hugeSource(words) {
  return Array.from({ length: words }, (_, i) => `source${i}`).join(" ");
}

const SYS = {
  editorialSystemTokens: 9088,
  complianceSystemTokens: 3000,
  stage2SystemTokens: 4000,
  stage5SystemTokens: 1600,
};

function twoStatementPipeline({ editorialMiss = false } = {}) {
  return {
    stage1: {
      statements: [
        { text: "Revenue grew to EUR 92 million.", index: 0 },
        { text: "Costs fell year on year.", index: 1 },
      ],
    },
    qcCards: [
      {
        index: 0,
        statement: "Revenue grew to EUR 92 million.",
        editorialVerdict: editorialMiss ? "not_reviewed" : "clean",
        complianceVerdict: "clean",
        displayVerdict: "supported_full",
      },
      {
        index: 1,
        statement: "Costs fell year on year.",
        editorialVerdict: "clean",
        complianceVerdict: "clean",
        displayVerdict: "supported_full",
      },
    ],
  };
}

describe("B329 incomplete review returns no cards", () => {
  test("a completed review with marked gaps is unchanged: every statement still has a card", () => {
    const pipeline = twoStatementPipeline({ editorialMiss: true });
    assert.equal(isReviewComplete(pipeline), true);
    const outcome = reviewOutcomeFromPipeline(pipeline);
    assert.equal(outcome.complete, true);
    assert.equal(pipeline.qcCards.length, 2);
    assert.equal(pipeline.qcCards[0].editorialVerdict, "not_reviewed");
    assert.equal(pipeline.qcCards[1].editorialVerdict, "clean");
  });

  test("a completed review with every check done is complete", () => {
    const pipeline = twoStatementPipeline({ editorialMiss: false });
    assert.equal(isReviewComplete(pipeline), true);
  });

  test("a run cut off before every statement has a card returns NO cards", () => {
    const pipeline = twoStatementPipeline();
    pipeline.qcCards = [pipeline.qcCards[0]];
    assert.equal(isReviewComplete(pipeline), false);
    const outcome = reviewOutcomeFromPipeline(pipeline);
    const body = buildIncompleteReviewResponse({
      cause: INCOMPLETE_CAUSES.DEADLINE,
      expectedSentences: outcome.expectedSentences,
      reachedSentences: outcome.reachedSentences,
    });
    assert.equal(body.ok, false);
    assert.deepEqual(body.statements, []);
    assert.equal(body.statements.length, 0);
    assert.equal(Array.isArray(body.statements) && body.statements.some((row) => row?.qcCard), false);
  });

  test("the honest account names the real cause", () => {
    const deadline = buildIncompleteReviewResponse({
      cause: INCOMPLETE_CAUSES.DEADLINE,
      expectedSentences: 12,
      reachedSentences: 0,
    });
    assert.equal(deadline.meta.incomplete.cause, "deadline");
    assert.match(deadline.error, /ran out of time/i);
    assert.match(deadline.error, /12 sentence/);
    assert.equal(deadline.error.includes("token"), false);
    assert.equal(deadline.error.includes("Stage"), false);

    const tooLarge = buildIncompleteReviewResponse({ cause: INCOMPLETE_CAUSES.TOO_LARGE });
    assert.equal(tooLarge.meta.incomplete.cause, "too_large");
    assert.equal(tooLarge.meta.incomplete.account, REVIEW_COPY.TOO_LARGE);

    const billing = buildIncompleteReviewResponse({ cause: INCOMPLETE_CAUSES.BILLING });
    assert.equal(billing.meta.incomplete.cause, "billing");
    assert.match(billing.error, /billed/);
    assert.match(billing.error, /not a fault in the product/);

    const capacity = buildIncompleteReviewResponse({ cause: INCOMPLETE_CAUSES.CAPACITY });
    assert.equal(capacity.meta.incomplete.cause, "capacity");

    const err = buildIncompleteReviewResponse({ cause: INCOMPLETE_CAUSES.ERROR });
    assert.equal(err.meta.incomplete.cause, "error");
    assert.match(err.error, /Something went wrong/);
  });

  test("causeClassFromHandlerError maps deadline, capacity, and billing to the real slug", () => {
    assert.equal(causeClassFromHandlerError(new ReviewDeadlineError()), INCOMPLETE_CAUSES.DEADLINE);
    assert.equal(causeClassFromHandlerError(new RateLimitBoundError("bound")), INCOMPLETE_CAUSES.CAPACITY);
    const didNotStart = new ReviewDidNotStartError();
    assert.equal(causeClassFromHandlerError(didNotStart), INCOMPLETE_CAUSES.CAPACITY);
    const billed = new ReviewDidNotStartError();
    billed.causeRefusal = { code: "insufficient_quota", status: 429 };
    assert.equal(causeClassFromHandlerError(billed), INCOMPLETE_CAUSES.BILLING);
    assert.equal(causeClassFromHandlerError(new Error("boom")), INCOMPLETE_CAUSES.ERROR);
  });

  test("a low deadline throws ReviewDeadlineError without a model call", async () => {
    await beginRequestBudget({ startedAt: Date.now() - 5_000, maxDurationMs: 1_000 }, async () => {
      let thrown = null;
      try {
        throwIfReviewDeadlineExceeded({ expectedSentences: 8, reachedSentences: 0 });
      } catch (err) {
        thrown = err;
      }
      assert.equal(isReviewDeadlineError(thrown), true);
      assert.equal(thrown.expectedSentences, 8);
      assert.ok(REVIEW_RESPONSE_MARGIN_MS >= 0);
    });
  });

  test("with time remaining, the deadline check does not throw", async () => {
    await beginRequestBudget({ startedAt: Date.now(), maxDurationMs: 300_000 }, async () => {
      throwIfReviewDeadlineExceeded({ expectedSentences: 8, reachedSentences: 0 });
    });
  });

  test("without a budget the deadline check fail-safes: it does not throw", () => {
    throwIfReviewDeadlineExceeded({ expectedSentences: 8 });
  });

  test("the recalibrated guard refuses a combination it should refuse", () => {
    const gate = preflightReview({
      draftText: hugeDraft(80_000),
      sources: [{ text: hugeSource(80_000), label: "source" }],
      ...SYS,
    });
    assert.equal(gate.refuse, true);
    assert.equal(gate.message, PREFLIGHT_REFUSAL_TEXT);
    assert.equal(gate.message, REVIEW_COPY.TOO_LARGE);
  });

  test("the guard ACCEPTS the B277 measured cell rather than refusing work that succeeded", () => {
    const gate = preflightReview({
      draftText: hugeDraft(3698),
      sources: [{ text: hugeSource(3558), label: "source" }],
      ...SYS,
    });
    assert.equal(gate.refuse, false);
    assert.equal(gate.message, null);
  });

  test("the guard ACCEPTS the real-median source against the measured draft (fail-safe)", () => {
    const gate = preflightReview({
      draftText: hugeDraft(3698),
      sources: [{ text: hugeSource(5105), label: "source" }],
      ...SYS,
    });
    assert.equal(gate.refuse, false);
  });

  test("screen and export agree about what happened", () => {
    const cutOff = buildIncompleteReviewResponse({
      cause: INCOMPLETE_CAUSES.DEADLINE,
      expectedSentences: 12,
      reachedSentences: 3,
    });
    const surfaces = surfacesFromReviewPayload(cutOff);
    assert.deepEqual(surfaces.screen, surfaces.export);
    assert.equal(surfaces.screen.cards, 0);
    assert.equal(surfaces.export.cards, 0);
    assert.equal(surfaces.screen.account, REVIEW_COPY.DEADLINE);
    assert.equal(surfaces.screen.error, cutOff.error);

    const complete = {
      ok: true,
      error: null,
      statements: twoStatementPipeline({ editorialMiss: true }).qcCards.map((card, i) => ({
        id: String(i),
        text: card.statement,
        qcCard: card,
      })),
    };
    const completeSurfaces = surfacesFromReviewPayload(complete);
    assert.deepEqual(completeSurfaces.screen, completeSurfaces.export);
    assert.equal(completeSurfaces.screen.cards, 2);
  });

  test("user-facing copy is flagged as awaiting Ben and lives in one object", () => {
    assert.equal(REVIEW_COPY_AWAITING_BEN, true);
    assert.equal(typeof REVIEW_COPY.TOO_LARGE, "string");
    assert.equal(typeof REVIEW_COPY.DEADLINE, "string");
  });
});
