// lib/build-fragility-drivers.cjs
// A4.13: Evidence Judgement Phase 2 — fragility drivers (up to 3 tags).
// Sync, deterministic, read-only on stmt. Additive meta only.

const MAX_DRIVERS = 3;
const DRIVER_TAGS = [
  "no_supporting_sources",
  "single_source_support",
  "high_source_reliance",
  "material_coverage_gap",
  "weak_evidence_band",
  "no_citations",
];

/**
 * Build fragility drivers array for a statement (up to 3 tags).
 * @param {Object} stmt - Full statement object (read-only)
 * @returns {{ fragilityDrivers: string[] }}
 */
function buildFragilityDrivers(stmt) {
  const drivers = [];
  try {
    if (stmt == null || typeof stmt !== "object") return { fragilityDrivers: [] };
    const meta = stmt.meta;
    if (meta == null || typeof meta !== "object") return { fragilityDrivers: [] };

    const supporting = typeof meta.supportTopology?.supportingSourceCount === "number"
      ? meta.supportTopology.supportingSourceCount
      : 0;
    const citationsArr = Array.isArray(stmt.assessment?.citations) ? stmt.assessment.citations : [];
    const citationsLen = citationsArr.length;

    const evidenceStrengthRaw = meta.evidenceStrength && typeof meta.evidenceStrength === "object"
      ? meta.evidenceStrength
      : {};
    const band = typeof evidenceStrengthRaw.band === "string"
      ? String(evidenceStrengthRaw.band).trim().toLowerCase()
      : "";
    const evidenceBand = ["none", "weak", "moderate", "strong", "very_strong"].includes(band) ? band : "none";

    const relianceRaw = meta.sourceRelianceRisk && typeof meta.sourceRelianceRisk === "object"
      ? meta.sourceRelianceRisk
      : {};
    const relianceLevel = typeof relianceRaw.level === "string"
      ? String(relianceRaw.level).trim().toLowerCase()
      : "";

    const coverageGap = meta.coverageGap && typeof meta.coverageGap === "object" ? meta.coverageGap : {};
    const missingSourceCount = typeof coverageGap.missingSourceCount === "number" ? coverageGap.missingSourceCount : 0;
    const totalSourceCount = typeof coverageGap.totalSourceCount === "number" ? coverageGap.totalSourceCount : 0;
    const referencedSourceCount = typeof coverageGap.referencedSourceCount === "number" ? coverageGap.referencedSourceCount : 0;
    const materialGap = missingSourceCount >= 2 || (totalSourceCount > 0 && referencedSourceCount === 0);

    if (supporting === 0) drivers.push("no_supporting_sources");
    else if (supporting === 1) drivers.push("single_source_support");

    if (relianceLevel === "high") drivers.push("high_source_reliance");
    if (materialGap) drivers.push("material_coverage_gap");
    if (evidenceBand === "none" || evidenceBand === "weak") drivers.push("weak_evidence_band");
    if (citationsLen === 0) drivers.push("no_citations");

    const fragilityDrivers = drivers.slice(0, MAX_DRIVERS).filter((t) => DRIVER_TAGS.includes(t));
    return { fragilityDrivers };
  } catch (_) {
    return { fragilityDrivers: [] };
  }
}

module.exports = { buildFragilityDrivers };
