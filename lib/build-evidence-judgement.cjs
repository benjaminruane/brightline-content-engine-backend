// lib/build-evidence-judgement.cjs
// A4.12: Evidence Judgement Phase 1 — deterministic additive meta only.
// Synchronous, never throws; returns safe defaults on invalid/missing input.
// Read-only on stmt. No external deps.

/**
 * Build evidence judgement meta for a statement (fragility, diversity, language-support mismatch).
 * @param {Object} stmt - Full statement object (read-only)
 * @returns {{ fragilityIndex: number, fragilityBand: string, evidenceDiversityBand: string, languageSupportMismatch: { isMismatch: boolean, direction: string|null, reason: string|null } }}
 */
function buildEvidenceJudgement(stmt) {
  const safe = {
    fragilityIndex: 0,
    fragilityBand: "robust",
    evidenceDiversityBand: "none",
    languageSupportMismatch: { isMismatch: false, direction: null, reason: null },
  };
  try {
    if (stmt == null || typeof stmt !== "object") return safe;
    const meta = stmt.meta;
    if (meta == null || typeof meta !== "object") return safe;

    const supporting = typeof meta.supportTopology?.supportingSourceCount === "number"
      ? meta.supportTopology.supportingSourceCount
      : 0;
    const totalSources = typeof meta.evidenceExplanation?.totalSourcesConsidered === "number"
      ? meta.evidenceExplanation.totalSourcesConsidered
      : 0;

    const citationsArr = Array.isArray(stmt.assessment?.citations) ? stmt.assessment.citations : [];
    const citationsLen = citationsArr.length;

    const evidenceStrengthRaw = meta.evidenceStrength && typeof meta.evidenceStrength === "object"
      ? meta.evidenceStrength
      : {};
    const strengthBand = typeof evidenceStrengthRaw.band === "string"
      ? String(evidenceStrengthRaw.band).trim().toLowerCase()
      : "";
    const evidenceStrengthBand = ["none", "weak", "moderate", "strong", "very_strong"].includes(strengthBand)
      ? strengthBand
      : "none";

    const relianceRaw = meta.sourceRelianceRisk && typeof meta.sourceRelianceRisk === "object"
      ? meta.sourceRelianceRisk
      : {};
    const relianceLevelRaw = typeof relianceRaw.level === "string" ? String(relianceRaw.level).trim().toLowerCase() : "";
    const sourceRelianceLevel = ["high", "moderate", "low"].includes(relianceLevelRaw)
      ? relianceLevelRaw
      : "low";

    const coverageGap = meta.coverageGap && typeof meta.coverageGap === "object" ? meta.coverageGap : {};
    const missingSourceCount = typeof coverageGap.missingSourceCount === "number" ? coverageGap.missingSourceCount : 0;
    const totalSourceCount = typeof coverageGap.totalSourceCount === "number" ? coverageGap.totalSourceCount : 0;
    const referencedSourceCount = typeof coverageGap.referencedSourceCount === "number" ? coverageGap.referencedSourceCount : 0;
    let coverageGapSeverity;
    if (typeof coverageGap.level === "string" && coverageGap.level) {
      const l = String(coverageGap.level).toLowerCase();
      if (l === "high" || l === "material") coverageGapSeverity = "material_high";
      else if (l === "medium") coverageGapSeverity = "medium";
      else coverageGapSeverity = "none";
    } else if (typeof coverageGap.band === "string" && coverageGap.band) {
      const b = String(coverageGap.band).toLowerCase();
      if (b === "high" || b === "material") coverageGapSeverity = "material_high";
      else if (b === "medium") coverageGapSeverity = "medium";
      else coverageGapSeverity = "none";
    } else {
      if (missingSourceCount >= 2 || (totalSourceCount > 0 && referencedSourceCount === 0)) {
        coverageGapSeverity = "material_high";
      } else if (missingSourceCount === 1 || (totalSourceCount > 0 && referencedSourceCount > 0 && referencedSourceCount < totalSourceCount * 0.5)) {
        coverageGapSeverity = "medium";
      } else {
        coverageGapSeverity = "none";
      }
    }

    // --- evidenceDiversityBand ---
    let evidenceDiversityBand;
    if (totalSources === 0) {
      evidenceDiversityBand = "none";
    } else {
      const spreadRatio = supporting / totalSources;
      if (supporting >= 3 || spreadRatio >= 0.6) evidenceDiversityBand = "high";
      else if (supporting === 2 || spreadRatio >= 0.35) evidenceDiversityBand = "medium";
      else if (supporting === 1 || spreadRatio > 0) evidenceDiversityBand = "low";
      else evidenceDiversityBand = "none";
    }

    // --- fragility index (0–100) ---
    let fragilityIndex = 0;
    if (evidenceStrengthBand === "none" || evidenceStrengthBand === "weak") fragilityIndex += 30;
    else if (evidenceStrengthBand === "moderate") fragilityIndex += 15;

    if (supporting === 0) fragilityIndex += 25;
    else if (supporting === 1) fragilityIndex += 15;
    else if (supporting === 2) fragilityIndex += 5;

    if (sourceRelianceLevel === "high") fragilityIndex += 20;
    else if (sourceRelianceLevel === "moderate") fragilityIndex += 10;

    if (coverageGapSeverity === "material_high") fragilityIndex += 15;
    else if (coverageGapSeverity === "medium") fragilityIndex += 7;

    fragilityIndex = Math.max(0, Math.min(100, Math.round(fragilityIndex)));

    let fragilityBand;
    if (fragilityIndex <= 24) fragilityBand = "robust";
    else if (fragilityIndex <= 49) fragilityBand = "moderate";
    else if (fragilityIndex <= 74) fragilityBand = "fragile";
    else fragilityBand = "highly_fragile";

    // --- languageSupportMismatch (overclaim) ---
    const complianceSignals = Array.isArray(meta.complianceSignals) ? meta.complianceSignals : [];
    const complianceTypes = new Set(complianceSignals.map((s) => s && s.type).filter(Boolean));
    const hasOverclaimCompliance = complianceTypes.has("promissory_language") ||
      complianceTypes.has("implied_guarantee_escalation") ||
      complianceTypes.has("forward_looking_unqualified");

    const weakOrNoSupport = (evidenceStrengthBand === "none" || evidenceStrengthBand === "weak") &&
      (citationsLen === 0 || supporting === 0 || sourceRelianceLevel === "high");

    const isOverclaim = weakOrNoSupport || hasOverclaimCompliance;
    let isMismatch = false;
    let direction = null;
    let reason = null;
    if (isOverclaim) {
      isMismatch = true;
      direction = "overclaim";
      if (weakOrNoSupport && (evidenceStrengthBand === "none" || evidenceStrengthBand === "weak")) {
        reason = "Strong certainty language with weak/absent support.";
      } else if (hasOverclaimCompliance) {
        reason = "Forward-looking or promissory framing not matched by support strength.";
      } else {
        reason = "No citations or supporting sources for claim strength.";
      }
    }

    return {
      fragilityIndex,
      fragilityBand,
      evidenceDiversityBand,
      languageSupportMismatch: { isMismatch, direction, reason },
    };
  } catch (_) {
    return safe;
  }
}

module.exports = { buildEvidenceJudgement };
