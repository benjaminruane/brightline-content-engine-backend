/**
 * B564. The warning and the estimate use the tokens that are sent.
 * characters of the text sent / 4, on each call, times the calls.
 * Warn from about 20,000 tokens of source.
 */

export const LONG_SOURCE_TOKENS = 20000;

/** The match and the reading note each send the source. */
export const SOURCE_BEARING_CALLS_PER_STATEMENT = 2;

export function sourceTokensFromChars(sourceChars) {
  if (!Number.isFinite(sourceChars) || sourceChars < 0) {
    throw new Error("estimateReviewCostUsd: source character count is missing");
  }
  return Math.ceil(sourceChars / 4);
}

export function tokensSentForReview({ sourceChars, statementCount } = {}) {
  if (!Number.isFinite(statementCount) || statementCount < 1) {
    throw new Error("estimateReviewCostUsd: statement count is missing");
  }
  const tokensPerCall = sourceTokensFromChars(sourceChars);
  const calls = statementCount * SOURCE_BEARING_CALLS_PER_STATEMENT;
  return {
    sourceTokens: tokensPerCall,
    tokensPerCall,
    calls,
    tokensSent: tokensPerCall * calls,
  };
}

export function estimateReviewCostUsd({ sourceChars, statementCount } = {}) {
  const { tokensSent } = tokensSentForReview({ sourceChars, statementCount });
  const usd = (tokensSent / 1_000_000) * 2.5 + statementCount * 0.03;
  return Math.round(usd * 100) / 100;
}

/** Null when the source is within the threshold. Otherwise the warning the user sees. */
export function reviewCostWarning({ sourceChars, statementCount } = {}) {
  if (!Number.isFinite(sourceChars) || sourceChars < 0) {
    throw new Error("reviewCostWarning: source character count is missing");
  }
  const { sourceTokens } = tokensSentForReview({ sourceChars, statementCount });
  if (sourceTokens <= LONG_SOURCE_TOKENS) return null;
  const costUsd = estimateReviewCostUsd({ sourceChars, statementCount });
  const tokens = Math.round(sourceTokens).toLocaleString("en-GB");
  return {
    sourceChars,
    sourceTokens,
    statementCount,
    costUsd,
    message: `This review sends about ${tokens} tokens of source on each check. The estimated cost is USD ${costUsd.toFixed(2)}. Continue, or cancel.`,
  };
}

export function sourceCharsOf(text) {
  return typeof text === "string" ? text.length : 0;
}
