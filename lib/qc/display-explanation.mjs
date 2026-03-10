// lib/qc/display-explanation.mjs
// A6.2d: Deterministic display explanations for QC cards; human phrasing only, no internal codes.

const EXPLANATION_TYPES = ["no_support", "mismatch", "context_only", "counter_context", "excerpt_missing", "fallback"];

/**
 * Resolve a short, human-sounding explanation for the QC card using existing diagnostics.
 * Priority: supportMismatch → counter → context → no_support → excerpt_missing → fallback.
 *
 * @param {Object} params
 * @param {Object} [params.qcCard] - qcCard (supportState, supportRefIds, primaryExcerpt, reasoningParagraph)
 * @param {Object} [params.stmtMeta] - stmt.meta (supportMismatch, evidenceRelationshipSummary, supportRelevanceGate)
 * @param {Object} [params.evidenceBundle] - evidenceBundle (supportBindings, visibleSupportBindings)
 * @param {Object} [params.supportMismatch] - supportMismatch from meta (explanation, kind)
 * @param {Object} [params.evidenceRelationshipSummary] - evidenceRelationshipSummary (topRejectedRelationship)
 * @param {Object} [params.supportRelevanceGate] - supportRelevanceGate (candidateCount, acceptedCount)
 * @returns {{ shortExplanation: string|null, explanationType: string }}
 */
export function resolveQcDisplayExplanation({
  qcCard = {},
  stmtMeta = {},
  evidenceBundle = {},
  supportMismatch,
  evidenceRelationshipSummary,
  supportRelevanceGate,
} = {}) {
  const mismatch = supportMismatch ?? stmtMeta?.supportMismatch;
  const relSummary = evidenceRelationshipSummary ?? stmtMeta?.evidenceRelationshipSummary;
  const relGate = supportRelevanceGate ?? stmtMeta?.supportRelevanceGate;

  const supportState = qcCard?.supportState ?? "";
  const hasVisibleSupport = Array.isArray(qcCard?.supportRefIds) && qcCard.supportRefIds.length > 0;
  const hasPrimaryExcerpt = !!(qcCard?.primaryExcerpt && String(qcCard.primaryExcerpt).trim());
  const candidateCount = relGate?.candidateCount ?? 0;
  const topRejected = relSummary?.topRejectedRelationship;

  if (mismatch && typeof mismatch.explanation === "string" && mismatch.explanation.trim()) {
    const normalized = normalizeExplanation(mismatch.explanation.trim());
    return { shortExplanation: normalized, explanationType: "mismatch" };
  }

  if (topRejected === "counter") {
    return {
      shortExplanation: "The cited material points to risks or constraints rather than evidence for this claim.",
      explanationType: "counter_context",
    };
  }

  if (topRejected === "context") {
    return {
      shortExplanation: "Sources discuss related topics but do not support this claim directly.",
      explanationType: "context_only",
    };
  }

  if (!hasVisibleSupport && candidateCount === 0) {
    return {
      shortExplanation: "No supporting evidence found in the provided sources.",
      explanationType: "no_support",
    };
  }

  if (hasVisibleSupport && !hasPrimaryExcerpt) {
    return {
      shortExplanation: "A supporting source was identified, but no usable excerpt could be shown.",
      explanationType: "excerpt_missing",
    };
  }

  if (!hasVisibleSupport) {
    return {
      shortExplanation: "No supporting evidence found in the provided sources.",
      explanationType: "no_support",
    };
  }

  return { shortExplanation: null, explanationType: "fallback" };
}

function normalizeExplanation(text) {
  if (!text || typeof text !== "string") return text;
  let t = text.trim();
  if (t.length > 280) t = t.slice(0, 277).trim() + "…";
  return t;
}

export { EXPLANATION_TYPES };
