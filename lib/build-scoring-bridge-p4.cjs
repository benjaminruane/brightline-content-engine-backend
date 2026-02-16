// lib/build-scoring-bridge-p4.cjs
// P4.W4: Scoring Bridge (Meta Only, No Score Changes).
// Deterministic, sync, no model calls. Adds stmt.meta.scoringBridge and doc.meta.scoringBridge only.
// Does not change reliabilityScore, fragilityPosture, fragilityDrivers, narrative, or any Phase 3/4 signals.

/** P4.W4: Base fragility severity by posture. */
const POSTURE_BASE_SCORE = new Map([
  ["robust", 10],
  ["supported_with_caveats", 45],
  ["fragile", 75],
]);

/** Driver tier → severity increment (Critical +10, High +6, Medium +3). */
const DRIVER_INCREMENT = new Map([
  ["single_source_over_reliance", 10],
  ["claim_evidence_imbalance", 10],
  ["approximation_reliance", 6],
  ["numeric_inconsistent_vs_document", 6],
  ["narrow_support_base", 6],
  ["evidence_reuse_pressure", 3],
]);

/** P4.W4: Judgement confidence → 0–100 score. */
const CONFIDENCE_SCORE = new Map([
  ["high", 85],
  ["medium", 65],
  ["low", 40],
]);

function clamp(n) {
  const v = Number(n);
  if (Number.isNaN(v)) return 0;
  return Math.max(0, Math.min(100, Math.round(v)));
}

/**
 * Compute fragilitySeverityScore from posture + drivers. Base + driver increments, clamp 0–100.
 * @param {string} posture
 * @param {string[]} drivers
 * @returns {number}
 */
function fragilitySeverityScore(posture, drivers) {
  const base = POSTURE_BASE_SCORE.get(posture);
  if (base === undefined) return 0;
  let sum = base;
  if (Array.isArray(drivers)) {
    for (let i = 0; i < drivers.length; i++) {
      const d = typeof drivers[i] === "string" ? drivers[i].trim() : "";
      if (d) sum += DRIVER_INCREMENT.get(d) || 0;
    }
  }
  return clamp(sum);
}

/**
 * Statement evidence quality 0–100 from numeric quality + cross-statement fragility (no reuse/spread at stmt).
 * strong numeric + no flag → 85–95; mixed / moderate → 60–80; approx heavy / high reuse / concentrated → 30–55.
 * @param {Object} stmt
 * @returns {number | null} null if inputs missing
 */
function statementEvidenceQualityScore(stmt) {
  try {
    const neq = stmt?.meta?.evidenceJudgementInputs?.numericEvidenceQuality;
    const qualityBand = neq != null && typeof neq === "object" && typeof neq.qualityBand === "string" ? neq.qualityBand : "";
    const cross = stmt?.meta?.evidenceJudgement?.crossStatementNumericFragility;
    const flag = cross != null && typeof cross === "object" && typeof cross.fragilityFlag === "string" ? cross.fragilityFlag : "none";

    if (qualityBand === "strong" && (flag === "none" || !flag)) return 90;
    if (qualityBand === "mixed" || flag === "inconsistent_vs_doc") return 70;
    if (qualityBand === "approx_heavy" || flag === "approx_outlier") return 42;
    if (qualityBand) return 70;
    return 70;
  } catch (_) {
    return null;
  }
}

/**
 * Document evidence quality 0–100 from density, reuse, spread, numericConsistency.
 * strong numeric + broad spread + low reuse → 85–95; mixed/moderate → 60–80; approx heavy / high reuse / concentrated → 30–55.
 * @param {Object} doc
 * @returns {number | null}
 */
function documentEvidenceQualityScore(doc) {
  try {
    const ej = doc?.meta?.evidenceJudgement;
    if (ej == null || typeof ej !== "object") return null;

    const density = ej.density != null && typeof ej.density === "object" ? ej.density : {};
    const reuse = ej.reuse != null && typeof ej.reuse === "object" ? ej.reuse : {};
    const spread = ej.spread != null && typeof ej.spread === "object" ? ej.spread : {};
    const numericConsistency = ej.numericConsistency != null && typeof ej.numericConsistency === "object" ? ej.numericConsistency : {};

    const densityBand = typeof density.densityBand === "string" ? density.densityBand : "";
    const reusePressureBand = typeof reuse.reusePressureBand === "string" ? reuse.reusePressureBand : "";
    const spreadBand = typeof spread.spreadBand === "string" ? spread.spreadBand : "";
    const consistencyBand = typeof numericConsistency.consistencyBand === "string" ? numericConsistency.consistencyBand : "";

    const strongNumeric = consistencyBand === "uniform_strong";
    const broadSpread = spreadBand === "broad";
    const lowReuse = reusePressureBand === "low";
    if (strongNumeric && broadSpread && lowReuse) return 90;

    const mixedNumeric = consistencyBand === "mixed_quality";
    const moderateSpread = spreadBand === "moderate";
    const moderateReuse = reusePressureBand === "moderate";
    if (mixedNumeric || moderateSpread || moderateReuse) return 70;

    const approxDominant = consistencyBand === "approx_dominant";
    const highReuse = reusePressureBand === "high";
    const concentrated = densityBand === "evidence_concentrated";
    if (approxDominant || highReuse || concentrated) return 42;

    return 70;
  } catch (_) {
    return null;
  }
}

/**
 * Confidence score 0–100 from judgement.confidence. If missing → do not emit.
 * @param {string} confidence
 * @returns {number | null}
 */
function confidenceScore(confidence) {
  if (typeof confidence !== "string" || !confidence) return null;
  const s = CONFIDENCE_SCORE.get(confidence);
  return s !== undefined ? s : null;
}

/**
 * Build stmt.meta.scoringBridge. Only set when judgement exists; never override reliabilityScore or other score fields.
 * @param {Object[]} statements
 * @param {Object} doc
 */
function buildScoringBridgeP4(statements, doc) {
  try {
    if (Array.isArray(statements)) {
      for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i];
        if (stmt == null || typeof stmt !== "object") continue;
        const judgement = stmt.meta?.judgement;
        if (judgement == null || typeof judgement !== "object") continue;
        const posture = judgement.fragilityPosture;
        if (typeof posture !== "string") continue;

        const drivers = Array.isArray(stmt.meta?.evidenceJudgement?.fragilityDrivers)
          ? stmt.meta.evidenceJudgement.fragilityDrivers
          : [];
        const fragScore = fragilitySeverityScore(posture, drivers);
        const evQuality = statementEvidenceQualityScore(stmt);
        const conf = confidenceScore(judgement.confidence);

        if (!stmt.meta) stmt.meta = {};
        stmt.meta.scoringBridge = {
          fragilitySeverityScore: fragScore,
          evidenceQualityScore: evQuality != null ? clamp(evQuality) : 70,
          confidenceScore: conf != null ? conf : 65,
        };
      }
    }

    if (doc != null && typeof doc === "object") {
      const judgement = doc.meta?.judgement;
      if (judgement != null && typeof judgement === "object") {
        const posture = judgement.fragilityPosture;
        if (typeof posture === "string") {
          const drivers = Array.isArray(doc.meta?.evidenceJudgement?.fragilityDrivers)
            ? doc.meta.evidenceJudgement.fragilityDrivers
            : [];
          const fragScore = fragilitySeverityScore(posture, drivers);
          const evQuality = documentEvidenceQualityScore(doc);
          const conf = confidenceScore(judgement.confidence);

          if (!doc.meta) doc.meta = {};
          doc.meta.scoringBridge = {
            fragilitySeverityScore: fragScore,
            evidenceQualityScore: evQuality != null ? clamp(evQuality) : 70,
            confidenceScore: conf != null ? conf : 65,
          };
        }
      }
    }
  } catch (_) {
    // Never throw
  }
}

module.exports = { buildScoringBridgeP4 };
