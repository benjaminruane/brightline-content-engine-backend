/**
 * B561. A long source warns before Review, with an estimated cost.
 * No dollar estimate is stored for a Review before it runs.
 * The figure is source length plus statement count.
 */

export const LONG_SOURCE_WORDS = 15000;

export function estimateReviewCostUsd({ sourceWords, statementCount } = {}) {
  if (!Number.isFinite(sourceWords) || sourceWords < 0) {
    throw new Error("estimateReviewCostUsd: source word count is missing");
  }
  if (!Number.isFinite(statementCount) || statementCount < 1) {
    throw new Error("estimateReviewCostUsd: statement count is missing");
  }
  const usd = (sourceWords / 1000) * 0.08 + statementCount * 0.03;
  return Math.round(usd * 100) / 100;
}

/** Null when the sources are within the threshold. Otherwise the warning the user sees. */
export function reviewCostWarning({ sourceWords, statementCount } = {}) {
  if (!Number.isFinite(sourceWords) || sourceWords < 0) {
    throw new Error("reviewCostWarning: source word count is missing");
  }
  if (sourceWords <= LONG_SOURCE_WORDS) return null;
  const costUsd = estimateReviewCostUsd({ sourceWords, statementCount });
  const words = Math.round(sourceWords).toLocaleString("en-GB");
  return {
    sourceWords,
    statementCount,
    costUsd,
    message: `This review includes ${words} words of source. The estimated cost is USD ${costUsd.toFixed(2)}. Continue, or cancel.`,
  };
}
