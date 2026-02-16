// lib/build-fragility-driver-tags-p3.cjs
// P3.W4: Fragility Driver Explanation Tags (Meta Only).
// Converts Phase 3 signals into human-readable driver tags. Deterministic, sync, no model calls.
// Does not change NC1/NC2, P3.W1/W2/W3, canonicalClaims, reliabilityScore, or evidence binding.

/**
 * Dedupe and return array of strings (order preserved).
 * @param {string[]} arr
 * @returns {string[]}
 */
function dedupe(arr) {
  const seen = new Set();
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const t = arr[i];
    if (typeof t !== "string" || t === "" || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/**
 * Compute statement-level P3 fragility driver tags from numeric and cross-statement signals.
 * @param {Object} stmt - Statement (read-only)
 * @returns {string[]}
 */
function statementP3Tags(stmt) {
  const tags = [];
  try {
    if (stmt == null || typeof stmt !== "object") return tags;
    const meta = stmt.meta;
    if (meta == null || typeof meta !== "object") return tags;

    const neq = meta.evidenceJudgementInputs?.numericEvidenceQuality;
    if (neq != null && typeof neq === "object") {
      const qualityBand = typeof neq.qualityBand === "string" ? neq.qualityBand : "";
      if (qualityBand === "approx_heavy") {
        tags.push("approximation_reliance");
        const exactSourceRatio = typeof neq.exactSourceRatio === "number" ? neq.exactSourceRatio : 0;
        if (exactSourceRatio === 0) tags.push("rounded_only_numeric_support");
      }
    }

    const cross = meta.evidenceJudgement?.crossStatementNumericFragility;
    if (cross != null && typeof cross === "object") {
      const flag = typeof cross.fragilityFlag === "string" ? cross.fragilityFlag : "";
      if (flag === "inconsistent_vs_doc") tags.push("numeric_inconsistent_vs_document");
      else if (flag === "approx_outlier") tags.push("numeric_outlier_statement");
    }

    return dedupe(tags);
  } catch (_) {
    return [];
  }
}

/**
 * Compute document-level P3 fragility driver tags from density, reuse, spread.
 * @param {Object} doc - Document/response with doc.meta.evidenceJudgement
 * @returns {string[]}
 */
function documentP3Tags(doc) {
  const tags = [];
  try {
    if (doc == null || typeof doc !== "object") return tags;
    const ej = doc.meta?.evidenceJudgement;
    if (ej == null || typeof ej !== "object") return tags;

    const density = ej.density;
    if (density != null && typeof density === "object") {
      const band = typeof density.densityBand === "string" ? density.densityBand : "";
      if (band === "evidence_concentrated") tags.push("claim_evidence_imbalance");
    }

    const reuse = ej.reuse;
    if (reuse != null && typeof reuse === "object") {
      const band = typeof reuse.reusePressureBand === "string" ? reuse.reusePressureBand : "";
      if (band === "high") tags.push("single_source_over_reliance");
      else if (band === "moderate") tags.push("evidence_reuse_pressure");
    }

    const spread = ej.spread;
    if (spread != null && typeof spread === "object") {
      const band = typeof spread.spreadBand === "string" ? spread.spreadBand : "";
      if (band === "narrow") tags.push("narrow_support_base");
    }

    return dedupe(tags);
  } catch (_) {
    return [];
  }
}

/**
 * Build and attach P3 fragility driver tags to statements and document.
 * Statement: merges with existing evidenceJudgement.fragilityDrivers and dedupes.
 * Document: sets doc.meta.evidenceJudgement.fragilityDrivers.
 * @param {Object[]} statements - Full statements array
 * @param {Object} doc - Document/response object with .meta
 */
function buildFragilityDriverTagsP3(statements, doc) {
  try {
    if (!Array.isArray(statements)) return;

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      if (stmt == null || typeof stmt !== "object") continue;
      const p3Tags = statementP3Tags(stmt);
      if (p3Tags.length === 0) continue;

      if (!stmt.meta) stmt.meta = {};
      if (!stmt.meta.evidenceJudgement) stmt.meta.evidenceJudgement = {};
      const existing = Array.isArray(stmt.meta.evidenceJudgement.fragilityDrivers)
        ? stmt.meta.evidenceJudgement.fragilityDrivers
        : [];
      stmt.meta.evidenceJudgement.fragilityDrivers = dedupe([...existing, ...p3Tags]);
    }

    if (doc != null && typeof doc === "object") {
      const docTags = documentP3Tags(doc);
      if (docTags.length > 0) {
        if (!doc.meta) doc.meta = {};
        if (!doc.meta.evidenceJudgement) doc.meta.evidenceJudgement = {};
        doc.meta.evidenceJudgement.fragilityDrivers = docTags;
      }
    }
  } catch (_) {
    // Never throw
  }
}

module.exports = { buildFragilityDriverTagsP3 };
