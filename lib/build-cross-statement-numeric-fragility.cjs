// lib/build-cross-statement-numeric-fragility.cjs
// P3.W2: Cross-Statement Numeric Fragility (Bundle; Meta Only).
// Deterministic, sync, no model calls. Additive meta only.
// Does not change P3.W1, NC1/NC2, canonicalClaims, reliabilityScore, or evidence binding.

/**
 * Build document-level numeric consistency band and approx spread, and statement-level
 * cross-statement numeric fragility flags. Uses only stmt.meta.evidenceJudgementInputs.numericEvidenceQuality.
 * @param {Object[]} statements - Full statements array (read-only; may mutate stmt.meta.evidenceJudgement)
 * @param {Object} doc - Document/response object with .meta (will set doc.meta.evidenceJudgement.*)
 */
function buildCrossStatementNumericFragility(statements, doc) {
  try {
    if (!Array.isArray(statements) || statements.length === 0) return;
    const statementsWithNumeric = statements.filter(
      (s) => s != null
        && typeof s === "object"
        && s.meta != null
        && typeof s.meta.evidenceJudgementInputs === "object"
        && s.meta.evidenceJudgementInputs != null
        && s.meta.evidenceJudgementInputs.numericEvidenceQuality != null
        && typeof s.meta.evidenceJudgementInputs.numericEvidenceQuality === "object"
    );
    const total = statementsWithNumeric.length;
    if (total === 0) return;

    const strongStatements = statementsWithNumeric.filter(
      (s) => s.meta.evidenceJudgementInputs.numericEvidenceQuality.qualityBand === "strong"
    ).length;
    const mixedStatements = statementsWithNumeric.filter(
      (s) => s.meta.evidenceJudgementInputs.numericEvidenceQuality.qualityBand === "mixed"
    ).length;
    const approxHeavyStatements = statementsWithNumeric.filter(
      (s) => s.meta.evidenceJudgementInputs.numericEvidenceQuality.qualityBand === "approx_heavy"
    ).length;

    // P3.W2.1: Document consistency band
    const approxHeavyRatio = approxHeavyStatements / total;
    let consistencyBand;
    if (approxHeavyRatio >= 0.6) {
      consistencyBand = "approx_dominant";
    } else if (strongStatements === total) {
      consistencyBand = "uniform_strong";
    } else {
      consistencyBand = "mixed_quality";
    }

    const numericConsistency = {
      consistencyBand,
      strongStatementRatio: strongStatements / total,
      approxHeavyStatementRatio: approxHeavyStatements / total,
      statementCount: total,
    };

    // P3.W2.2: Spread signals
    const numericApproxSpread = {
      approxStatementRatio: approxHeavyRatio,
      hasMixedQuality: mixedStatements > 0,
      hasApproxDominance: approxHeavyRatio >= 0.6,
    };

    // Document-level output
    if (doc != null && typeof doc === "object") {
      if (!doc.meta) doc.meta = {};
      if (!doc.meta.evidenceJudgement) doc.meta.evidenceJudgement = {};
      doc.meta.evidenceJudgement.numericConsistency = numericConsistency;
      doc.meta.evidenceJudgement.numericApproxSpread = numericApproxSpread;
    }

    // P3.W2.3: Statement-level fragility flag
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      if (stmt == null || typeof stmt !== "object") continue;
      const neq = stmt.meta?.evidenceJudgementInputs?.numericEvidenceQuality;
      if (neq == null || typeof neq !== "object") continue;

      const qualityBand = typeof neq.qualityBand === "string" ? neq.qualityBand : "";
      let fragilityFlag = "none";
      if (consistencyBand === "uniform_strong" && qualityBand !== "strong") {
        fragilityFlag = "inconsistent_vs_doc";
      } else if (qualityBand === "approx_heavy" && approxHeavyRatio < 0.4) {
        fragilityFlag = "approx_outlier";
      }

      if (!stmt.meta) stmt.meta = {};
      if (!stmt.meta.evidenceJudgement) stmt.meta.evidenceJudgement = {};
      stmt.meta.evidenceJudgement.crossStatementNumericFragility = {
        fragilityFlag,
        docConsistencyBand: consistencyBand,
      };
    }
  } catch (_) {
    // Never throw
  }
}

module.exports = { buildCrossStatementNumericFragility };
