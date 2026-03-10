// lib/qc/display-explanation.mjs
// A6.2d: Deterministic display explanations for QC cards; human phrasing only, no internal codes.
// A6.2e: Explanation scope isolation — all signals from stmtMeta only; mismatch only when stmt.meta.supportMismatch exists.

const EXPLANATION_TYPES = ["no_support", "mismatch", "context_only", "counter_context", "excerpt_missing", "fallback"];

/**
 * Resolve a short, human-sounding explanation for the QC card using existing diagnostics.
 * All explanation signals must come from stmtMeta (current statement only); no global or shared state.
 * Priority: supportMismatch (only if stmtMeta.supportMismatch.kind exists) → counter → context → no_support → excerpt_missing → fallback.
 *
 * @param {Object} params
 * @param {Object} [params.qcCard] - qcCard (supportState, supportRefIds, primaryExcerpt, reasoningParagraph)
 * @param {Object} [params.stmtMeta] - stmt.meta for this statement only (supportMismatch, evidenceRelationshipSummary, supportRelevanceGate)
 * @param {Object} [params.evidenceBundle] - evidenceBundle (supportBindings, visibleSupportBindings)
 * @returns {{ shortExplanation: string|null, explanationType: string }}
 */
export function resolveQcDisplayExplanation({
  qcCard = {},
  stmtMeta = {},
  evidenceBundle = {},
} = {}) {
  const relSummary = stmtMeta?.evidenceRelationshipSummary;
  const relGate = stmtMeta?.supportRelevanceGate;

  const supportState = qcCard?.supportState ?? "";
  const hasVisibleSupport = Array.isArray(qcCard?.supportRefIds) && qcCard.supportRefIds.length > 0;
  const hasPrimaryExcerpt = !!(qcCard?.primaryExcerpt && String(qcCard.primaryExcerpt).trim());
  const candidateCount = relGate?.candidateCount ?? 0;
  const topRejected = relSummary?.topRejectedRelationship;

  // A6.2e: Mismatch only when current statement has stmt.meta.supportMismatch with .kind (strict scoping)
  if (stmtMeta && stmtMeta.supportMismatch && stmtMeta.supportMismatch.kind != null) {
    const explanation = stmtMeta.supportMismatch.explanation;
    if (typeof explanation === "string" && explanation.trim()) {
      const normalized = normalizeExplanation(explanation.trim());
      return { shortExplanation: normalized, explanationType: "mismatch" };
    }
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
