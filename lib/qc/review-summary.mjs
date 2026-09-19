/**
 * One review vocabulary. Pure functions, no I/O.
 * The backend computes this once; every summary surface reads it.
 */

export const READINESS_LABELS = [
  "Ready",
  "Not fully checked",
  "Minor points to address",
  "Needs work",
  "Needs significant work",
];

function asOptions(reviewOptions) {
  const src = reviewOptions && typeof reviewOptions === "object" ? reviewOptions : {};
  return {
    evidenceEnabled: src.evidenceEnabled !== false,
    editorialEnabled: src.editorialEnabled !== false,
    complianceEnabled: src.complianceEnabled !== false,
  };
}

function displayVerdictOf(card) {
  return String(card?.displayVerdict ?? "");
}

function classifyEvidence(card, evidenceEnabled) {
  if (!evidenceEnabled) return null;
  const dv = displayVerdictOf(card);
  if (dv === "supported_full") return "confirmed";
  if (dv === "supported_partial") return "partial";
  if (dv === "conflict") return "conflicting";
  if (dv === "not_supported" || dv === "no_clear_support") return "notSupported";
  return null;
}

/** Cards from an analyse-statements payload. Used to recompute the summary at the point of use. */
export function cardsFromAnalyseResult(qcResult) {
  const statements = Array.isArray(qcResult?.statements) ? qcResult.statements : [];
  return statements.map((row) => row?.qcCard).filter((card) => card && typeof card === "object");
}

/**
 * Summary for the review that reviewOptions describe, not the stamped copy.
 * Missing cards fall back to the stamp so a legacy snapshot stays legacy.
 */
export function reviewSummaryFromResult(qcResult, reviewOptions) {
  const cards = cardsFromAnalyseResult(qcResult);
  const stamped = qcResult?.meta?.reviewSummary;
  if (cards.length === 0) {
    return stamped && stamped.version === 1 ? stamped : null;
  }
  return summariseReview(cards, reviewOptions ?? qcResult?.meta?.reviewOptions);
}

const KNOWN_SIGNAL_VERDICTS = new Set([
  "clean",
  "concern",
  "soft_concern",
  "hard_concern",
  "not_reviewed",
]);

function classifySignal(verdict, enabled) {
  if (!enabled) return null;
  if (verdict == null) return "notChecked";
  const v = String(verdict).trim();
  if (!KNOWN_SIGNAL_VERDICTS.has(v)) return "notChecked";
  if (v === "hard_concern") return "hardConcern";
  if (v === "soft_concern" || v === "concern") return "concern";
  if (v === "not_reviewed") return "notChecked";
  return "clean";
}

/**
 * @param {object} card
 * @param {object} [reviewOptions]
 */
export function classifyCard(card, reviewOptions) {
  const opts = asOptions(reviewOptions);
  const counted = card?.suppressInQcWorkbench !== true;
  const evidence = classifyEvidence(card, opts.evidenceEnabled);
  const editorial = classifySignal(card?.editorialVerdict, opts.editorialEnabled);
  const compliance = classifySignal(card?.complianceVerdict, opts.complianceEnabled);
  const needsAttention =
    counted &&
    (evidence === "notSupported" ||
      evidence === "conflicting" ||
      editorial === "concern" ||
      editorial === "hardConcern" ||
      compliance === "concern" ||
      compliance === "hardConcern");
  return { counted, evidence, editorial, compliance, needsAttention };
}

function emptyEvidence() {
  return { confirmed: 0, partial: 0, conflicting: 0, notSupported: 0 };
}

function emptySignal() {
  return { concerns: 0, hardConcerns: 0, notChecked: 0 };
}

function readinessFromCounts({
  statements,
  conflicting,
  notSupported,
  partial,
  hardConcernCards,
  softConcern,
  notChecked,
}) {
  if (statements === 0) return null;
  const hard = notSupported + conflicting + hardConcernCards;
  if (conflicting > 0) return "Needs significant work";
  if (hard >= 3) return "Needs significant work";
  if (hard > 0) return "Needs work";
  if (partial > 0 || softConcern) return "Minor points to address";
  if (notChecked > 0) return "Not fully checked";
  return "Ready";
}

/**
 * @param {object[]} cards
 * @param {object} [reviewOptions]
 */
export function summariseReview(cards, reviewOptions) {
  const opts = asOptions(reviewOptions);
  const list = Array.isArray(cards) ? cards : [];
  const classified = list.map((card) => ({ card, cls: classifyCard(card, opts) }));
  const counted = classified.filter((row) => row.cls.counted);

  const evidence = opts.evidenceEnabled ? emptyEvidence() : null;
  const editorial = opts.editorialEnabled ? emptySignal() : null;
  const compliance = opts.complianceEnabled ? emptySignal() : null;

  let signalConcerns = 0;
  let notChecked = 0;
  let needsAttention = 0;
  let hardConcernCards = 0;
  let softConcern = false;

  for (const row of counted) {
    const cls = row.cls;
    if (evidence) {
      if (cls.evidence === "confirmed") evidence.confirmed += 1;
      else if (cls.evidence === "partial") evidence.partial += 1;
      else if (cls.evidence === "conflicting") evidence.conflicting += 1;
      else if (cls.evidence === "notSupported") evidence.notSupported += 1;
    }
    if (editorial) {
      if (cls.editorial === "hardConcern") {
        editorial.hardConcerns += 1;
        editorial.concerns += 1;
      } else if (cls.editorial === "concern") {
        editorial.concerns += 1;
      } else if (cls.editorial === "notChecked") {
        editorial.notChecked += 1;
      }
    }
    if (compliance) {
      if (cls.compliance === "hardConcern") {
        compliance.hardConcerns += 1;
        compliance.concerns += 1;
      } else if (cls.compliance === "concern") {
        compliance.concerns += 1;
      } else if (cls.compliance === "notChecked") {
        compliance.notChecked += 1;
      }
    }
    const hasSignal =
      cls.editorial === "concern" ||
      cls.editorial === "hardConcern" ||
      cls.compliance === "concern" ||
      cls.compliance === "hardConcern";
    if (hasSignal) signalConcerns += 1;
    if (cls.editorial === "notChecked" || cls.compliance === "notChecked") notChecked += 1;
    if (cls.needsAttention) needsAttention += 1;
    if (cls.editorial === "hardConcern" || cls.compliance === "hardConcern") hardConcernCards += 1;
    if (cls.editorial === "concern" || cls.compliance === "concern") softConcern = true;
  }

  const conflicting = evidence?.conflicting ?? 0;
  const notSupported = evidence?.notSupported ?? 0;
  const partial = evidence?.partial ?? 0;

  return {
    version: 1,
    statements: counted.length,
    evidence,
    editorial,
    compliance,
    signalConcerns,
    notChecked,
    needsAttention,
    readiness: readinessFromCounts({
      statements: counted.length,
      conflicting,
      notSupported,
      partial,
      hardConcernCards,
      softConcern,
      notChecked,
    }),
  };
}
