/**
 * B302. Why the reviewer assessment is empty. Same pattern as
 * lib/qc/not-reviewed-reason.mjs. The frontend prints this. It does not
 * infer the state from an empty string.
 */

export const ASSESSMENT_REASONS = Object.freeze({
  WRITTEN: "written",
  NOTHING_TO_SAY: "nothing_to_say",
  NOT_REQUESTED: "not_requested",
  CALL_FAILED: "call_failed",
  INVALID_READINESS: "invalid_readiness",
  MISSING_PROVIDER_KEY: "missing_provider_key",
  EMPTY_COMPLETION: "empty_completion",
  BLANK_FINDING: "blank_finding",
});

/** User-facing groups from Part 3. */
export function assessmentStateOf(reason) {
  if (reason === ASSESSMENT_REASONS.WRITTEN) return "written";
  if (reason === ASSESSMENT_REASONS.NOTHING_TO_SAY) return "nothing_to_say";
  if (reason === ASSESSMENT_REASONS.NOT_REQUESTED) return "not_requested";
  return "could_not_be_written";
}

export function requireAssessmentReason(reason) {
  if (typeof reason === "string" && reason.trim()) return reason.trim();
  console.warn("[ASSESSMENT] missing reason; using call_failed");
  return ASSESSMENT_REASONS.CALL_FAILED;
}
