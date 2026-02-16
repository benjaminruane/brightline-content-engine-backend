// lib/canonicalise-drivers-p4.cjs
// P4.CLEAN1: Driver Canonicalisation Mapping (Meta Only).
// Maps legacy/variant driver names → canonical names before P4.W1/W2/W3/W4.
// Safe: already-canonical unchanged; unknown drivers kept; dedupe after mapping; never throw.

/** Canonical driver set (target). */
const CANONICAL_DRIVERS = new Set([
  "single_source_over_reliance",
  "claim_evidence_imbalance",
  "approximation_reliance",
  "numeric_inconsistent_vs_document",
  "narrow_support_base",
  "evidence_reuse_pressure",
]);

/** Legacy/variant → canonical. Only non-canonical names that map to canonical. */
const LEGACY_TO_CANONICAL = new Map([
  ["single_source_support", "single_source_over_reliance"],
  ["high_source_reliance", "single_source_over_reliance"],
  ["material_coverage_gap", "claim_evidence_imbalance"],
]);

/**
 * Map one driver to canonical form. If already canonical or unknown, return as-is.
 * @param {string} driver
 * @returns {string}
 */
function mapDriver(driver) {
  if (typeof driver !== "string") return "";
  const t = driver.trim();
  if (!t) return "";
  if (CANONICAL_DRIVERS.has(t)) return t;
  const mapped = LEGACY_TO_CANONICAL.get(t);
  return mapped != null ? mapped : t;
}

/**
 * Canonicalise a list of drivers: map legacy → canonical, then dedupe (order preserved).
 * Unknown drivers are kept unchanged. Never throws.
 * @param {string[]} drivers
 * @returns {string[]}
 */
function canonicaliseDrivers(drivers) {
  try {
    if (!Array.isArray(drivers) || drivers.length === 0) return [];
    const mapped = [];
    for (let i = 0; i < drivers.length; i++) {
      const out = mapDriver(drivers[i]);
      if (out && !mapped.includes(out)) mapped.push(out);
    }
    return mapped;
  } catch (_) {
    return Array.isArray(drivers) ? [...drivers] : [];
  }
}

/**
 * Canonicalise fragilityDrivers on all statements and doc.meta.evidenceJudgement (in place).
 * Run after drivers are assembled (e.g. after buildFragilityDriverTagsP3), before P4.W1/W2/W3/W4.
 * @param {Object[]} statements
 * @param {Object} doc
 */
function canonicaliseDriversInPlace(statements, doc) {
  try {
    if (Array.isArray(statements)) {
      for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i];
        if (stmt == null || typeof stmt !== "object") continue;
        const ej = stmt.meta?.evidenceJudgement;
        if (ej == null || typeof ej !== "object") continue;
        if (!Array.isArray(ej.fragilityDrivers)) continue;
        ej.fragilityDrivers = canonicaliseDrivers(ej.fragilityDrivers);
      }
    }
    if (doc != null && typeof doc === "object") {
      const ej = doc.meta?.evidenceJudgement;
      if (ej != null && typeof ej === "object" && Array.isArray(ej.fragilityDrivers)) {
        doc.meta.evidenceJudgement.fragilityDrivers = canonicaliseDrivers(ej.fragilityDrivers);
      }
    }
  } catch (_) {
    // Never throw
  }
}

module.exports = {
  canonicaliseDrivers,
  canonicaliseDriversInPlace,
  CANONICAL_DRIVERS,
  LEGACY_TO_CANONICAL,
};
