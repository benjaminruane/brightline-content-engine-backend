// lib/build-judgement-aggregation-p4.cjs
// P4.W1 + P4.W2 + P4.W3: Judgement Aggregation, Weighted Scoring, Stability Smoothing, Narrative Synthesis (Meta Only).
// Deterministic, sync, no model calls. Adds stmt.meta.judgement and doc.meta.judgement only.
// Does not change canonicalClaims, reliabilityScore, evidence binding, unsupported_statement_gate,
// or any Phase 3 signal calculations (fragilityDrivers, density, reuse, spread, etc.).

/** Severity priority order for primary drivers (highest first). */
const SEVERITY_ORDER = [
  "single_source_over_reliance",
  "claim_evidence_imbalance",
  "approximation_reliance",
  "numeric_inconsistent_vs_document",
  "narrow_support_base",
  "evidence_reuse_pressure",
];

/** P4.W2: Driver severity weights — CRITICAL 3, HIGH 2, MEDIUM 1. */
const DRIVER_WEIGHTS = new Map([
  ["single_source_over_reliance", 3],
  ["claim_evidence_imbalance", 3],
  ["approximation_reliance", 2],
  ["numeric_inconsistent_vs_document", 2],
  ["narrow_support_base", 2],
  ["evidence_reuse_pressure", 1],
]);

const MAX_STATEMENT_DRIVERS = 3;
const MAX_DOCUMENT_DRIVERS = 4;

/** P4.W2: Weighted posture thresholds — 0 robust, 1–2 supported_with_caveats, ≥3 fragile (satisfies 1 critical → fragile). */
function postureFromWeightedScore(weightedScore) {
  if (weightedScore === 0) return "robust";
  if (weightedScore <= 2) return "supported_with_caveats";
  return "fragile";
}

/** P4.W2: Score is within ±1 of a posture boundary (0/1 or 2/3). */
function isNearBoundary(weightedScore) {
  return weightedScore === 0 || weightedScore === 1 || weightedScore === 2 || weightedScore === 3;
}

/** P4.W3: Statement driver → narrative add-on sentence. Only drivers with defined copy are used. */
const STATEMENT_DRIVER_NARRATIVES = new Map([
  ["single_source_over_reliance", "Most evidence comes from a single source."],
  ["claim_evidence_imbalance", "There are more claims than supporting evidence."],
  ["approximation_reliance", "Numeric support relies on approximate values."],
  ["narrow_support_base", "Support comes from a narrow set of sources."],
  ["numeric_inconsistent_vs_document", "Numeric evidence is weaker than elsewhere in the document."],
]);

/** P4.W3: Statement base narrative by posture. */
const STATEMENT_BASE_NARRATIVES = new Map([
  ["robust", "Evidence appears strong and well supported across sources."],
  ["supported_with_caveats", "Evidence supports this statement, but there are some limitations in source coverage or strength."],
  ["fragile", "Evidence supporting this statement is limited or concentrated, increasing risk if assumptions change."],
]);

/** P4.W3: Document base narrative by posture. */
const DOCUMENT_BASE_NARRATIVES = new Map([
  ["robust", "Overall evidence across the document is strong and well distributed."],
  ["supported_with_caveats", "Overall evidence is reasonable but shows some concentration or coverage limitations."],
  ["fragile", "Overall evidence is concentrated or limited, increasing document-level fragility."],
]);

/** P4.W3: Dominant pattern phrase → add-on sentence. Matched by substring in dominantRiskPattern. */
function documentDominantPatternNarrative(dominantRiskPattern) {
  if (typeof dominantRiskPattern !== "string" || !dominantRiskPattern.trim()) return "";
  const p = dominantRiskPattern.toLowerCase();
  if (p.includes("concentrated")) return "Evidence is heavily concentrated in a small number of sources.";
  if (p.includes("claims exceed")) return "The number of claims exceeds the breadth of supporting evidence.";
  if (p.includes("approximate")) return "Numeric support is heavily reliant on approximate values.";
  return "";
}

/**
 * P4.W3: Build statement narrative (base + up to 2 driver add-ons, max 2–3 sentences). If drivers missing → base only.
 * @param {string} posture
 * @param {string[]} primaryDrivers
 * @returns {string}
 */
function statementNarrative(posture, primaryDrivers) {
  const base = STATEMENT_BASE_NARRATIVES.get(posture) || "";
  if (!base) return "";
  const parts = [base];
  if (Array.isArray(primaryDrivers) && primaryDrivers.length > 0) {
    const maxAddOns = 2;
    for (let i = 0; i < primaryDrivers.length && parts.length <= maxAddOns; i++) {
      const sentence = STATEMENT_DRIVER_NARRATIVES.get(primaryDrivers[i]);
      if (sentence && !parts.includes(sentence)) parts.push(sentence);
    }
  }
  return parts.join(" ").trim() || base;
}

/**
 * P4.W3: Build document narrative (base + at most one dominant-pattern add-on, max 2–3 sentences).
 * @param {string} posture
 * @param {string} dominantRiskPattern
 * @returns {string}
 */
function documentNarrative(posture, dominantRiskPattern) {
  const base = DOCUMENT_BASE_NARRATIVES.get(posture) || "";
  if (!base) return "";
  const addOn = documentDominantPatternNarrative(dominantRiskPattern);
  if (addOn) return `${base} ${addOn}`.trim();
  return base;
}

/**
 * P4.W2: Compute weighted score = sum(driverWeight). Unknown drivers count as 0.
 * @param {string[]} drivers
 * @returns {number}
 */
function weightedScoreFromDrivers(drivers) {
  if (!Array.isArray(drivers) || drivers.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < drivers.length; i++) {
    const t = typeof drivers[i] === "string" ? drivers[i].trim() : "";
    if (t) sum += DRIVER_WEIGHTS.get(t) || 0;
  }
  return sum;
}

/**
 * Sort drivers by severity priority; take first N. Unknown drivers appear after ordered ones.
 * @param {string[]} drivers
 * @param {number} max
 * @returns {string[]}
 */
function primaryDriversBySeverity(drivers, max) {
  if (!Array.isArray(drivers) || drivers.length === 0) return [];
  const orderMap = new Map(SEVERITY_ORDER.map((t, i) => [t, i]));
  const ordered = [];
  const rest = [];
  for (let i = 0; i < drivers.length; i++) {
    const t = typeof drivers[i] === "string" ? drivers[i].trim() : "";
    if (!t) continue;
    const idx = orderMap.get(t);
    if (idx !== undefined) ordered.push({ t, idx });
    else rest.push(t);
  }
  ordered.sort((a, b) => a.idx - b.idx);
  const out = ordered.map((x) => x.t);
  for (let i = 0; i < rest.length && out.length < max; i++) {
    if (!out.includes(rest[i])) out.push(rest[i]);
  }
  return out.slice(0, max);
}

/**
 * P4.W2: Statement confidence from drivers and signals. No drivers → high.
 * Low = high reuse / evidence concentrated / approx dominant (statement-level proxies: critical/high drivers).
 * @param {Object} stmt
 * @param {string[]} drivers
 * @param {number} weightedScore
 * @returns {"high"|"medium"|"low"}
 */
function statementConfidence(stmt, drivers, weightedScore) {
  if (!drivers.length) return "high";
  const neq = stmt.meta?.evidenceJudgementInputs?.numericEvidenceQuality;
  const qualityBand = neq != null && typeof neq === "object" && typeof neq.qualityBand === "string" ? neq.qualityBand : "";
  const cross = stmt.meta?.evidenceJudgement?.crossStatementNumericFragility;
  const fragilityFlag = cross != null && typeof cross === "object" && typeof cross.fragilityFlag === "string" ? cross.fragilityFlag : "";
  const hasApproxOrInconsistent = qualityBand === "approx_heavy" || fragilityFlag === "inconsistent_vs_doc" || fragilityFlag === "approx_outlier";
  const hasCritical = drivers.some((d) => DRIVER_WEIGHTS.get(d) === 3);
  if (weightedScore >= 3 || hasCritical || hasApproxOrInconsistent) return "low";
  if (weightedScore >= 1) return "medium";
  return "high";
}

/**
 * Compute statement judgement: fragilityPosture (weighted + optional smoothing), primaryDrivers, confidence.
 * @param {Object} stmt - Statement with stmt.meta.evidenceJudgement.fragilityDrivers
 * @param {string|undefined} previousPosture - Optional previous stmt.meta.judgement.fragilityPosture
 * @returns {{ fragilityPosture: string, primaryDrivers: string[], confidence: "high"|"medium"|"low" } | null}
 */
function statementJudgement(stmt, previousPosture) {
  try {
    if (stmt == null || typeof stmt !== "object") return null;
    const ej = stmt.meta?.evidenceJudgement;
    if (ej == null || typeof ej !== "object") return null;

    const drivers = Array.isArray(ej.fragilityDrivers) ? ej.fragilityDrivers : [];
    const weightedScore = weightedScoreFromDrivers(drivers);
    let fragilityPosture = postureFromWeightedScore(weightedScore);

    if (previousPosture != null && typeof previousPosture === "string" && fragilityPosture !== previousPosture && isNearBoundary(weightedScore)) {
      fragilityPosture = previousPosture;
    }

    const primaryDrivers = primaryDriversBySeverity(drivers, MAX_STATEMENT_DRIVERS);
    const confidence = statementConfidence(stmt, drivers, weightedScore);
    const narrative = statementNarrative(fragilityPosture, primaryDrivers);
    return { fragilityPosture, primaryDrivers, confidence, narrative };
  } catch (_) {
    return null;
  }
}

/**
 * P4.W2: Document confidence. No drivers → high. Low = high reuse / evidence concentrated / approx dominant. High = strong numeric + broad spread + low reuse.
 * @param {Object} ej - doc.meta.evidenceJudgement
 * @param {string[]} drivers
 * @param {number} weightedScore
 * @returns {"high"|"medium"|"low"}
 */
function documentConfidence(ej, drivers, weightedScore) {
  if (!drivers.length) return "high";
  const reuse = ej.reuse != null && typeof ej.reuse === "object" ? ej.reuse : {};
  const density = ej.density != null && typeof ej.density === "object" ? ej.density : {};
  const spread = ej.spread != null && typeof ej.spread === "object" ? ej.spread : {};
  const numericConsistency = ej.numericConsistency != null && typeof ej.numericConsistency === "object" ? ej.numericConsistency : {};
  const numericApproxSpread = ej.numericApproxSpread != null && typeof ej.numericApproxSpread === "object" ? ej.numericApproxSpread : {};
  const reusePressureBand = typeof reuse.reusePressureBand === "string" ? reuse.reusePressureBand : "";
  const densityBand = typeof density.densityBand === "string" ? density.densityBand : "";
  const spreadBand = typeof spread.spreadBand === "string" ? spread.spreadBand : "";
  const consistencyBand = typeof numericConsistency.consistencyBand === "string" ? numericConsistency.consistencyBand : "";
  const hasApproxDominance = numericApproxSpread.hasApproxDominance === true;

  const highReuse = reusePressureBand === "high";
  const evidenceConcentrated = densityBand === "evidence_concentrated";
  const approxDominant = consistencyBand === "approx_dominant" || hasApproxDominance;
  if (highReuse || evidenceConcentrated || approxDominant) return "low";

  const strongNumeric = consistencyBand === "uniform_strong";
  const broadSpread = spreadBand === "broad";
  const lowReuse = reusePressureBand === "low";
  if (strongNumeric && broadSpread && lowReuse) return "high";

  return "medium";
}

/**
 * Compute document judgement: fragilityPosture (weighted + optional smoothing), dominantRiskPattern, primaryDrivers, confidence.
 * @param {Object} doc - Document with doc.meta.evidenceJudgement (density, reuse, fragilityDrivers, numericConsistency, numericApproxSpread)
 * @param {string|undefined} previousPosture - Optional previous doc.meta.judgement.fragilityPosture
 * @returns {{ fragilityPosture: string, dominantRiskPattern: string, primaryDrivers: string[], confidence: "high"|"medium"|"low" } | null}
 */
function documentJudgement(doc, previousPosture) {
  try {
    if (doc == null || typeof doc !== "object") return null;
    const ej = doc.meta?.evidenceJudgement;
    if (ej == null || typeof ej !== "object") return null;

    const drivers = Array.isArray(ej.fragilityDrivers) ? ej.fragilityDrivers : [];
    const weightedScore = weightedScoreFromDrivers(drivers);
    let fragilityPosture = postureFromWeightedScore(weightedScore);

    if (previousPosture != null && typeof previousPosture === "string" && fragilityPosture !== previousPosture && isNearBoundary(weightedScore)) {
      fragilityPosture = previousPosture;
    }

    const reuse = ej.reuse != null && typeof ej.reuse === "object" ? ej.reuse : {};
    const density = ej.density != null && typeof ej.density === "object" ? ej.density : {};
    const reusePressureBand = typeof reuse.reusePressureBand === "string" ? reuse.reusePressureBand : "";
    const densityBand = typeof density.densityBand === "string" ? density.densityBand : "";

    let dominantRiskPattern = "";
    if (reusePressureBand === "high") dominantRiskPattern = "evidence concentrated in few sources";
    else if (densityBand === "evidence_concentrated") dominantRiskPattern = "claims exceed supporting evidence";
    else {
      const numericConsistency = ej.numericConsistency != null && typeof ej.numericConsistency === "object" ? ej.numericConsistency : {};
      const numericApproxSpread = ej.numericApproxSpread != null && typeof ej.numericApproxSpread === "object" ? ej.numericApproxSpread : {};
      const approxDominant = numericConsistency.consistencyBand === "approx_dominant" || numericApproxSpread.hasApproxDominance === true;
      if (approxDominant) dominantRiskPattern = "heavy reliance on approximate numeric evidence";
    }

    const primaryDrivers = primaryDriversBySeverity(drivers, MAX_DOCUMENT_DRIVERS);
    const confidence = documentConfidence(ej, drivers, weightedScore);
    const narrative = documentNarrative(fragilityPosture, dominantRiskPattern);
    return { fragilityPosture, dominantRiskPattern, primaryDrivers, confidence, narrative };
  } catch (_) {
    return null;
  }
}

/**
 * Attach stmt.meta.judgement and doc.meta.judgement. Never removes existing meta; never throws.
 * If signals are missing, skips aggregation for that statement or document.
 * P4.W2: Uses weighted score for posture; optional previousResult for stability smoothing; adds confidence.
 * @param {Object[]} statements - Full statements array
 * @param {Object} doc - Document/response object with .meta
 * @param {{ previousResult?: { statements?: Array<{ meta?: { judgement?: { fragilityPosture?: string } } }>, meta?: { judgement?: { fragilityPosture?: string } } } }} [options] - Optional previous analysis result for stability smoothing
 */
function buildJudgementAggregationP4(statements, doc, options) {
  try {
    const previousStatements = options?.previousResult?.statements;
    const previousDocMeta = options?.previousResult?.meta?.judgement;

    if (Array.isArray(statements)) {
      for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i];
        if (stmt == null || typeof stmt !== "object") continue;
        const prevStmt = Array.isArray(previousStatements) && previousStatements[i] != null ? previousStatements[i] : null;
        const previousPosture = prevStmt?.meta?.judgement?.fragilityPosture;
        const judgement = statementJudgement(stmt, previousPosture);
        if (judgement == null) continue;
        if (!stmt.meta) stmt.meta = {};
        stmt.meta.judgement = judgement;
      }
    }

    if (doc != null && typeof doc === "object") {
      const previousPosture = previousDocMeta?.fragilityPosture;
      const judgement = documentJudgement(doc, previousPosture);
      if (judgement != null) {
        if (!doc.meta) doc.meta = {};
        doc.meta.judgement = judgement;
      }
    }
  } catch (_) {
    // Never throw
  }
}

module.exports = { buildJudgementAggregationP4 };
