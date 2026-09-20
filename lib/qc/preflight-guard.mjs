/**
 * B277. Refuse a review that cannot finish inside one Function, before any
 * model call. The threshold is the TPM floor of the estimated work against
 * the 300 second cap. Far out on purpose.
 */

import { FUNCTION_MAX_DURATION_MS } from "./request-budget.mjs";
import { estimateReviewWork } from "./stage-schedule.mjs";
import { tpmDefaultForModel } from "./token-estimate.mjs";

export const PREFLIGHT_REFUSAL_TEXT =
  "This document is longer than the product can check in one pass.";

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
  const refuse = estimate.tpmFloorMs > capMs;
  return {
    refuse,
    estimate,
    capMs,
    message: refuse ? PREFLIGHT_REFUSAL_TEXT : null,
  };
}

export function logPreflightRefusal(result) {
  const e = result?.estimate || {};
  console.warn(
    `[PREFLIGHT] refuse words=${e.wordCount} statements=${e.statementCount} ` +
      `sources=${e.sourceCount} totalTokens=${e.totalTokens} tpmFloorMs=${e.tpmFloorMs} capMs=${result?.capMs}`
  );
}
