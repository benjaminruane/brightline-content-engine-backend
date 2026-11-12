/**
 * B300. A requested check that did not complete always records why.
 * The slug stays on the card. The reader sees the sentence, never the slug.
 */

import { isRateLimitBoundError } from "./request-budget.mjs";

export const NOT_REVIEWED_REASONS = Object.freeze({
  RATE_LIMIT_WINDOW: "rate_limit_window",
  SCHEMA_INVALID: "schema_invalid",
  EMPTY_COMPLETION: "empty_completion",
  THROWN_CALL: "thrown_call",
  ZERO_TOKEN_FAILURE: "zero_token_failure",
  EMPTY_RESULT: "empty_result",
  MISSING_PROVIDER_KEY: "missing_provider_key",
  EXCERPT_NOT_LOCATABLE: "excerpt_not_locatable",
  EMPTY_CONFIRMATION_REFUSED: "empty_confirmation_refused",
  COULD_NOT_DETERMINE: "could_not_determine",
  UNSPECIFIED: "unspecified",
});

/**
 * B329. Causes for a review that did not produce a card for every statement.
 * Recorded on the payload. Not shown as check-level not_reviewed stamps.
 */
export const INCOMPLETE_CAUSES = Object.freeze({
  DEADLINE: "deadline",
  TOO_LARGE: "too_large",
  CAPACITY: "capacity",
  BILLING: "billing",
  ERROR: "error",
});

const ZERO_TOKEN_LATENCY_MS = 1000;

function headerValue(headers, name) {
  if (!headers) return "";
  const wanted = String(name).toLowerCase();
  if (typeof headers.get === "function") {
    const fromGet = headers.get(name) ?? headers.get(wanted);
    if (fromGet != null && String(fromGet).trim()) return String(fromGet).trim();
  }
  if (typeof headers !== "object") return "";
  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() === wanted && value != null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return "";
}

export function providerRequestIdFrom(source) {
  if (!source || typeof source !== "object") return null;
  const fromHeader =
    headerValue(source.headers, "x-request-id") || headerValue(source.headers, "request-id");
  if (fromHeader) return fromHeader;
  if (typeof source.requestId === "string" && source.requestId.trim()) return source.requestId.trim();
  if (typeof source.requestID === "string" && source.requestID.trim()) return source.requestID.trim();
  if (typeof source.id === "string" && source.id.trim()) return source.id.trim();
  const raw = source.raw;
  if (raw && typeof raw === "object" && typeof raw.id === "string" && raw.id.trim()) {
    return raw.id.trim();
  }
  return null;
}

export function isZeroTokenFailure(err) {
  if (!err || typeof err !== "object") return false;
  const latency = Number(err.latencyMs);
  if (!Number.isFinite(latency) || latency >= ZERO_TOKEN_LATENCY_MS) return false;
  const usage = err.usage && typeof err.usage === "object" ? err.usage : null;
  if (!usage) return true;
  const input = Number(usage.inputTokens) || 0;
  const output = Number(usage.outputTokens) || 0;
  return input === 0 && output === 0;
}

export function notReviewedReasonFromFailure(err) {
  if (isRateLimitBoundError(err)) return NOT_REVIEWED_REASONS.RATE_LIMIT_WINDOW;
  if (isZeroTokenFailure(err)) return NOT_REVIEWED_REASONS.ZERO_TOKEN_FAILURE;
  return NOT_REVIEWED_REASONS.THROWN_CALL;
}

export const NOT_CHECKED_SENTENCES = Object.freeze({
  empty_confirmation_refused: "This check did not run, because the match came back empty.",
  rate_limit_window: "This check did not run, because the service was at capacity.",
  schema_invalid: "This check did not run, because the result could not be read.",
  empty_completion: "This check did not run, because the result came back empty.",
  thrown_call: "This check did not run, because the call failed.",
  zero_token_failure: "This check did not run, because the call returned nothing.",
  empty_result: "This check did not run, because the result came back empty.",
  missing_provider_key: "This check did not run, because the service was not available.",
  excerpt_not_locatable: "This check did not run, because the passage could not be located.",
  could_not_determine: "This check did not run, because the result could not be determined.",
  unspecified: "This check did not run, because no reason was recorded.",
  "": "This check did not run, because the result came back empty.",
});

export function notCheckedReasonSentence(slug) {
  const key = typeof slug === "string" ? slug.trim() : "";
  if (!key) return "";
  return NOT_CHECKED_SENTENCES[key] || "This check did not run, because a reason was recorded in a form that is not shown.";
}

export function requireNotReviewedReason(reason) {
  if (typeof reason === "string" && reason.trim()) return reason.trim();
  console.warn("[CHECK_NOT_REVIEWED] missing reason; using unspecified");
  return NOT_REVIEWED_REASONS.UNSPECIFIED;
}

/** One line per statement per check. */
export function logCheckNotReviewed({ kind, statementIndex, reason, requestId } = {}) {
  console.warn("[CHECK_NOT_REVIEWED]", {
    kind: kind ?? null,
    statementIndex: Number.isFinite(statementIndex) ? statementIndex : null,
    reason: reason ?? null,
    requestId: requestId ?? null,
  });
}
