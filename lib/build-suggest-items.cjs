// lib/build-suggest-items.cjs
// A4.8: Suggest Scaffold Phase 1 — deterministic suggest items from existing meta + fixGuidance.
// Synchronous, never throws; returns [] on internal error. Read-only on stmt. No external deps.

/** @typedef {"rewrite"|"qualify"|"add_context"|"add_citation"|"balance"|"tone_down"} SuggestType */
/** @typedef {"low"|"medium"|"high"} Severity */
/**
 * @typedef {Object} SuggestItem
 * @property {string} id
 * @property {SuggestType} type
 * @property {Severity} severity
 * @property {string} title
 * @property {string} suggestion
 * @property {string} source
 * @property {{ stmtId: string|null, stmtIndex: number }} appliesTo
 */

const COMPLIANCE_SUGGESTIONS = Object.freeze({
  promissory_language: {
    type: "tone_down",
    title: "Remove promissory tone",
    suggestion: "Replace promissory wording (e.g., 'will', 'certainly') with qualified language (e.g., 'may', 'could', 'is positioned to').",
  },
  forward_looking_unqualified: {
    type: "qualify",
    title: "Qualify forward-looking claim",
    suggestion: "Add qualifying language and conditions (e.g., 'subject to execution', 'depending on market conditions').",
  },
  performance_claim_no_context: {
    type: "add_context",
    title: "Add performance context",
    suggestion: "Add comparative context or a supporting metric/source before making superiority claims.",
  },
  potential_cherry_pick_posture: {
    type: "balance",
    title: "Avoid one-sided framing",
    suggestion: "Add a limitation, risk, or missing context statement to avoid overly one-sided framing.",
  },
});

const EDITORIAL_STRUCTURAL_QUALIFY_SIGNALS = new Set([
  "unsupported_forward_claim",
  "assertion_strength_mismatch",
  "conclusion_without_support",
]);
const EDITORIAL_STRUCTURAL_GENERIC = "Add a supporting detail or qualifier that links this statement to the available evidence.";
const EDITORIAL_DENSITY_GENERIC = "Remove repeated phrasing and keep one strongest version of the point.";
const EDITORIAL_FRAMING_GENERIC = "Replace absolute positioning with qualified language aligned to the evidence.";
const EDITORIAL_BALANCE_GENERIC = "Add one sentence acknowledging key risks/limits so the paragraph is balanced.";
const NARRATIVE_ADD_CONTEXT_CODES = new Set([
  "causal_claim_without_mechanism",
  "evidence_without_implication",
  "logical_leap_without_warrant",
]);
const NARRATIVE_GENERIC = "Add a short reasoning step explaining how the evidence leads to the conclusion.";

function normSeverity(s) {
  if (s === "low" || s === "medium" || s === "high") return s;
  const t = typeof s === "string" ? s.toLowerCase() : "";
  if (t === "low" || t === "medium" || t === "high") return t;
  return "medium";
}

function stableId(origin, signalTypeOrCode, stmtIdOrIndex, severity) {
  const code = String(signalTypeOrCode ?? "").replace(/[^a-z0-9_]/gi, "_") || "unknown";
  return `${origin}:${code}:${stmtIdOrIndex}:${severity}`;
}

function applyTo(stmt, stmtIndex) {
  const stmtId = stmt && typeof stmt.id === "string" ? stmt.id : (typeof stmt.id === "number" ? String(stmt.id) : null);
  const oneBased = typeof stmtIndex === "number" ? stmtIndex + 1 : 1;
  return { stmtId, stmtIndex: oneBased };
}

/**
 * Build deterministic suggest items from statement meta (issue + fixGuidance only).
 * @param {Object} stmt - Full statement object (read-only)
 * @param {number} [stmtIndex=0] - 0-based statement index
 * @returns {SuggestItem[]}
 */
function buildSuggestItems(stmt, stmtIndex) {
  const idx = typeof stmtIndex === "number" ? stmtIndex : 0;
  const seenIds = new Set();
  const out = [];

  try {
    if (stmt == null || typeof stmt !== "object") return out;
    const meta = stmt.meta || {};
    const assessment = stmt.assessment || {};
    const citationCount = Array.isArray(assessment.citations) ? assessment.citations.length : 0;
    const evidenceBand = meta.evidenceStrength && typeof meta.evidenceStrength.band === "string" ? meta.evidenceStrength.band : "";
    const stmtIdOrIndex = (typeof stmt.id === "string" && stmt.id) || (typeof stmt.id === "number" ? String(stmt.id) : null) || `idx${idx + 1}`;
    const appliesToVal = applyTo(stmt, idx);

    function pushOne(origin, signalTypeOrCode, severity, type, title, suggestion) {
      const sev = normSeverity(severity);
      const id = stableId(origin, signalTypeOrCode, stmtIdOrIndex, sev);
      if (seenIds.has(id)) return;
      seenIds.add(id);
      out.push({
        id,
        type,
        severity: sev,
        title: title || "Improve statement",
        suggestion: suggestion || "",
        source: origin,
        appliesTo: appliesToVal,
      });
    }

    // A) Editorial Structural
    const editorialStructural = Array.isArray(meta.editorialStructuralSignals) ? meta.editorialStructuralSignals : [];
    for (const sig of editorialStructural) {
      if (!sig || typeof sig !== "object") continue;
      const code = sig.signal != null ? String(sig.signal) : "";
      const severity = normSeverity(sig.severity);
      const suggestion = typeof sig.fixGuidance === "string" && sig.fixGuidance.trim() !== "" ? sig.fixGuidance.trim() : EDITORIAL_STRUCTURAL_GENERIC;
      const isQualify = EDITORIAL_STRUCTURAL_QUALIFY_SIGNALS.has(code);
      pushOne(
        "editorial_structural",
        code || "structural",
        severity,
        isQualify ? "qualify" : "add_context",
        isQualify ? "Strengthen support" : "Add missing context",
        suggestion
      );
    }

    // B) Editorial Density
    const editorialDensity = Array.isArray(meta.editorialDensitySignals) ? meta.editorialDensitySignals : [];
    for (const sig of editorialDensity) {
      if (!sig || typeof sig !== "object") continue;
      const code = sig.code != null ? String(sig.code) : "density";
      const suggestion = typeof sig.fixGuidance === "string" && sig.fixGuidance.trim() !== "" ? sig.fixGuidance.trim() : EDITORIAL_DENSITY_GENERIC;
      pushOne("editorial_density", code, normSeverity(sig.severity) || "low", "rewrite", "Reduce redundancy", suggestion);
    }

    // C) Editorial Framing
    const editorialFraming = Array.isArray(meta.editorialFramingSignals) ? meta.editorialFramingSignals : [];
    for (const sig of editorialFraming) {
      if (!sig || typeof sig !== "object") continue;
      const code = sig.code != null ? String(sig.code) : "framing";
      const suggestion = typeof sig.fixGuidance === "string" && sig.fixGuidance.trim() !== "" ? sig.fixGuidance.trim() : EDITORIAL_FRAMING_GENERIC;
      pushOne("editorial_framing", code, normSeverity(sig.severity) || "medium", "tone_down", "Soften positioning", suggestion);
    }

    // D) Editorial Balance
    const editorialBalance = Array.isArray(meta.editorialBalanceSignals) ? meta.editorialBalanceSignals : [];
    for (const sig of editorialBalance) {
      if (!sig || typeof sig !== "object") continue;
      const code = sig.code != null ? String(sig.code) : "balance";
      const suggestion = typeof sig.fixGuidance === "string" && sig.fixGuidance.trim() !== "" ? sig.fixGuidance.trim() : EDITORIAL_BALANCE_GENERIC;
      pushOne("editorial_balance", code, normSeverity(sig.severity) || "medium", "balance", "Add counter-balance", suggestion);
    }

    // E) Narrative Integrity
    const narrativeIntegrity = Array.isArray(meta.narrativeIntegritySignals) ? meta.narrativeIntegritySignals : [];
    for (const sig of narrativeIntegrity) {
      if (!sig || typeof sig !== "object") continue;
      const code = sig.code != null ? String(sig.code) : "narrative";
      const suggestion = typeof sig.fixGuidance === "string" && sig.fixGuidance.trim() !== "" ? sig.fixGuidance.trim() : NARRATIVE_GENERIC;
      const type = NARRATIVE_ADD_CONTEXT_CODES.has(code) ? "add_context" : "rewrite";
      pushOne("narrative_integrity", code, normSeverity(sig.severity) || "medium", type, "Add reasoning bridge", suggestion);
    }

    // F) Compliance (A4.7)
    const complianceSignals = Array.isArray(meta.complianceSignals) ? meta.complianceSignals : [];
    for (const sig of complianceSignals) {
      if (!sig || typeof sig !== "object") continue;
      const compType = typeof sig.type === "string" ? sig.type : "";
      const template = COMPLIANCE_SUGGESTIONS[compType];
      const severity = normSeverity(sig.severity) || "medium";
      const title = template ? template.title : "Address compliance";
      const suggestion = template ? template.suggestion : (typeof sig.reason === "string" ? sig.reason : "");
      const type = template ? template.type : "qualify";
      pushOne("compliance", compType || "compliance", severity, type, title, suggestion);
    }

    return out;
  } catch (_) {
    return [];
  }
}

module.exports = { buildSuggestItems };
