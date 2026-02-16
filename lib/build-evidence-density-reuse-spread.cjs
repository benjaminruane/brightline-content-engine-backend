// lib/build-evidence-density-reuse-spread.cjs
// P3.W3: Evidence Density / Reuse / Spread (Bundle; Meta Only).
// Deterministic, sync, no model calls. Additive meta only.
// Does not change NC1/NC2, P3.W1, P3.W2, canonicalClaims, reliabilityScore, or evidence binding.

/**
 * Get the list of supporting source/reference ids for a statement.
 * Uses supportTopology.supportingSourceIds if present, else supportingReferences.supportingReferenceIds.
 * @param {Object} stmt - Statement object
 * @returns {string[]} Array of id strings
 */
function getSupportingIds(stmt) {
  if (stmt == null || typeof stmt !== "object") return [];
  const meta = stmt.meta;
  if (meta == null || typeof meta !== "object") return [];
  const fromTopology = meta.supportTopology != null && Array.isArray(meta.supportTopology.supportingSourceIds)
    ? meta.supportTopology.supportingSourceIds
    : null;
  if (fromTopology != null && fromTopology.length > 0) return fromTopology.map((id) => String(id));
  const fromRefs = meta.supportingReferences != null && Array.isArray(meta.supportingReferences.supportingReferenceIds)
    ? meta.supportingReferences.supportingReferenceIds
    : [];
  return fromRefs.map((id) => String(id));
}

/**
 * Build document-level evidence density, reuse pressure, and support spread from statement support data.
 * Only emits when there is at least one supported statement.
 * @param {Object[]} statements - Full statements array (read-only)
 * @param {Object} doc - Document/response object with .meta (will set doc.meta.evidenceJudgement.*)
 */
function buildEvidenceDensityReuseSpread(statements, doc) {
  try {
    if (!Array.isArray(statements) || statements.length === 0) return;
    if (doc == null || typeof doc !== "object") return;

    const supportedStatements = [];
    const idsPerStatement = [];
    const allIds = new Set();

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      const ids = getSupportingIds(stmt);
      if (ids.length >= 1) {
        supportedStatements.push(stmt);
        idsPerStatement.push(ids);
        for (let j = 0; j < ids.length; j++) allIds.add(ids[j]);
      }
    }

    const supportedStatementCount = supportedStatements.length;
    if (supportedStatementCount === 0) return;

    const claimCount = statements.length;
    const uniqueSupportingSourceCount = allIds.size;

    // P3.W3.1: Density
    const claimToEvidenceRatio = claimCount / Math.max(uniqueSupportingSourceCount, 1);
    let densityBand;
    if (claimToEvidenceRatio <= 1.5) densityBand = "balanced";
    else if (claimToEvidenceRatio <= 3) densityBand = "evidence_thin";
    else densityBand = "evidence_concentrated";

    const density = {
      claimCount,
      evidenceSupportingStatementCount: supportedStatementCount,
      uniqueSupportingSourceCount,
      claimToEvidenceRatio,
      densityBand,
    };

    // P3.W3.2: Reuse pressure — for each source id, count how many statements it supports
    const statementCountBySourceId = new Map();
    for (let i = 0; i < idsPerStatement.length; i++) {
      const ids = idsPerStatement[i];
      const stmtSet = new Set(ids);
      for (const id of stmtSet) {
        statementCountBySourceId.set(id, (statementCountBySourceId.get(id) || 0) + 1);
      }
    }
    let maxStatementCount = 0;
    for (const count of statementCountBySourceId.values()) {
      if (count > maxStatementCount) maxStatementCount = count;
    }
    const mostReusedSourceShare = maxStatementCount / supportedStatementCount;
    let reusePressureBand;
    if (mostReusedSourceShare <= 0.4) reusePressureBand = "low";
    else if (mostReusedSourceShare <= 0.7) reusePressureBand = "moderate";
    else reusePressureBand = "high";

    const reuse = {
      mostReusedSourceShare,
      reusePressureBand,
    };

    // P3.W3.3: Spread
    let sumSourcesPerStatement = 0;
    for (let i = 0; i < idsPerStatement.length; i++) {
      sumSourcesPerStatement += idsPerStatement[i].length;
    }
    const avgSourcesPerSupportedStatement = sumSourcesPerStatement / supportedStatementCount;
    let spreadBand;
    if (avgSourcesPerSupportedStatement >= 2) spreadBand = "broad";
    else if (avgSourcesPerSupportedStatement >= 1.3) spreadBand = "moderate";
    else spreadBand = "narrow";

    const spread = {
      avgSourcesPerSupportedStatement,
      spreadBand,
    };

    if (!doc.meta) doc.meta = {};
    if (!doc.meta.evidenceJudgement) doc.meta.evidenceJudgement = {};
    doc.meta.evidenceJudgement.density = density;
    doc.meta.evidenceJudgement.reuse = reuse;
    doc.meta.evidenceJudgement.spread = spread;
  } catch (_) {
    // Never throw
  }
}

module.exports = { buildEvidenceDensityReuseSpread };
