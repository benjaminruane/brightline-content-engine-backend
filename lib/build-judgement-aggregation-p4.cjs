// lib/build-judgement-aggregation-p4.cjs
// P4.W1: Judgement Aggregation (Meta Only).
// Deterministic, sync, no model calls. Adds stmt.meta.judgement and doc.meta.judgement only.
// Does not change canonicalClaims, reliabilityScore, evidence binding, unsupported_statement_gate,
// or any Phase 3 signal calculations (fragilityDrivers, density, reuse, spread, etc.).

/** Severity priority order for primary drivers (highest first). */
const SEVERITY_ORDER = [
  "single_source_over_reliance",
  "claim_evidence_imbalance",
  "approximation_reliance",
  "numeric_inconsistent_vs_document",
  "narrow_support_base",
  "evidence_reuse_pressure",
];

const MAX_STATEMENT_DRIVERS = 3;
const MAX_DOCUMENT_DRIVERS = 4;

/**
 * Sort drivers by severity priority; take first N. Unknown drivers appear after ordered ones.
 * @param {string[]} drivers
 * @param {number} max
 * @returns {string[]}
 */
function primaryDriversBySeverity(drivers, max) {
  if (!Array.isArray(drivers) || drivers.length === 0) return [];
  const orderMap = new Map(SEVERITY_ORDER.map((t, i) => [t, i]));
  const ordered = [];
  const rest = [];
  for (let i = 0; i < drivers.length; i++) {
    const t = typeof drivers[i] === "string" ? drivers[i].trim() : "";
    if (!t) continue;
    const idx = orderMap.get(t);
    if (idx !== undefined) ordered.push({ t, idx });
    else rest.push(t);
  }
  ordered.sort((a, b) => a.idx - b.idx);
  const out = ordered.map((x) => x.t);
  for (let i = 0; i < rest.length && out.length < max; i++) {
    if (!out.includes(rest[i])) out.push(rest[i]);
  }
  return out.slice(0, max);
}

/**
 * Compute statement judgement: fragilityPosture + primaryDrivers (max 3).
 * @param {Object} stmt - Statement with stmt.meta.evidenceJudgement.fragilityDrivers
 * @returns {{ fragilityPosture: string, primaryDrivers: string[] } | null}
 */
function statementJudgement(stmt) {
  try {
    if (stmt == null || typeof stmt !== "object") return null;
    const ej = stmt.meta?.evidenceJudgement;
    if (ej == null || typeof ej !== "object") return null;

    const drivers = Array.isArray(ej.fragilityDrivers) ? ej.fragilityDrivers : [];
    let fragilityPosture;
    if (drivers.length === 0) fragilityPosture = "robust";
    else if (drivers.length <= 2) fragilityPosture = "supported_with_caveats";
    else fragilityPosture = "fragile";

    const primaryDrivers = primaryDriversBySeverity(drivers, MAX_STATEMENT_DRIVERS);
    return { fragilityPosture, primaryDrivers };
  } catch (_) {
    return null;
  }
}

/**
 * Compute document judgement: fragilityPosture, dominantRiskPattern, primaryDrivers (max 4).
 * @param {Object} doc - Document with doc.meta.evidenceJudgement (density, reuse, fragilityDrivers, numericConsistency, numericApproxSpread)
 * @returns {{ fragilityPosture: string, dominantRiskPattern: string, primaryDrivers: string[] } | null}
 */
function documentJudgement(doc) {
  try {
    if (doc == null || typeof doc !== "object") return null;
    const ej = doc.meta?.evidenceJudgement;
    if (ej == null || typeof ej !== "object") return null;

    const drivers = Array.isArray(ej.fragilityDrivers) ? ej.fragilityDrivers : [];
    const reuse = ej.reuse != null && typeof ej.reuse === "object" ? ej.reuse : {};
    const density = ej.density != null && typeof ej.density === "object" ? ej.density : {};
    const reusePressureBand = typeof reuse.reusePressureBand === "string" ? reuse.reusePressureBand : "";
    const densityBand = typeof density.densityBand === "string" ? density.densityBand : "";

    let fragilityPosture;
    if (drivers.length === 0) fragilityPosture = "robust";
    else if (reusePressureBand === "high" || densityBand === "evidence_concentrated") fragilityPosture = "fragile";
    else fragilityPosture = "supported_with_caveats";

    let dominantRiskPattern = "";
    if (reusePressureBand === "high") dominantRiskPattern = "evidence concentrated in few sources";
    else if (densityBand === "evidence_concentrated") dominantRiskPattern = "claims exceed supporting evidence";
    else {
      const numericConsistency = ej.numericConsistency != null && typeof ej.numericConsistency === "object" ? ej.numericConsistency : {};
      const numericApproxSpread = ej.numericApproxSpread != null && typeof ej.numericApproxSpread === "object" ? ej.numericApproxSpread : {};
      const approxDominant = numericConsistency.consistencyBand === "approx_dominant" || numericApproxSpread.hasApproxDominance === true;
      if (approxDominant) dominantRiskPattern = "heavy reliance on approximate numeric evidence";
    }

    const primaryDrivers = primaryDriversBySeverity(drivers, MAX_DOCUMENT_DRIVERS);
    return { fragilityPosture, dominantRiskPattern, primaryDrivers };
  } catch (_) {
    return null;
  }
}

/**
 * Attach stmt.meta.judgement and doc.meta.judgement. Never removes existing meta; never throws.
 * If signals are missing, skips aggregation for that statement or document.
 * @param {Object[]} statements - Full statements array
 * @param {Object} doc - Document/response object with .meta
 */
function buildJudgementAggregationP4(statements, doc) {
  try {
    if (Array.isArray(statements)) {
      for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i];
        if (stmt == null || typeof stmt !== "object") continue;
        const judgement = statementJudgement(stmt);
        if (judgement == null) continue;
        if (!stmt.meta) stmt.meta = {};
        stmt.meta.judgement = judgement;
      }
    }

    if (doc != null && typeof doc === "object") {
      const judgement = documentJudgement(doc);
      if (judgement != null) {
        if (!doc.meta) doc.meta = {};
        doc.meta.judgement = judgement;
      }
    }
  } catch (_) {
    // Never throw
  }
}

module.exports = { buildJudgementAggregationP4 };
