/**
 * Deterministic signoff verdict — mirrors useDraftState / useAssessState buildSynthesisPayload.
 * Single source for Reviewer Assessment alignment (R3.6 / R3.7).
 */

const EDITORIAL_SIGNAL_VERDICTS = new Set(["soft_concern", "hard_concern", "concern", "not_reviewed"]);
const COMPLIANCE_SIGNAL_VERDICTS = new Set(["soft_concern", "hard_concern", "concern"]);

const EVIDENCE_GAP_DISPLAY_VERDICTS = new Set([
  "not_supported",
  "no_clear_support",
  "conflict",
  "supported_partial",
]);

function normVerdict(v) {
  return String(v ?? "").toLowerCase();
}

/**
 * @param {Array<{ qcCard?: object } | object>} rows - statement rows or qcCards
 * @returns {"Ready for signoff" | "Needs targeted revision" | "Needs significant work"}
 */
export function computeSignoffVerdict(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const unsupported = list.filter((r) => {
    const card = r?.qcCard && typeof r.qcCard === "object" ? r.qcCard : r;
    return EVIDENCE_GAP_DISPLAY_VERDICTS.has(normVerdict(card?.displayVerdict));
  });
  const editorial = list.filter((r) => {
    const card = r?.qcCard && typeof r.qcCard === "object" ? r.qcCard : r;
    return EDITORIAL_SIGNAL_VERDICTS.has(normVerdict(card?.editorialVerdict));
  });
  const compliance = list.filter((r) => {
    const card = r?.qcCard && typeof r.qcCard === "object" ? r.qcCard : r;
    return COMPLIANCE_SIGNAL_VERDICTS.has(normVerdict(card?.complianceVerdict));
  });
  const hardConcerns =
    editorial.filter((r) => {
      const card = r?.qcCard && typeof r.qcCard === "object" ? r.qcCard : r;
      return normVerdict(card?.editorialVerdict) === "hard_concern";
    }).length +
    compliance.filter((r) => {
      const card = r?.qcCard && typeof r.qcCard === "object" ? r.qcCard : r;
      return normVerdict(card?.complianceVerdict) === "hard_concern";
    }).length;

  const hasEvidenceConflictVerdict = list.some((r) => {
    const card = r?.qcCard && typeof r.qcCard === "object" ? r.qcCard : r;
    return normVerdict(card?.displayVerdict) === "conflict";
  });

  if (hasEvidenceConflictVerdict) return "Needs significant work";
  if (unsupported.length === 0 && hardConcerns === 0 && editorial.length + compliance.length === 0) {
    return "Ready for signoff";
  }
  if (unsupported.length >= 3 || hardConcerns >= 3) return "Needs significant work";
  return "Needs targeted revision";
}

export function isReadyForSignoff(signoffVerdict) {
  return signoffVerdict === "Ready for signoff";
}
