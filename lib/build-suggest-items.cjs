// lib/build-suggest-items.cjs
// A4.8: Suggest Scaffold Phase 1 — deterministic suggest items from existing meta + fixGuidance.
// A4.9: Suggest Intelligence Bundle — priorityScore, priorityBand, groupKey, groupTitle, actionKey; merge by actionKey.
// A4.53: Evidence-based suggest items (add_citation, resolve_conflict) for Recommended Improvements visibility.
// Synchronous, never throws; returns [] on internal error. Read-only on stmt. No external deps.

/** @typedef {"rewrite"|"qualify"|"add_context"|"add_citation"|"balance"|"tone_down"|"resolve_conflict"} SuggestType */
/** @typedef {"low"|"medium"|"high"} Severity */
/** @typedef {"P1"|"P2"|"P3"} PriorityBand */
/** @typedef {"evidence"|"compliance"|"narrative"|"editorial"} GroupKey */
/**
 * @typedef {Object} SuggestItem
 * @property {string} id
 * @property {SuggestType} type
 * @property {Severity} severity
 * @property {string} title
 * @property {string} suggestion
 * @property {string} source
 * @property {{ stmtId: string|null, stmtIndex: number }} appliesTo
 * @property {number} priorityScore
 * @property {PriorityBand} priorityBand
 * @property {GroupKey} groupKey
 * @property {string} groupTitle
 * @property {string} actionKey
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

// A4.9: Priority scoring (deterministic)
const SEVERITY_BASE_WEIGHT = Object.freeze({ high: 80, medium: 50, low: 20 });
const SEVERITY_RANK = Object.freeze({ high: 3, medium: 2, low: 1 }); // for merge: higher wins

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

/** A4.9: Derive groupKey and groupTitle from item.source */
function sourceToGroup(source) {
  if (typeof source === "string" && source.startsWith("editorial")) return { groupKey: "editorial", groupTitle: "Editorial" };
  if (source === "narrative_integrity") return { groupKey: "narrative", groupTitle: "Narrative" };
  if (source === "compliance") return { groupKey: "compliance", groupTitle: "Compliance" };
  return { groupKey: "evidence", groupTitle: "Evidence" };
}

/** A4.9: Compute priorityScore (0–100) and priorityBand (P1|P2|P3) from item severity + stmt context */
function computePriority(item, stmt) {
  const base = SEVERITY_BASE_WEIGHT[item.severity] ?? 50;
  let adj = 0;
  const meta = stmt && stmt.meta ? stmt.meta : {};
  const band = typeof meta.evidenceStrength?.band === "string" ? meta.evidenceStrength.band : "";
  if (band === "none" || band === "weak") adj += 10;
  else if (band === "moderate") adj += 5;
  const citationCount = Array.isArray(stmt?.assessment?.citations) ? stmt.assessment.citations.length : 0;
  if (citationCount === 0) adj += 10;
  const relianceLevel = typeof meta.sourceRelianceRisk?.level === "string" ? meta.sourceRelianceRisk.level : "";
  if (relianceLevel === "high") adj += 10;
  else if (relianceLevel === "moderate") adj += 5;
  const priorityScore = Math.min(100, base + adj);
  const priorityBand = priorityScore >= 70 ? "P1" : priorityScore >= 40 ? "P2" : "P3";
  return { priorityScore, priorityBand };
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

    // G) A4.53: Evidence-based suggest items — add_citation, resolve_conflict
    // Uses existing backend truth signals (emittedSupportCleared, supportTopology, contradictionSignals)
    // At most one add_citation and one resolve_conflict per statement (no duplicates)
    
    // G1) add_citation: statement has zero bound citations / no supporting evidence
    const isUncited = (
      meta.emittedSupportCleared?.cleared === true ||
      citationCount === 0 ||
      evidenceBand === "none" ||
      (meta.evidenceExplanation?.supportClassification === "none")
    );
    if (isUncited) {
      pushOne(
        "evidence",
        "add_citation",
        "high",
        "add_citation",
        "Add a supporting source",
        "No uploaded source is bound to this statement."
      );
    }
    
    // G2) resolve_conflict: statement has conflicting sources
    const hasConflict = (
      (meta.supportTopology?.conflictingSourceCount != null && meta.supportTopology.conflictingSourceCount > 0) ||
      (meta.contradictionSignals?.level === "hard") ||
      (meta.conflictNarrative?.hasConflict === true)
    );
    if (hasConflict) {
      pushOne(
        "evidence",
        "resolve_conflict",
        "high",
        "resolve_conflict",
        "Resolve conflicting sources",
        "Uploaded sources contain conflicting values for this statement."
      );
    }

    // A4.9: Enrich each item with groupKey, groupTitle, actionKey, priorityScore, priorityBand
    const enriched = out.map((item) => {
      const title = item.title || "Improve statement";
      const actionKey = `${item.type}:${title}`;
      const { groupKey, groupTitle } = sourceToGroup(item.source);
      const { priorityScore, priorityBand } = computePriority(item, stmt);
      return {
        ...item,
        actionKey,
        groupKey,
        groupTitle,
        priorityScore,
        priorityBand,
      };
    });

    // A4.9: Merge by actionKey — keep single best per key (higher severity wins; if tie, first in build order)
    const byActionKey = new Map();
    for (const item of enriched) {
      const key = item.actionKey;
      const existing = byActionKey.get(key);
      const itemRank = SEVERITY_RANK[item.severity] ?? 0;
      const existingRank = existing ? (SEVERITY_RANK[existing.severity] ?? 0) : -1;
      if (!existing || itemRank > existingRank) {
        byActionKey.set(key, item);
      }
    }

    // A4.9: Sort by priorityScore desc, then actionKey asc
    const merged = Array.from(byActionKey.values());
    merged.sort((a, b) => {
      const scoreDiff = b.priorityScore - a.priorityScore;
      if (scoreDiff !== 0) return scoreDiff;
      return String(a.actionKey).localeCompare(String(b.actionKey));
    });

    return merged;
  } catch (_) {
    return [];
  }
}

// A4.10: Zeroed statement-level summary (when items missing or empty)
const ZEROED_BY_GROUP = Object.freeze({ evidence: 0, compliance: 0, narrative: 0, editorial: 0 });
const ZEROED_BY_PRIORITY_BAND = Object.freeze({ P1: 0, P2: 0, P3: 0 });

/**
 * A4.10: Build statement-level suggest summary from items (additive meta only).
 * Items are assumed already sorted (priorityScore desc, then actionKey asc).
 * @param {SuggestItem[]} items - suggest.items (may be missing or empty)
 * @returns {{ total: number, byGroup: Object, byPriorityBand: Object, primaryActions: Array<{ actionKey: string, title: string, priorityBand: string }> }}
 */
function buildSuggestSummary(items) {
  const byGroup = { ...ZEROED_BY_GROUP };
  const byPriorityBand = { ...ZEROED_BY_PRIORITY_BAND };
  const primaryActions = [];
  if (!Array.isArray(items) || items.length === 0) {
    return { total: 0, byGroup, byPriorityBand, primaryActions };
  }
  let total = 0;
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    total++;
    const g = item.groupKey;
    if (g === "evidence" || g === "compliance" || g === "narrative" || g === "editorial") {
      byGroup[g] = (byGroup[g] || 0) + 1;
    }
    const b = item.priorityBand;
    if (b === "P1" || b === "P2" || b === "P3") {
      byPriorityBand[b] = (byPriorityBand[b] || 0) + 1;
    }
  }
  const top2 = items.slice(0, 2);
  for (const item of top2) {
    if (!item || typeof item !== "object") continue;
    primaryActions.push({
      actionKey: item.actionKey != null ? String(item.actionKey) : "",
      title: item.title != null ? String(item.title) : "",
      priorityBand: item.priorityBand === "P1" || item.priorityBand === "P2" || item.priorityBand === "P3" ? item.priorityBand : "P3",
    });
  }
  return { total, byGroup, byPriorityBand, primaryActions };
}

/**
 * A4.10: Aggregate statement-level suggest summaries into response.meta.suggestSummary.
 * @param {Object[]} statements - response statements (each may have meta.suggest.summary)
 * @returns {{ totalItems: number, byGroup: Object, byPriorityBand: Object }}
 */
function aggregateSuggestSummary(statements) {
  const byGroup = { ...ZEROED_BY_GROUP };
  const byPriorityBand = { ...ZEROED_BY_PRIORITY_BAND };
  let totalItems = 0;
  if (!Array.isArray(statements)) {
    return { totalItems, byGroup, byPriorityBand };
  }
  for (const stmt of statements) {
    const summary = stmt?.meta?.suggest?.summary;
    if (!summary || typeof summary !== "object") continue;
    totalItems += typeof summary.total === "number" ? summary.total : 0;
    const sg = summary.byGroup;
    if (sg && typeof sg === "object") {
      for (const k of ["evidence", "compliance", "narrative", "editorial"]) {
        byGroup[k] = (byGroup[k] || 0) + (typeof sg[k] === "number" ? sg[k] : 0);
      }
    }
    const sp = summary.byPriorityBand;
    if (sp && typeof sp === "object") {
      for (const b of ["P1", "P2", "P3"]) {
        byPriorityBand[b] = (byPriorityBand[b] || 0) + (typeof sp[b] === "number" ? sp[b] : 0);
      }
    }
  }
  return { totalItems, byGroup, byPriorityBand };
}

module.exports = { buildSuggestItems, buildSuggestSummary, aggregateSuggestSummary };
