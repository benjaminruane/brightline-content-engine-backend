// lib/build-suggest-bundle-p5.cjs
// P5.BUNDLE-A: Suggest Risk Theme Grouping + Fix Impact Estimation (Meta Only).
// No UI or suggestion text changes; ranking and metadata only.
// Groups suggestions into risk themes; estimates which fixes reduce fragility most.

/** Driver → theme (P5.BUNDLE-A mapping). */
const DRIVER_TO_THEME = new Map([
  ["single_source_over_reliance", "Evidence Strength"],
  ["claim_evidence_imbalance", "Evidence Strength"],
  ["narrow_support_base", "Coverage Strength"],
  ["approximation_reliance", "Numeric Evidence"],
  ["numeric_inconsistent_vs_document", "Numeric Evidence"],
  ["evidence_reuse_pressure", "Evidence Concentration"],
]);

/** Theme → suggestion type for impact estimates. */
const THEME_TO_SUGGESTION_TYPE = new Map([
  ["Evidence Strength", "add sources"],
  ["Coverage Strength", "expand coverage"],
  ["Numeric Evidence", "improve numeric evidence"],
  ["Evidence Concentration", "diversify sources"],
]);

/** P4.W2 severity: 3 = critical, 2 = high, 1 = medium. */
const DRIVER_WEIGHTS = new Map([
  ["single_source_over_reliance", 3],
  ["claim_evidence_imbalance", 3],
  ["approximation_reliance", 2],
  ["numeric_inconsistent_vs_document", 2],
  ["narrow_support_base", 2],
  ["evidence_reuse_pressure", 1],
]);

/** Numeric-context drivers → confidence low when present. */
const NUMERIC_CONTEXT_DRIVERS = new Set([
  "approximation_reliance",
  "numeric_inconsistent_vs_document",
]);

function themeBandFromScore(score) {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 40) return "medium";
  return "low";
}

/**
 * Severity tier from weight: 3 → "critical", 2 → "high", 1 → "medium".
 * @param {number} w
 * @returns {"critical"|"high"|"medium"}
 */
function severityTier(w) {
  if (w >= 3) return "critical";
  if (w >= 2) return "high";
  return "medium";
}

/**
 * Estimated fragility reduction (0–30): critical 18–25, high 12–18, medium 6–12.
 * @param {"critical"|"high"|"medium"} tier
 * @returns {number}
 */
function reductionForTier(tier) {
  if (tier === "critical") return 22;
  if (tier === "high") return 15;
  return 9;
}

/**
 * Confidence: high = single dominant driver, medium = multiple, low = weak/approx numeric context.
 * @param {string[]} driversForTheme
 * @param {string[]} allDrivers
 * @returns {"high"|"medium"|"low"}
 */
function impactConfidence(driversForTheme, allDrivers) {
  const hasNumericContext = (allDrivers || []).some((d) => NUMERIC_CONTEXT_DRIVERS.has(d));
  if (hasNumericContext) return "low";
  if (driversForTheme.length <= 1 && (allDrivers || []).length <= 1) return "high";
  return "medium";
}

/**
 * Build stmt.meta.suggestThemes and stmt.meta.suggestImpactEstimates.
 * If no drivers, neither field is emitted. Never throws.
 * @param {Object[]} statements
 */
function buildSuggestBundleP5(statements) {
  try {
    if (!Array.isArray(statements)) return;
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      if (stmt == null || typeof stmt !== "object") continue;

      const drivers = Array.isArray(stmt.meta?.evidenceJudgement?.fragilityDrivers)
        ? stmt.meta.evidenceJudgement.fragilityDrivers
        : [];
      const validDrivers = drivers
        .map((d) => (typeof d === "string" ? d.trim() : ""))
        .filter((d) => d && DRIVER_TO_THEME.has(d));

      if (validDrivers.length === 0) continue;

      const riskPriorityScore =
        typeof stmt.meta?.suggestPriority?.riskPriorityScore === "number"
          ? stmt.meta.suggestPriority.riskPriorityScore
          : 50;
      const band = themeBandFromScore(riskPriorityScore);

      // Group drivers by theme
      const themeToDrivers = new Map();
      for (const d of validDrivers) {
        const theme = DRIVER_TO_THEME.get(d);
        if (!theme) continue;
        if (!themeToDrivers.has(theme)) themeToDrivers.set(theme, []);
        themeToDrivers.get(theme).push(d);
      }

      const suggestThemes = [];
      const suggestImpactEstimates = [];

      for (const [theme, topDrivers] of themeToDrivers) {
        suggestThemes.push({
          theme,
          themePriority: Math.max(0, Math.min(100, riskPriorityScore)),
          themeBand: band,
          topDrivers: [...topDrivers],
        });

        const suggestionType = THEME_TO_SUGGESTION_TYPE.get(theme) || theme;
        const weights = topDrivers.map((d) => DRIVER_WEIGHTS.get(d) ?? 1);
        const maxWeight = weights.length ? Math.max(...weights) : 1;
        const tier = severityTier(maxWeight);
        let estimatedFragilityReduction = reductionForTier(tier);
        estimatedFragilityReduction = Math.max(0, Math.min(30, estimatedFragilityReduction));
        const confidence = impactConfidence(topDrivers, validDrivers);

        suggestImpactEstimates.push({
          suggestionType,
          estimatedFragilityReduction,
          confidence,
        });
      }

      if (!stmt.meta) stmt.meta = {};
      stmt.meta.suggestThemes = suggestThemes;
      stmt.meta.suggestImpactEstimates = suggestImpactEstimates;
    }
  } catch (_) {
    // Never throw
  }
}

module.exports = { buildSuggestBundleP5 };
