// lib/build-suggest-priority-p5.cjs
// P5.W1: Risk-Aware Suggest Priority Ordering (Meta Only).
// No UI or suggestion text changes; only ranking/ordering meta for reviewers.
// Adds stmt.meta.suggestPriority from scoringBridge + driver type. Never overrides existing suggestion logic.

/** P4.W2 critical drivers (weight 3) — used for optional +5 boost. */
const CRITICAL_DRIVERS = new Set([
  "single_source_over_reliance",
  "claim_evidence_imbalance",
]);

/**
 * Derive riskPriorityBand from riskPriorityScore (0–100).
 * @param {number} score
 * @returns {"critical"|"high"|"medium"|"low"}
 */
function riskPriorityBandFromScore(score) {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 40) return "medium";
  return "low";
}

/**
 * Whether statement has any critical driver (for +5 boost).
 * @param {Object} stmt
 * @returns {boolean}
 */
function hasCriticalDriver(stmt) {
  const drivers = stmt.meta?.evidenceJudgement?.fragilityDrivers ?? stmt.meta?.judgement?.primaryDrivers;
  if (!Array.isArray(drivers)) return false;
  for (let i = 0; i < drivers.length; i++) {
    const d = typeof drivers[i] === "string" ? drivers[i].trim() : "";
    if (d && CRITICAL_DRIVERS.has(d)) return true;
  }
  return false;
}

/**
 * Build stmt.meta.suggestPriority from scoringBridge. If scoringBridge missing, do not emit.
 * riskPriorityScore = (fragilitySeverityScore * 0.5) + ((100 - evidenceQualityScore) * 0.3) + ((100 - confidenceScore) * 0.2)
 * Optional: +5 if critical driver present (clamped 100).
 * @param {Object[]} statements
 */
function buildSuggestPriorityP5(statements) {
  try {
    if (!Array.isArray(statements)) return;
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      if (stmt == null || typeof stmt !== "object") continue;
      const bridge = stmt.meta?.scoringBridge;
      if (bridge == null || typeof bridge !== "object") continue;

      const fragilitySeverityScore = typeof bridge.fragilitySeverityScore === "number" ? bridge.fragilitySeverityScore : 0;
      const evidenceQualityScore = typeof bridge.evidenceQualityScore === "number" ? bridge.evidenceQualityScore : 70;
      const confidenceScore = typeof bridge.confidenceScore === "number" ? bridge.confidenceScore : 65;

      let riskPriorityScore =
        fragilitySeverityScore * 0.5 +
        (100 - evidenceQualityScore) * 0.3 +
        (100 - confidenceScore) * 0.2;

      if (hasCriticalDriver(stmt)) {
        riskPriorityScore = Math.min(100, riskPriorityScore + 5);
      }

      riskPriorityScore = Math.max(0, Math.min(100, Math.round(riskPriorityScore)));
      const riskPriorityBand = riskPriorityBandFromScore(riskPriorityScore);

      if (!stmt.meta) stmt.meta = {};
      stmt.meta.suggestPriority = {
        riskPriorityScore,
        riskPriorityBand,
      };
    }
  } catch (_) {
    // Never throw
  }
}

module.exports = { buildSuggestPriorityP5 };
