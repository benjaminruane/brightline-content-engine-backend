// lib/qc/evidence-relevance.mjs
// A6.2b: Evidence relevance gate — only display-eligible candidates may become visible support.

import { corePropositionConfirmed } from "./evidence-relationship.mjs";

/**
 * Evaluate whether a candidate support binding is relevant and display-eligible.
 * A candidate may be emitted as visible support only if isRelevant && displayEligible.
 *
 * @param {Object} params
 * @param {string} [params.statementText] - Statement/claim text
 * @param {Array} [params.canonicalClaims] - Canonical claims (type, value, citations)
 * @param {Object} [params.candidateRef] - Reference object (id, title)
 * @param {string} [params.candidateExcerpt] - Excerpt text
 * @param {string} [params.matchType] - exact | rounded_equivalent | unit_equivalent | paraphrase | partial_support | none
 * @param {Object} [params.supportBinding] - Full binding (role, normalizedValue, excerpt, refId)
 * @param {string} [params.statementRole] - Resolved statement role
 * @param {string} [params.evidenceRole] - Resolved evidence role
 * @returns {{ isRelevant: boolean, relevanceBand: string, reasonCode: string, displayEligible: boolean, explanation: string }}
 */
export function evaluateSupportRelevance({
  statementText = "",
  canonicalClaims = [],
  candidateRef,
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

  const roleCompatible = stmtRole === evRole || isRoleFamilyCompatible(stmtRole, evRole);
  const hasNumericTuple =
    mt === "exact" ||
    mt === "rounded_equivalent" ||
    mt === "unit_equivalent" ||
    (supportBinding && typeof supportBinding.normalizedValue === "number");
  const hasExcerpt = excerpt.length > 0 && excerpt !== "(excerpt not captured)";

  if (!roleCompatible) {
    return {
      isRelevant: false,
      relevanceBand: "none",
      reasonCode: "role_mismatch",
      displayEligible: false,
      explanation: "Evidence role does not match statement role",
    };
  }

  if (hasNumericTuple && roleCompatible && hasExcerpt) {
    return {
      isRelevant: true,
      relevanceBand: "strong",
      reasonCode: "numeric_tuple",
      displayEligible: true,
      explanation: "Numeric tuple match, role compatible",
    };
  }

  if (mt === "exact" && roleCompatible) {
    return {
      isRelevant: true,
      relevanceBand: "strong",
      reasonCode: "exact_anchor",
      displayEligible: true,
      explanation: "Exact or near-exact claim anchor support",
    };
  }

  if (mt === "paraphrase" && roleCompatible) {
    return {
      isRelevant: true,
      relevanceBand: "acceptable",
      reasonCode: "typed_paraphrase",
      displayEligible: true,
      explanation: "Typed paraphrase support, role compatible",
    };
  }

  if (mt === "partial_support" && roleCompatible) {
    const { corePropositionConfirmed: coreConfirmed } = corePropositionConfirmed(statementText, excerpt);
    if (coreConfirmed) {
      return {
        isRelevant: true,
        relevanceBand: "acceptable",
        reasonCode: "core_proposition_confirmed",
        displayEligible: true,
        explanation: "Core proposition (entity + relation) confirmed; partial support eligible for display",
      };
    }
    return {
      isRelevant: true,
      relevanceBand: "weak",
      reasonCode: "weak_semantic_only",
      displayEligible: false,
      explanation: "Partial support only; not specific enough for display",
    };
  }

  const isQualitativeStatement = isQualitative(stmtRole, canonicalClaims);
  if (isQualitativeStatement && !hasNumericTuple && mt !== "exact") {
    const riskLanguage = /risk\s+factor|risks?|uncertainty|limitation|caution|may\s+not|could\s+adversely/i.test(excerpt);
    const strengthClaim = /strongest|leading|best|top\s+ecosystem|leadership/i.test((statementText || "").toLowerCase());
    if (riskLanguage && strengthClaim) {
      return {
        isRelevant: false,
        relevanceBand: "none",
        reasonCode: "risk_opposition_supporting_strength",
        displayEligible: false,
        explanation: "Risk/opposition excerpt used to support strength/leadership claim",
      };
    }
    return {
      isRelevant: true,
      relevanceBand: "weak",
      reasonCode: "topical_only",
      displayEligible: false,
      explanation: "Qualitative statement requires direct supportive language or aligned paraphrase",
    };
  }

  if (mt === "none" || !hasExcerpt) {
    return {
      isRelevant: false,
      relevanceBand: "none",
      reasonCode: "no_claim_overlap",
      displayEligible: false,
      explanation: "No claim overlap or no excerpt",
    };
  }

  return {
    isRelevant: true,
    relevanceBand: "acceptable",
    reasonCode: "typed_paraphrase",
    displayEligible: roleCompatible,
    explanation: "Default acceptable; role compatible",
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

function isQualitative(statementRole, canonicalClaims) {
  const numericRoles = [
    "valuation",
    "valuation_pre_money",
    "valuation_post_money",
    "investment_amount",
    "valuation_enterprise_value",
    "valuation_equity_value",
  ];
  const roleNorm = (statementRole || "").toLowerCase();
  if (numericRoles.some((r) => roleNorm.includes(r))) return false;
  if (Array.isArray(canonicalClaims) && canonicalClaims.some((cc) => cc && typeof cc.value === "number")) return false;
  return true;
}
