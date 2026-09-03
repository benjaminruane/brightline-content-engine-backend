/**
 * 2026-09-01 structural silence. A source spoke to the claim if a conflict
 * signal is present on the card. No prose cue. Does not import the dormant silence predicate.
 * Widened supportSpans never feed Stage 3. Reading their classification here
 * was B149 and is removed. Drawer mislabel of those spans remains B89.
 */

const GAP_SUPPORT = new Set([
  "partial",
  "partially_confirmed",
  "not_supported",
  "no_support",
  "conflicting",
]);
const GAP_DISPLAY = new Set([
  "supported_partial",
  "not_supported",
  "no_clear_support",
  "no_support",
  "conflict",
]);

function norm(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function excerptPassage(value) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object" && typeof value.passage === "string" && value.passage.trim()) {
    return value.passage.trim();
  }
  return null;
}

function classificationsFrom(list, key = "classification") {
  if (!Array.isArray(list)) return [];
  return list.map((row) => norm(row?.[key])).filter(Boolean);
}

function claimRoles(card) {
  const claims = Array.isArray(card?.claims) ? card.claims : [];
  return claims.map((c) => norm(c?.role)).filter(Boolean);
}

export const STRUCTURAL_TESTS = [
  {
    id: "supportState_conflicting",
    fire: (card) => norm(card.supportState) === "conflicting" || norm(card.displayVerdict) === "conflict",
  },
  {
    id: "hasConflict",
    fire: (card) => card.hasConflict === true,
  },
  {
    id: "stage2_classification_conflicting",
    fire: (card) => classificationsFrom(card.stage2SourceFingerprints).includes("conflicting"),
  },
  {
    id: "unsupportedSpan_classification_conflicting",
    fire: (card) => classificationsFrom(card.unsupportedSpans).includes("conflicting"),
  },
  {
    id: "claim_role_conflict",
    fire: (card) => claimRoles(card).includes("conflict"),
  },
  {
    id: "conflictExcerpt_nonempty",
    fire: (card) => excerptPassage(card.conflictExcerpt) != null,
  },
  {
    id: "conflictValues_nonempty",
    fire: (card) => card.conflictValues != null && card.conflictValues !== "",
  },
  {
    id: "conflictEvidence_nonempty",
    fire: (card) => card.conflictEvidence != null && card.conflictEvidence !== "",
  },
];

export function isEvidenceGap(card) {
  return GAP_SUPPORT.has(norm(card?.supportState)) || GAP_DISPLAY.has(norm(card?.displayVerdict));
}

export function sourceSpokeTestsFired(card) {
  return STRUCTURAL_TESTS.filter((t) => t.fire(card)).map((t) => t.id);
}

/**
 * Silent when the statement has an evidence gap and no structural signal that
 * a source spoke to the claim in either direction.
 */
export function statementIsSilent(card) {
  if (!card || typeof card !== "object") return false;
  if (!isEvidenceGap(card)) return false;
  return sourceSpokeTestsFired(card).length === 0;
}
