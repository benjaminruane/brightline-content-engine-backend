/**
 * User-facing evidence verdict labels. Screen and export share this allowlist.
 * Compare the normalised slug throughout. Unknown is Unverifiable, never Confirmed.
 */

const KNOWN_EVIDENCE_DISPLAY_VERDICTS = {
  supported_full: "Nothing raised",
  supported_partial: "Partially confirmed",
  conflict: "Conflicting",
  not_supported: "No support",
  no_clear_support: "No support",
  unverifiable: "Unverifiable",
  not_in_source: "Not in the source",
  conflicts: "Conflicts with the source",
  beyond: "Goes beyond the source",
  nothing_raised: "Nothing raised",
};

export const UNKNOWN_EVIDENCE_VERDICT_LABEL = "Unverifiable";

function normalizedVerdictSlug(displayVerdict) {
  return String(displayVerdict ?? "").toLowerCase().trim();
}

const STATEMENT_STATE_SLUGS = new Set(["not_in_source", "conflicts", "beyond", "nothing_raised"]);

function badgeSuppressed(displayVerdict, card) {
  const slug = normalizedVerdictSlug(displayVerdict);
  if (!slug || slug === "not reviewed") return false;
  return card?.factualBadge === false;
}

/** Count class for the quality summary. Unknown or unread is notChecked, never dropped. */
export function evidenceCountClass(displayVerdict, card) {
  const slug = normalizedVerdictSlug(displayVerdict);
  if (!slug || slug === "not reviewed") return "notChecked";
  if (badgeSuppressed(displayVerdict, card)) return "unbadged";
  if (slug === "supported_full") return "confirmed";
  if (slug === "supported_partial") return "partial";
  if (slug === "conflict") return "conflicting";
  if (slug === "not_supported" || slug === "no_clear_support") return "notSupported";
  if (slug === "unverifiable") return "unverifiable";
  return "notChecked";
}

export function evidenceDisplayVerdictLabel(displayVerdict, card) {
  const slug = normalizedVerdictSlug(displayVerdict);
  if (STATEMENT_STATE_SLUGS.has(slug)) return KNOWN_EVIDENCE_DISPLAY_VERDICTS[slug];
  if (badgeSuppressed(displayVerdict, card)) return "";
  if (!slug || slug === "not reviewed") return "Not reviewed";
  return KNOWN_EVIDENCE_DISPLAY_VERDICTS[slug] ?? UNKNOWN_EVIDENCE_VERDICT_LABEL;
}

export function normalizeExportVerdict(displayVerdict, card) {
  const slug = normalizedVerdictSlug(displayVerdict);
  if (!slug || slug === "not reviewed") return null;
  if (badgeSuppressed(displayVerdict, card)) return null;
  return KNOWN_EVIDENCE_DISPLAY_VERDICTS[slug] ?? UNKNOWN_EVIDENCE_VERDICT_LABEL;
}
