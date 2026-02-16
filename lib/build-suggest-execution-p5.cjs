// lib/build-suggest-execution-p5.cjs
// P5.W4: Suggest Execution Sequencing (Meta Only).
// No UI or suggestion text; works on top of priority. Provides recommended fix order across themes.

/** Fixed step order for themes. Step 1 = Evidence Strength (if priority ≥ medium), then Numeric, Coverage, Concentration, Language. */
const THEME_STEP_ORDER = [
  "Evidence Strength",
  "Numeric Evidence",
  "Coverage Strength",
  "Evidence Concentration",
  "Language / Framing",
];

/** Theme → reason text (P5.W4 templates). */
const THEME_REASON = new Map([
  ["Evidence Strength", "Strengthening evidence base reduces overall fragility most."],
  ["Numeric Evidence", "Improving numeric support stabilises quantitative claims."],
  ["Coverage Strength", "Improving coverage reduces unsupported claim risk."],
  ["Evidence Concentration", "Diversifying sources reduces concentration risk."],
  ["Language / Framing", "Adjusting language aligns tone with evidence strength."],
]);

/**
 * expectedRiskReductionBand from estimatedFragilityReduction: ≥18 high, ≥10 medium, <10 low.
 * @param {number} reduction
 * @returns {"high"|"medium"|"low"}
 */
function reductionBand(reduction) {
  if (reduction >= 18) return "high";
  if (reduction >= 10) return "medium";
  return "low";
}

/**
 * Build stmt.meta.suggestExecutionPlan from suggestThemes + suggestImpactEstimates + suggestPriority.
 * Step 1 = Evidence Strength only if priority ≥ medium; then Numeric, Coverage, Evidence Concentration, Language.
 * If no themes, do not emit. Never throw.
 * @param {Object[]} statements
 */
function buildSuggestExecutionPlanP5(statements) {
  try {
    if (!Array.isArray(statements)) return;
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      if (stmt == null || typeof stmt !== "object") continue;

      const themes = stmt.meta?.suggestThemes;
      const estimates = stmt.meta?.suggestImpactEstimates;
      if (!Array.isArray(themes) || themes.length === 0) continue;

      const riskPriorityScore = typeof stmt.meta?.suggestPriority?.riskPriorityScore === "number"
        ? stmt.meta.suggestPriority.riskPriorityScore
        : 0;
      const priorityAtLeastMedium = riskPriorityScore >= 40;

      const themeToReduction = new Map();
      if (Array.isArray(estimates)) {
        for (let j = 0; j < themes.length; j++) {
          const theme = themes[j]?.theme;
          if (theme && estimates[j] != null && typeof estimates[j].estimatedFragilityReduction === "number") {
            themeToReduction.set(theme, estimates[j].estimatedFragilityReduction);
          }
        }
      }

      const themeSet = new Set(themes.map((t) => t?.theme).filter(Boolean));
      const plan = [];
      let stepOrder = 0;

      for (const theme of THEME_STEP_ORDER) {
        if (!themeSet.has(theme)) continue;
        if (theme === "Evidence Strength" && !priorityAtLeastMedium) continue;
        stepOrder += 1;
        const reduction = themeToReduction.get(theme) ?? 0;
        plan.push({
          stepOrder,
          theme,
          reason: THEME_REASON.get(theme) || "",
          expectedRiskReductionBand: reductionBand(reduction),
        });
      }

      if (plan.length === 0) continue;

      if (!stmt.meta) stmt.meta = {};
      stmt.meta.suggestExecutionPlan = plan;
    }
  } catch (_) {
    // Never throw
  }
}

module.exports = { buildSuggestExecutionPlanP5 };
