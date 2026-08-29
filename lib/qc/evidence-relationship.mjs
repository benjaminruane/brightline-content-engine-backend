// lib/qc/evidence-relationship.mjs
import { isAuthoringOrganisationName } from "./first-person-actor.mjs";

// A6.2c: Evidence relationship classification — support | partial | context | counter | none. Support and partial may be visible when displayEligible.

// A6.31: Factual relation phrases for core-proposition check (entity + relation/action). Generic, no ad-hoc rules.
// A6.45: Longer / more specific phrases before shorter tokens where substring collisions matter.
const FACTUAL_RELATION_PHRASES = [
  "founded in", "based in", "headquartered in", "roll out", "rolled out",
  "headquarters", "headquartered", "launched", "introduced", "released", "announced",
  "established", "acquired", "investment", "financing", "funded", "invested", "financed",
  "enables", "enable", "enabled",
  "provides", "provide", "provided",
  "supports", "support", "supported",
  "offers", "offer", "offered",
  "allows", "allow", "allowed",
  "serves", "serve", "served",
  "sells", "sell",
  "targets", "target", "targeted",
  "generates", "generate",
  "is", "are", "was", "were",
  "has", "have", "had",
  "founded", "based", "located", "merged",
  "launch", "announce", "acquire", "establish", "locate", "merge",
  "raised", "release", "introduce",
  "raise", "fund", "invest", "finance",
];

/**
 * A6.45: Deterministic claim-type inference (same order as qc-v2-pipeline detectClaimType) to avoid circular imports.
 */
export function inferClaimTypeForRelation(claimText) {
  const t = (claimText || "").toLowerCase();
  if (/\$[\d,.]+\s*(?:million|billion|mm|m|bn|b|k)?|\d+(?:\.\d+)?\s*%\s*(?:stake|ownership)|series\s+[a-d]|funding\s+round|raised\s+\$|valuation|pre-money|post-money/i.test(t)) {
    return "numeric_finance";
  }
  if (/\blaunch(?:ed)?\b|\brelease(?:d)?\b|\bintroduce(?:d)?\b|\bannounce(?:d)?\b|\broll(?:ed)?\s+out\b/i.test(t)) {
    return "launch_or_product";
  }
  if (/\bfounded\b|\bbased\s+in\b|\bheadquartered\b|\bacquired\b|\bmerged\b|\bestablished\b/i.test(t)) {
    return "qualitative_corporate_fact";
  }
  if (/\bmarket\s+demand\b|\bindustry\s+commentary\b|\bshift(?:ing)?\s+toward\b|\bdemand\s+is\s+shift|integrated\s+payments\s+platform/i.test(t)) {
    return "market_or_industry_trend";
  }
  if (/\bexpects?\b|\banticipates?\b|\bforecast\b|\bguidance\b|\bwill\s+materially\b|\bthis\s+year\b/i.test(t)) {
    return "expectation_or_projection";
  }
  if (/\bis\b|\bare\b|\bwas\b|\bwere\b|\bhas\b|\bhave\b|\benables?\b|\bprovides?\b|\bsupports?\b|\boffers?\b/i.test(t)) {
    return "descriptive_fact";
  }
  return "other_fact";
}

/** A6.45: Phrase → canonical family label per claim-type bucket. */
const RELATION_FAMILY_LAUNCH = Object.freeze({
  launch: "launch",
  launched: "launch",
  introduce: "launch",
  introduced: "launch",
  release: "launch",
  released: "launch",
  announce: "launch",
  announced: "launch",
  "roll out": "launch",
  "rolled out": "launch",
});

const RELATION_FAMILY_CORPORATE = Object.freeze({
  "founded in": "found",
  founded: "found",
  "based in": "based",
  based: "based",
  "headquartered in": "headquartered",
  headquartered: "headquartered",
  headquarters: "headquartered",
  establish: "establish",
  established: "establish",
  locate: "locate",
  located: "locate",
  acquire: "acquire",
  acquired: "acquire",
  merge: "merge",
  merged: "merge",
});

const RELATION_FAMILY_FINANCE = Object.freeze({
  "raised": "raise",
  "raise": "raise",
  "funding": "fund",
  "fund": "fund",
  "funded": "fund",
  "investment": "invest",
  "invest": "invest",
  "invested": "invest",
  "financing": "finance",
  "finance": "finance",
  "financed": "finance",
});

const DESCRIPTIVE_ONLY_RELATION_PHRASES = new Set([
  "enables", "enable", "enabled",
  "provides", "provide", "provided",
  "supports", "support", "supported",
  "offers", "offer", "offered",
  "allows", "allow", "allowed",
  "serves", "serve", "served",
  "sells", "sell",
  "targets", "target", "targeted",
  "generates", "generate",
  "is", "are", "was", "were",
  "has", "have", "had",
]);

const RELATION_FAMILY_DESCRIPTIVE = Object.freeze({
  enable: "enable",
  enables: "enable",
  enabled: "enable",
  provide: "provide",
  provides: "provide",
  provided: "provide",
  support: "support",
  supports: "support",
  supported: "support",
  offer: "offer",
  offers: "offer",
  offered: "offer",
  is: "state_of_being",
  are: "state_of_being",
  was: "state_of_being",
  were: "state_of_being",
  has: "state_of_being",
  have: "state_of_being",
  had: "state_of_being",
});

function getFamilyMapForClaimType(claimType) {
  if (claimType === "launch_or_product") return RELATION_FAMILY_LAUNCH;
  if (claimType === "qualitative_corporate_fact") return RELATION_FAMILY_CORPORATE;
  if (claimType === "numeric_finance") return RELATION_FAMILY_FINANCE;
  if (claimType === "descriptive_fact") return RELATION_FAMILY_DESCRIPTIVE;
  return null;
}

/**
 * A6.45: Map detected relation phrases to canonical family labels (unique).
 */
function normalizeRelationPhraseFamilies(phrases, claimType) {
  const map = getFamilyMapForClaimType(claimType);
  if (!map || !Array.isArray(phrases)) return [];
  const out = [];
  for (const p of phrases) {
    const key = (p || "").toLowerCase();
    const fam = map[key];
    if (fam && !out.includes(fam)) out.push(fam);
  }
  return out;
}

/**
 * A6.31 / A6.45: Core proposition confirmed when entity + relation/action appear in both statement and excerpt.
 * A6.45: Relation overlap uses family equivalence when claimType is launch_or_product, qualitative_corporate_fact, or numeric_finance; else legacy substring overlap only.
 * Partial is only when core is confirmed and at least one meaningful modifier is missing (we infer from overlap).
 * @param {string} statementText
 * @param {string} excerpt
 * @param {{ claimType?: string, claimId?: string|null }} [options]
 * @returns {{ corePropositionConfirmed: boolean, missingModifierComponents: string[] }}
 */
const ANCHOR_ENTITY_RE = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g;

/**
 * The entity a source has to mention before the proposition can be confirmed.
 *
 * This took the FIRST Title-Case run in the statement, which for a client
 * writing about its own investments is the client's own name — and no external
 * source ever mentions the client. "Halden Group invested in Meridian Capital
 * Partners V, which was established in 2026" could not be confirmed against a
 * source that says exactly that about Meridian, while the same sentence without
 * the leading name could. That is a false negative on support, so the author is
 * skipped and the next name is used.
 *
 * Where the author is the ONLY name, the previous behaviour stands: there is no
 * external anchor, and the proposition is not confirmed.
 */
function corroborationAnchor(stmt) {
  for (const m of String(stmt ?? "").match(ANCHOR_ENTITY_RE) ?? []) {
    if (isAuthoringOrganisationName(m)) continue;
    return m.toLowerCase();
  }
  return null;
}

export function corePropositionConfirmed(statementText, excerpt, options = {}) {
  const stmt = (statementText || "").trim();
  const ex = (excerpt || "").trim();
  if (!stmt || !ex || ex === "(excerpt not captured)") {
    return { corePropositionConfirmed: false, missingModifierComponents: [] };
  }
  const stmtLower = stmt.toLowerCase();
  const exLower = ex.toLowerCase();
  const claimType = options.claimType != null ? options.claimType : inferClaimTypeForRelation(stmt);
  const entity = corroborationAnchor(stmt);
  if (!entity || entity.length < 2) return { corePropositionConfirmed: false, missingModifierComponents: [] };
  if (!exLower.includes(entity)) return { corePropositionConfirmed: false, missingModifierComponents: [] };
  const relationPhrasePool = claimType === "numeric_finance"
    ? FACTUAL_RELATION_PHRASES.filter((phrase) => !DESCRIPTIVE_ONLY_RELATION_PHRASES.has(phrase))
    : FACTUAL_RELATION_PHRASES;
  const relationInStmt = relationPhrasePool.filter((phrase) => stmtLower.includes(phrase));
  const relationInExcerpt = relationPhrasePool.filter((phrase) => exLower.includes(phrase));
  const legacySubstringOverlap = relationInStmt.some((r) => relationInExcerpt.some((e) => r.includes(e) || e.includes(r)));
  const normalizedStmtFamilies = normalizeRelationPhraseFamilies(relationInStmt, claimType);
  const normalizedExcerptFamilies = normalizeRelationPhraseFamilies(relationInExcerpt, claimType);
  const overlapByFamily = normalizedStmtFamilies.length > 0 && normalizedExcerptFamilies.length > 0
    && normalizedStmtFamilies.some((f) => normalizedExcerptFamilies.includes(f));
  const overlap = overlapByFamily || legacySubstringOverlap;
  if (relationInStmt.length > 0 || relationInExcerpt.length > 0) {
    console.log("QC_V2_RELATION_FAMILY_MATCH", JSON.stringify({
      claimId: options.claimId ?? null,
      claimType,
      stmtRelations: relationInStmt,
      excerptRelations: relationInExcerpt,
      normalizedStmtFamilies,
      normalizedExcerptFamilies,
      overlapByFamily,
    }));
  }
  if (!overlap) return { corePropositionConfirmed: false, missingModifierComponents: [] };
  const missingModifierComponents = [];
  if (/for\s+large\s+merchants|targeted\s+at\s+large|large\s+merchants/i.test(stmtLower) && !/large\s+merchants|for\s+large/i.test(exLower)) {
    missingModifierComponents.push("target");
  }
  if (/materially\s+strengthen|expects?.*strengthen|adoption\s+this\s+year/i.test(stmtLower) && !/materially|strengthen|this\s+year|expects?/i.test(exLower)) {
    missingModifierComponents.push("degree_qualifier");
  }
  return { corePropositionConfirmed: true, missingModifierComponents };
}

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
    const { corePropositionConfirmed: coreConfirmed, missingModifierComponents } = corePropositionConfirmed(statementText, excerpt, {
      claimType: inferClaimTypeForRelation(statementText),
    });
    if (coreConfirmed && roleCompatible) {
      const modifierNote = missingModifierComponents.length > 0 ? `; modifier(s) not confirmed: ${missingModifierComponents.join(", ")}` : "";
      return {
        relationship: "partial",
        confidenceBand: "medium",
        reasonCode: "core_proposition_confirmed",
        explanation: `Core proposition (entity + relation) confirmed in source${modifierNote}`,
        missingModifierComponents,
      };
    }
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
