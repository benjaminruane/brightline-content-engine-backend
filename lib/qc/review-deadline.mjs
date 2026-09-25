/**
 * B329. A review that cannot finish returns no cards and an honest account.
 * The review-level clock sits above per-call B278 waits.
 *
 * User-facing wording is Ben's ruling 2026-09-25. Change it here only.
 */

import { getRequestBudget, FUNCTION_MAX_DURATION_MS } from "./request-budget.mjs";
import { INCOMPLETE_CAUSES } from "./not-reviewed-reason.mjs";

/**
 * B277 Run 4 completed a 3698-word draft against a 3558-word source.
 * Wall 266680 ms, of which the last wait was 119762 ms, idle remainder 146918 ms.
 * Estimator tokens at that cell: 5459667 (B328).
 * Fail-safe pre-flight uses this pin: refuse only when idle wall AND TPM floor
 * both exceed the function cap. Busy-window death is B2/B3, not a refuse.
 */
export const PREFLIGHT_PIN_DRAFT_WORDS = 3698;
export const PREFLIGHT_PIN_SOURCE_WORDS = 3558;
export const PREFLIGHT_PIN_EST_TOKENS = 5_459_667;
export const PREFLIGHT_PIN_IDLE_MS = 146_918;

/** Leave this much wall to serialize a body before the platform kill. */
export const REVIEW_RESPONSE_MARGIN_MS = 2_000;

export const REVIEW_COPY = Object.freeze({
  TOO_LARGE: "This draft and its sources exceed the size limit for a single review.",
  DEADLINE: "The review could not be completed within the time limit for a single review.",
  CAPACITY: "The review could not finish because the service was busy.",
  BILLING: "The review could not run because of a problem with the account.",
  ERROR: "The review failed to complete due to a technical error.",
});

export const REVIEW_NEXT_STEP = Object.freeze({
  TOO_LARGE: "Try reviewing the draft in sections, or with fewer sources at a time.",
  DEADLINE: "Please try again. If it keeps happening, try a shorter draft.",
  CAPACITY: "Please try again in a few minutes.",
  BILLING: "Please contact the administrator of this service.",
  ERROR: "Please try again.",
});

const COPY_BY_CAUSE = {
  [INCOMPLETE_CAUSES.TOO_LARGE]: REVIEW_COPY.TOO_LARGE,
  [INCOMPLETE_CAUSES.DEADLINE]: REVIEW_COPY.DEADLINE,
  [INCOMPLETE_CAUSES.CAPACITY]: REVIEW_COPY.CAPACITY,
  [INCOMPLETE_CAUSES.BILLING]: REVIEW_COPY.BILLING,
  [INCOMPLETE_CAUSES.ERROR]: REVIEW_COPY.ERROR,
};

const NEXT_BY_CAUSE = {
  [INCOMPLETE_CAUSES.TOO_LARGE]: REVIEW_NEXT_STEP.TOO_LARGE,
  [INCOMPLETE_CAUSES.DEADLINE]: REVIEW_NEXT_STEP.DEADLINE,
  [INCOMPLETE_CAUSES.CAPACITY]: REVIEW_NEXT_STEP.CAPACITY,
  [INCOMPLETE_CAUSES.BILLING]: REVIEW_NEXT_STEP.BILLING,
  [INCOMPLETE_CAUSES.ERROR]: REVIEW_NEXT_STEP.ERROR,
};

export class ReviewDeadlineError extends Error {
  constructor(message, extra = {}) {
    super(message || "review_deadline");
    this.name = "ReviewDeadlineError";
    this.code = "review_deadline";
    this.expectedSentences = Number.isFinite(Number(extra.expectedSentences))
      ? Number(extra.expectedSentences)
      : 0;
    this.reachedSentences = Number.isFinite(Number(extra.reachedSentences))
      ? Number(extra.reachedSentences)
      : 0;
  }
}

export function isReviewDeadlineError(err) {
  if (!err || typeof err !== "object") return false;
  return err.code === "review_deadline" || err.name === "ReviewDeadlineError";
}

export function copyForCause(cause) {
  const key = typeof cause === "string" ? cause : "";
  return COPY_BY_CAUSE[key] || REVIEW_COPY.ERROR;
}

export function predictedIdleWallMs(totalTokens) {
  const tokens = Math.max(0, Number(totalTokens) || 0);
  if (!PREFLIGHT_PIN_EST_TOKENS) return 0;
  return Math.ceil((tokens / PREFLIGHT_PIN_EST_TOKENS) * PREFLIGHT_PIN_IDLE_MS);
}

/**
 * Fail-safe: never refuse the measured completed cell. Refuse only when idle
 * wall and TPM floor both exceed the cap. Uncertain estimates accept.
 */
export function shouldRefusePreflight({ wordCount, sourceWordMax, totalTokens, tpmFloorMs, capMs } = {}) {
  const cap = Number.isFinite(Number(capMs)) ? Number(capMs) : FUNCTION_MAX_DURATION_MS;
  const words = Math.max(0, Number(wordCount) || 0);
  const sourceWords = Math.max(0, Number(sourceWordMax) || 0);
  if (words <= PREFLIGHT_PIN_DRAFT_WORDS && sourceWords <= PREFLIGHT_PIN_SOURCE_WORDS) {
    return false;
  }
  const idle = predictedIdleWallMs(totalTokens);
  const tpm = Math.max(0, Number(tpmFloorMs) || 0);
  return idle > cap && tpm > cap;
}

export function reviewTimeRemainingMs(now = Date.now()) {
  const store = getRequestBudget();
  if (!store || !Number.isFinite(Number(store.startedAt)) || !Number.isFinite(Number(store.maxDurationMs))) {
    return null;
  }
  const at = Number.isFinite(Number(now)) ? Number(now) : Date.now();
  return Math.max(0, store.startedAt + store.maxDurationMs - at);
}

export function throwIfReviewDeadlineExceeded({ expectedSentences, reachedSentences, now } = {}) {
  const remaining = reviewTimeRemainingMs(now);
  if (remaining == null) return;
  if (remaining > REVIEW_RESPONSE_MARGIN_MS) return;
  throw new ReviewDeadlineError("review_deadline", {
    expectedSentences,
    reachedSentences,
  });
}

/**
 * B1. A card for every Stage 1 statement is complete, even when some checks
 * are not_reviewed. nothingReviewed (every check off) is complete.
 */
export function isReviewComplete(pipelineResult) {
  if (pipelineResult?.nothingReviewed === true) return true;
  const expected = Array.isArray(pipelineResult?.stage1?.statements)
    ? pipelineResult.stage1.statements.length
    : 0;
  const cards = Array.isArray(pipelineResult?.qcCards) ? pipelineResult.qcCards : [];
  return expected > 0 && cards.length === expected;
}

export function reviewOutcomeFromPipeline(pipelineResult) {
  if (isReviewComplete(pipelineResult)) {
    return {
      complete: true,
      expectedSentences: Array.isArray(pipelineResult?.stage1?.statements)
        ? pipelineResult.stage1.statements.length
        : 0,
      reachedSentences: Array.isArray(pipelineResult?.qcCards) ? pipelineResult.qcCards.length : 0,
    };
  }
  const expected = Array.isArray(pipelineResult?.stage1?.statements)
    ? pipelineResult.stage1.statements.length
    : 0;
  const reached = Array.isArray(pipelineResult?.qcCards) ? pipelineResult.qcCards.length : 0;
  return {
    complete: false,
    expectedSentences: expected,
    reachedSentences: reached,
  };
}

function howFarLine({ expectedSentences, reachedSentences }) {
  const expected = Math.max(0, Number(expectedSentences) || 0);
  const reached = Math.max(0, Number(reachedSentences) || 0);
  const noun = expected === 1 ? "sentence" : "sentences";
  return `Of the ${expected} ${noun} in your draft, ${reached} had been checked when it stopped.`;
}

function nextStepForCause(cause) {
  const key = typeof cause === "string" ? cause : "";
  return NEXT_BY_CAUSE[key] || REVIEW_NEXT_STEP.ERROR;
}

export function buildIncompleteReviewResponse({
  cause,
  expectedSentences = 0,
  reachedSentences = 0,
  pipelineVersion = "v4",
  extraMeta = {},
} = {}) {
  const slug = typeof cause === "string" && cause.trim() ? cause.trim() : INCOMPLETE_CAUSES.ERROR;
  const causeLine = copyForCause(slug);
  const howFar = howFarLine({ expectedSentences, reachedSentences });
  const nextStep = nextStepForCause(slug);
  const error = `${causeLine} ${howFar} ${nextStep}`.trim();
  return {
    ok: false,
    error,
    statements: [],
    references: [],
    meta: {
      pipelineVersion,
      incomplete: {
        complete: false,
        cause: slug,
        howFar,
        nextStep,
        account: slug,
        expectedSentences: Math.max(0, Number(expectedSentences) || 0),
        reachedSentences: Math.max(0, Number(reachedSentences) || 0),
      },
      ...extraMeta,
    },
  };
}

/**
 * Screen and export both read `error` and `statements`. They must stay equal.
 */
export function surfacesFromReviewPayload(payload) {
  const statements = Array.isArray(payload?.statements) ? payload.statements : [];
  const error = payload?.error ?? null;
  const screen = { cards: statements.length, error };
  const exported = { cards: statements.length, error };
  return { screen, export: exported };
}

const BILLING_CODES = new Set([
  "insufficient_quota",
  "credit_balance_exhausted",
  "billing_not_active",
  "account_deactivated",
  "invalid_api_key",
  "organization_usage_limit_exceeded",
  "access_terminated",
]);

export function causeClassFromHandlerError(err) {
  if (isReviewDeadlineError(err)) return INCOMPLETE_CAUSES.DEADLINE;
  const info = err?.causeRefusal && typeof err.causeRefusal === "object" ? err.causeRefusal : null;
  const code = String(info?.code ?? err?.code ?? "").toLowerCase();
  const type = String(info?.type ?? err?.type ?? "").toLowerCase();
  const status = Number(info?.status ?? err?.status ?? err?.statusCode);
  if (BILLING_CODES.has(code) || type === "insufficient_quota" || status === 401 || status === 403) {
    return INCOMPLETE_CAUSES.BILLING;
  }
  if (err?.code === "rate_limit_bound" || err?.name === "RateLimitBoundError") {
    return INCOMPLETE_CAUSES.CAPACITY;
  }
  if (err?.code === "review_did_not_start" || err?.name === "ReviewDidNotStartError") {
    return INCOMPLETE_CAUSES.CAPACITY;
  }
  return INCOMPLETE_CAUSES.ERROR;
}
