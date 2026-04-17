const VERDICT_CONFIRMED = "confirmed";
const VERDICT_PARTIAL = "partially_confirmed";
const VERDICT_CONFLICTING = "conflicting";
const VERDICT_NOT_SUPPORTED = "not_supported";

function normalizeClassification(value) {
  const classification = typeof value === "string" ? value.trim() : "";
  if (
    classification === VERDICT_CONFIRMED ||
    classification === VERDICT_PARTIAL ||
    classification === VERDICT_CONFLICTING ||
    classification === "no_support"
  ) {
    return classification;
  }
  return "no_support";
}

export function aggregateVerdict(sourceMatches) {
  const safeMatches = Array.isArray(sourceMatches) ? sourceMatches : [];

  const confirmingMatches = safeMatches.filter(
    (match) => normalizeClassification(match?.classification) === VERDICT_CONFIRMED
  );
  const conflictingMatches = safeMatches.filter(
    (match) => normalizeClassification(match?.classification) === VERDICT_CONFLICTING
  );
  const partialMatches = safeMatches.filter(
    (match) => normalizeClassification(match?.classification) === VERDICT_PARTIAL
  );

  let verdict = VERDICT_NOT_SUPPORTED;
  if (confirmingMatches.length > 0) {
    verdict = VERDICT_CONFIRMED;
  } else if (conflictingMatches.length > 0) {
    verdict = VERDICT_CONFLICTING;
  } else if (partialMatches.length > 0) {
    verdict = VERDICT_PARTIAL;
  }

  return {
    verdict,
    hasConflict: conflictingMatches.length > 0,
    confirmingMatches,
    conflictingMatches,
    partialMatches,
  };
}
