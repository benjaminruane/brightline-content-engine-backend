/**
 * B277 / B329. Refuse a review that cannot finish inside one Function, before any
 * model call. Fail-safe: refuse only when idle wall and TPM floor both exceed
 * the cap, and never refuse the B277 measured completed cell.
 */

import { FUNCTION_MAX_DURATION_MS } from "./request-budget.mjs";
import { estimateReviewWork } from "./stage-schedule.mjs";
import { countWords, tpmDefaultForModel } from "./token-estimate.mjs";
import {
  REVIEW_COPY,
  shouldRefusePreflight,
  predictedIdleWallMs,
  PREFLIGHT_PIN_DRAFT_WORDS,
  PREFLIGHT_PIN_SOURCE_WORDS,
  PREFLIGHT_PIN_EST_TOKENS,
  PREFLIGHT_PIN_IDLE_MS,
} from "./review-deadline.mjs";

export const PREFLIGHT_REFUSAL_TEXT = REVIEW_COPY.TOO_LARGE;
export {
  PREFLIGHT_PIN_DRAFT_WORDS,
  PREFLIGHT_PIN_SOURCE_WORDS,
  PREFLIGHT_PIN_EST_TOKENS,
  PREFLIGHT_PIN_IDLE_MS,
};

function maxSourceWords(sources) {
  const list = Array.isArray(sources) ? sources : [];
  let max = 0;
  for (const src of list) {
    const text = typeof src?.text === "string" ? src.text : typeof src === "string" ? src : "";
    max = Math.max(max, countWords(text));
  }
  return max;
}

export function preflightReview({
  draftText,
  sources,
  editorialSystemTokens,
  complianceSystemTokens,
  stage2SystemTokens,
  stage5SystemTokens,
  tpmLimit,
  maxDurationMs = FUNCTION_MAX_DURATION_MS,
} = {}) {
  const estimate = estimateReviewWork({
    draftText,
    sources,
    editorialSystemTokens,
    complianceSystemTokens,
    stage2SystemTokens,
    stage5SystemTokens,
    tpmLimit: tpmLimit || tpmDefaultForModel("gpt-4o-2024-08-06"),
  });
  const capMs = Number.isFinite(Number(maxDurationMs)) ? Number(maxDurationMs) : FUNCTION_MAX_DURATION_MS;
  const sourceWordMax = maxSourceWords(sources);
  const idleWallMs = predictedIdleWallMs(estimate.totalTokens);
  const refuse = shouldRefusePreflight({
    wordCount: estimate.wordCount,
    sourceWordMax,
    totalTokens: estimate.totalTokens,
    tpmFloorMs: estimate.tpmFloorMs,
    capMs,
  });
  return {
    refuse,
    estimate: { ...estimate, idleWallMs, sourceWordMax },
    capMs,
    message: refuse ? PREFLIGHT_REFUSAL_TEXT : null,
  };
}

export function logPreflightRefusal(result) {
  const e = result?.estimate || {};
  console.warn(
    `[PREFLIGHT] refuse words=${e.wordCount} statements=${e.statementCount} ` +
      `sources=${e.sourceCount} sourceWordMax=${e.sourceWordMax} totalTokens=${e.totalTokens} ` +
      `tpmFloorMs=${e.tpmFloorMs} idleWallMs=${e.idleWallMs} capMs=${result?.capMs}`
  );
}
