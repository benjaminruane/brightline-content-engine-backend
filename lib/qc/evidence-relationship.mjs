// lib/qc/evidence-relationship.mjs
// A6.2c: Evidence relationship classification — support | context | counter | none. Only support may be visible.

const POSITIVE_STRENGTH_CUES = [
  "strong", "strongest", "leading", "leadership", "advantage", "differentiated",
  "resilient", "high quality", "attractive", "defensible", "superior", "superiority",
  "moat", "defensibility", "ecosystem strength", "confidence", "high confidence",
];
const RISK_COUNTER_CUES = [
  "risk", "risks", "failure", "churn", "pressure", "commoditization", "threat",
  "competition", "competitive bundling", "increasing costs", "macro-driven weakness",
  "constraint", "constraints", "uncertainty", "limitation", "vulnerability",
  "headwind", "headwinds", "adversely", "could adversely", "may not",
];

/**
 * Classify evidence relationship: support (visible), context (related only), counter (opposing), or none.
 * Only support may be shown as visible evidence.
 *
 * @param {Object} params
 * @param {string} [params.statementText] - Statement/claim text
 * @param {Array} [params.canonicalClaims] - Canonical claims
 * @param {string} [params.candidateExcerpt] - Excerpt text
 * @param {string} [params.matchType] - exact | rounded_equivalent | unit_equivalent | paraphrase | partial_support | none
 * @param {Object} [params.supportBinding] - Full binding (role, excerpt, refId)
 * @param {string} [params.statementRole] - Statement role
 * @param {string} [params.evidenceRole] - Evidence role
 * @returns {{ relationship: string, confidenceBand: string, reasonCode: string, explanation: string }}
 */
export function classifyEvidenceRelationship({
  statementText = "",
  canonicalClaims = [],
  candidateExcerpt = "",
  matchType = "none",
  supportBinding = {},
  statementRole = "unknown",
  evidenceRole = "unknown",
} = {}) {
  const excerpt = (candidateExcerpt || supportBinding?.excerpt || "").trim();
  const mt = (matchType || supportBinding?.matchType || "none").toLowerCase();
  const stmtRole = (statementRole || "unknown").toLowerCase();
  const evRole = (evidenceRole || supportBinding?.role || "unknown").toLowerCase();

  if (!excerpt || excerpt === "(excerpt not captured)") {
    return {
      relationship: "none",
      confidenceBand: "high",
      reasonCode: "no_claim_overlap",
      explanation: "No usable excerpt",
    };
  }

  const roleCompatible = stmtRole === evRole || isRoleFamilyCompatible(stmtRole, evRole);
  const hasNumericTuple =
    mt === "exact" ||
    mt === "rounded_equivalent" ||
    mt === "unit_equivalent" ||
    (supportBinding && typeof supportBinding.normalizedValue === "number");
  const excerptLower = excerpt.toLowerCase();
  const statementLower = (statementText || "").toLowerCase();

  const hasPositiveStrengthClaim = POSITIVE_STRENGTH_CUES.some((c) => statementLower.includes(c));
  const hasRiskCounterExcerpt = RISK_COUNTER_CUES.some((c) => excerptLower.includes(c));

  if (hasPositiveStrengthClaim && hasRiskCounterExcerpt) {
    return {
      relationship: "counter",
      confidenceBand: "high",
      reasonCode: "risk_vs_strength",
      explanation: "Strength/leadership claim matched to risk or constraint language",
    };
  }

  if (!roleCompatible) {
    return {
      relationship: "none",
      confidenceBand: "high",
      reasonCode: "role_mismatch",
      explanation: "Evidence role does not match statement role",
    };
  }

  if (hasNumericTuple && roleCompatible) {
    const hasNumericContext = /\d|%|\$|million|billion|valuation|pre-money|post-money|investment/i.test(excerpt);
    return {
      relationship: "support",
      confidenceBand: hasNumericContext ? "high" : "medium",
      reasonCode: "numeric_tuple",
      explanation: "Numeric value and role align; excerpt contains relevant numeric context",
    };
  }

  if (mt === "exact" && roleCompatible) {
    return {
      relationship: "support",
      confidenceBand: "high",
      reasonCode: "exact_anchor",
      explanation: "Exact or near-exact anchor overlap, no role conflict",
    };
  }

  if (mt === "paraphrase" && roleCompatible) {
    return {
      relationship: "support",
      confidenceBand: "medium",
      reasonCode: "typed_paraphrase",
      explanation: "Clear semantic alignment to claim type, no directional contradiction",
    };
  }

  if (mt === "partial_support") {
    return {
      relationship: "context",
      confidenceBand: "medium",
      reasonCode: "topical_related",
      explanation: "Topically related but does not directly justify the claim",
    };
  }

  const hasCounterInExcerpt = RISK_COUNTER_CUES.some((c) => excerptLower.includes(c));
  if (hasPositiveStrengthClaim && hasCounterInExcerpt) {
    return {
      relationship: "counter",
      confidenceBand: "medium",
      reasonCode: "polarity_counter",
      explanation: "Excerpt emphasises risks or constraints vs strength claim",
    };
  }

  if (excerpt.length > 20) {
    return {
      relationship: "context",
      confidenceBand: "low",
      reasonCode: "topical_related",
      explanation: "General or adjacent discussion without direct support",
    };
  }

  return {
    relationship: "none",
    confidenceBand: "high",
    reasonCode: "no_claim_overlap",
    explanation: "No meaningful claim overlap",
  };
}

function isRoleFamilyCompatible(stmtRole, evRole) {
  if (stmtRole === "unknown" || evRole === "unknown") return false;
  const valuation = ["valuation", "valuation_pre_money", "valuation_post_money", "valuation_enterprise_value", "valuation_equity_value"];
  const stmtV = valuation.some((r) => stmtRole.includes(r));
  const evV = valuation.some((r) => evRole.includes(r));
  if (stmtV && evV) return true;
  const investment = ["investment_amount", "investment"];
  const stmtI = investment.some((r) => stmtRole.includes(r));
  const evI = investment.some((r) => evRole.includes(r));
  if (stmtI && evI) return true;
  return false;
}
