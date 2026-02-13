// lib/build-compliance-signals.cjs
// A4.7: Compliance Lite Phase 1 — deterministic meta-only signal detection.
// Synchronous, never throws; returns [] on internal failure.
// Read-only: uses only existing stmt fields; does not mutate stmt.

/**
 * Build deterministic compliance signals for a statement (additive meta only).
 * @param {Object} stmt - Full statement object (read-only)
 * @returns {Array<{ type: string, severity: "low"|"medium"|"high", confidence: number, reason: string }>}
 */
function buildComplianceSignals(stmt) {
  const out = [];
  try {
    if (stmt == null || typeof stmt !== "object") return out;
    const text = typeof stmt.text === "string" ? stmt.text : "";
    const textLower = text.toLowerCase();
    const assessment = stmt.assessment || {};
    const meta = stmt.meta || {};
    const canonicalClaims = Array.isArray(assessment.canonicalClaims) ? assessment.canonicalClaims : [];
    const citations = Array.isArray(assessment.citations) ? assessment.citations : [];
    const evidence = Array.isArray(assessment.evidence) ? assessment.evidence : [];
    const evidenceStrength = meta.evidenceStrength && typeof meta.evidenceStrength === "object" ? meta.evidenceStrength : {};
    const band = typeof evidenceStrength.band === "string" ? evidenceStrength.band : "";
    const sourceSpread = meta.sourceSpread && typeof meta.sourceSpread === "object"
      ? meta.sourceSpread
      : (meta.v2Reasoning && meta.v2Reasoning.sourceSpread) || {};
    const supportingSourceCount = typeof sourceSpread.supportingSourceCount === "number"
      ? sourceSpread.supportingSourceCount
      : 0;
    const coverageGap = meta.coverageGap && typeof meta.coverageGap === "object" ? meta.coverageGap : {};
    const missingSourceCount = typeof coverageGap.missingSourceCount === "number" ? coverageGap.missingSourceCount : 0;
    const referencedSourceCount = typeof coverageGap.referencedSourceCount === "number" ? coverageGap.referencedSourceCount : null;
    const hasNoEvidence = citations.length === 0 && evidence.length === 0;
    const coverageGapMaterial = missingSourceCount > 0 || referencedSourceCount === 0;

    const hasWord = (str, words) => {
      if (typeof str !== "string" || !Array.isArray(words)) return false;
      const re = new RegExp("\\b(" + words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")\\b", "i");
      return re.test(str);
    };

    // --- 1) promissory_language ---
    const PROMISSORY_PHRASES = [
      "will deliver",
      "will certainly",
      "guarantees",
      "ensures",
      "will dominate",
      "cannot fail",
    ];
    const promissoryMatches = PROMISSORY_PHRASES.filter((p) => textLower.includes(p));
    if (promissoryMatches.length > 0) {
      const severity = hasNoEvidence || band === "weak" ? "high" : "medium";
      const confidence = 0.75 + (promissoryMatches.length > 1 ? 0.1 : 0);
      const phrase = promissoryMatches[0];
      out.push({
        type: "promissory_language",
        severity,
        confidence: Math.min(1, confidence),
        reason: `Uses promissory language ('${phrase}') without qualification.`,
      });
    }

    // --- 2) forward_looking_unqualified ---
    const PROJECTION_WORDS = ["will", "expected to", "projected to", "forecast to", "likely to"];
    const QUALIFIER_WORDS = ["may", "could", "subject to", "depending on", "if", "potential"];
    const hasProjection = hasWord(textLower, PROJECTION_WORDS);
    const hasQualifier = hasWord(textLower, QUALIFIER_WORDS);
    if (hasProjection && !hasQualifier) {
      let severity = "medium";
      if (coverageGapMaterial || band === "weak") severity = "high";
      out.push({
        type: "forward_looking_unqualified",
        severity,
        confidence: 0.7,
        reason: "Forward-looking claim without qualifying language.",
      });
    }

    // --- 3) performance_claim_no_context ---
    const PERF_TRIGGER_WORDS = ["best-in-class", "market leading", "dominant", "superior", "unmatched"];
    const hasPerfTrigger = hasWord(textLower, PERF_TRIGGER_WORDS);
    const hasNumericCanonical = canonicalClaims.some(
      (cc) => cc && typeof cc.value === "number" && Number.isFinite(cc.value)
    );
    const supportTopology = meta.supportTopology && typeof meta.supportTopology === "object" ? meta.supportTopology : {};
    const supportingSourcesFromTopology = typeof supportTopology.supportingSourceCount === "number" ? supportTopology.supportingSourceCount : (citations.length > 0 ? citations.length : evidence.length);
    const hasTwoOrMoreSources = supportingSourcesFromTopology >= 2 || citations.length >= 2 || evidence.length >= 2;
    const hasStrongEvidence = band === "strong";
    const hasContext = hasNumericCanonical || hasTwoOrMoreSources || hasStrongEvidence;
    if (hasPerfTrigger && !hasContext) {
      const severity = citations.length === 0 ? "high" : "medium";
      out.push({
        type: "performance_claim_no_context",
        severity,
        confidence: 0.72,
        reason: "Performance positioning without supporting comparative context.",
      });
    }

    // --- 4) potential_cherry_pick_posture ---
    const POSITIVE_FRAMING_WORDS = ["leading", "strong", "outperform", "growth", "success", "top performer", "best", "robust", "outstanding", "market leader", "dominant"];
    const hasPositiveFraming = hasWord(textLower, POSITIVE_FRAMING_WORDS);
    const evidenceNotStrong = band !== "strong";
    const narrowEvidence = supportingSourceCount <= 1;
    if (hasPositiveFraming && evidenceNotStrong && narrowEvidence) {
      out.push({
        type: "potential_cherry_pick_posture",
        severity: "medium",
        confidence: 0.65,
        reason: "Positive performance framing supported by narrow evidence base.",
      });
    }

    return out;
  } catch (_) {
    return [];
  }
}

module.exports = { buildComplianceSignals };
