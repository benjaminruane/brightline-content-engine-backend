/**
 * User-facing evidence verdict labels. Screen and export share this allowlist.
 * Compare the normalised slug throughout. Unknown is Unverifiable, never Confirmed.
 */

const KNOWN_EVIDENCE_DISPLAY_VERDICTS = {
  supported_full: "Confirmed",
  supported_partial: "Partially confirmed",
  conflict: "Conflicting",
  not_supported: "No support",
  no_clear_support: "No support",
};

export const UNKNOWN_EVIDENCE_VERDICT_LABEL = "Unverifiable";

function normalizedVerdictSlug(displayVerdict) {
  return String(displayVerdict ?? "").toLowerCase().trim();
}

/** Count class for the quality summary. Unknown or unread is notChecked, never dropped. */
export function evidenceCountClass(displayVerdict) {
  const slug = normalizedVerdictSlug(displayVerdict);
  if (!slug || slug === "not reviewed") return "notChecked";
  if (slug === "supported_full") return "confirmed";
  if (slug === "supported_partial") return "partial";
  if (slug === "conflict") return "conflicting";
  if (slug === "not_supported" || slug === "no_clear_support") return "notSupported";
  return "notChecked";
}

export function evidenceDisplayVerdictLabel(displayVerdict) {
  const slug = normalizedVerdictSlug(displayVerdict);
  if (!slug || slug === "not reviewed") return "Not reviewed";
  return KNOWN_EVIDENCE_DISPLAY_VERDICTS[slug] ?? UNKNOWN_EVIDENCE_VERDICT_LABEL;
}

export function normalizeExportVerdict(displayVerdict) {
  const slug = normalizedVerdictSlug(displayVerdict);
  if (!slug || slug === "not reviewed") return null;
  return KNOWN_EVIDENCE_DISPLAY_VERDICTS[slug] ?? UNKNOWN_EVIDENCE_VERDICT_LABEL;
}
