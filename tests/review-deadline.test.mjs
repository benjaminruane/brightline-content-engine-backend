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
  REVIEW_NEXT_STEP,
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

  test("the assembled message is cause, how-far, and next step for each cause", () => {
    const howFarOne = "Of the 1 sentence in your draft, 0 had been checked when it stopped.";

    const tooLarge = buildIncompleteReviewResponse({
      cause: INCOMPLETE_CAUSES.TOO_LARGE,
      expectedSentences: 2,
      reachedSentences: 1,
    });
    assert.equal(
      tooLarge.error,
      "This draft and its sources exceed the size limit for a single review. Of the 2 sentences in your draft, 1 had been checked when it stopped. Try reviewing the draft in sections, or with fewer sources at a time."
    );
    assert.equal(tooLarge.meta.incomplete.cause, "too_large");
    assert.equal(/try again/i.test(REVIEW_NEXT_STEP.TOO_LARGE), false);
    assert.equal(/try again/i.test(tooLarge.meta.incomplete.nextStep), false);

    const deadline = buildIncompleteReviewResponse({
      cause: INCOMPLETE_CAUSES.DEADLINE,
      expectedSentences: 2,
      reachedSentences: 1,
    });
    assert.equal(
      deadline.error,
      "The review could not be completed within the time limit for a single review. Of the 2 sentences in your draft, 1 had been checked when it stopped. Please try again. If it keeps happening, try a shorter draft."
    );
    assert.equal(deadline.meta.incomplete.cause, "deadline");

    const capacity = buildIncompleteReviewResponse({
      cause: INCOMPLETE_CAUSES.CAPACITY,
      expectedSentences: 2,
      reachedSentences: 1,
    });
    assert.equal(
      capacity.error,
      "The review could not finish because the service was busy. Of the 2 sentences in your draft, 1 had been checked when it stopped. Please try again in a few minutes."
    );
    assert.equal(capacity.meta.incomplete.cause, "capacity");

    const billing = buildIncompleteReviewResponse({
      cause: INCOMPLETE_CAUSES.BILLING,
      expectedSentences: 2,
      reachedSentences: 1,
    });
    assert.equal(
      billing.error,
      "The review could not run because of a problem with the account. Of the 2 sentences in your draft, 1 had been checked when it stopped. Please contact the administrator of this service."
    );
    assert.equal(billing.meta.incomplete.cause, "billing");
    assert.equal(/billing/i.test(billing.error), false);
    assert.equal(/could not be billed/i.test(billing.error), false);
    assert.equal(/not a fault/i.test(billing.error), false);

    const unknown = buildIncompleteReviewResponse({
      cause: INCOMPLETE_CAUSES.ERROR,
      expectedSentences: 2,
      reachedSentences: 1,
    });
    assert.equal(
      unknown.error,
      "The review failed to complete due to a technical error. Of the 2 sentences in your draft, 1 had been checked when it stopped. Please try again."
    );
    assert.equal(unknown.meta.incomplete.cause, "error");
    assert.equal(unknown.meta.incomplete.account, "error");
    assert.notEqual(unknown.meta.incomplete.cause, REVIEW_COPY.ERROR);
    assert.notEqual(unknown.meta.incomplete.account, REVIEW_COPY.ERROR);
    assert.equal(String(unknown.meta.incomplete.cause).includes("technical"), false);
    assert.equal(String(unknown.meta.incomplete.account).includes("technical"), false);

    const unclassed = buildIncompleteReviewResponse({
      cause: "unknown",
      expectedSentences: 2,
      reachedSentences: 1,
    });
    assert.equal(unclassed.meta.incomplete.cause, "unknown");
    assert.equal(unclassed.meta.incomplete.account, "unknown");
    assert.equal(unclassed.error.startsWith(REVIEW_COPY.ERROR), true);
    assert.notEqual(unclassed.meta.incomplete.cause, REVIEW_COPY.ERROR);

    const singular = buildIncompleteReviewResponse({
      cause: INCOMPLETE_CAUSES.DEADLINE,
      expectedSentences: 1,
      reachedSentences: 0,
    });
    assert.equal(singular.meta.incomplete.howFar, howFarOne);
    assert.match(singular.error, /1 sentence /);
    assert.equal(/sentences/.test(singular.meta.incomplete.howFar), false);

    assert.equal(tooLarge.error.includes("Nothing is shown"), false);
    assert.equal(deadline.error.includes("partial review"), false);
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

  test("user-facing copy lives in REVIEW_COPY and REVIEW_NEXT_STEP", () => {
    assert.equal(typeof REVIEW_COPY.TOO_LARGE, "string");
    assert.equal(typeof REVIEW_COPY.DEADLINE, "string");
    assert.equal(typeof REVIEW_NEXT_STEP.TOO_LARGE, "string");
    assert.equal(/try again/i.test(REVIEW_NEXT_STEP.TOO_LARGE), false);
  });
});
