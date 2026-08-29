// lib/qc/evidence-relationship.mjs
import {
  isAuthoringOrganisationName,
  resolveAuthoringOrganisationName,
} from "./first-person-actor.mjs";

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
 * Where the author is the ONLY name, the author is used. Measuring this against
 * the graded corpus showed the alternative — no anchor, so never confirmed — is
 * a false red: "Partners Group's investment will support continued growth
 * through increased waste volumes..." against a source that says Partners Group
 * will do exactly that. A source that does name the client corroborates the
 * client's own action, and refusing to look is not caution, it is a wrong answer.
 */
function corroborationAnchor(stmt) {
  const names = String(stmt ?? "").match(ANCHOR_ENTITY_RE) ?? [];
  for (const m of names) {
    if (isAuthoringOrganisationName(m)) continue;
    return m.toLowerCase();
  }
  const authorOnly = names.find((m) => isAuthoringOrganisationName(m));
  return authorOnly ? authorOnly.toLowerCase() : null;
}

/**
 * Relation phrases too generic to tell us who did anything. "Westhaven Capital
 * agrees to acquire" identifies an actor; "the Company is" does not.
 */
const ACTORLESS_RELATION_PHRASES = new Set([
  "is", "are", "was", "were", "has", "have", "had",
]);

/** First-person subjects. In a source excerpt these are somebody speaking. */
const FIRST_PERSON_ACTOR_RE = /\b(?:we|our|us)\b/i;

/**
 * Words the Title-Case pattern picks up that are not names. A sentence opening
 * "We", "The", "Second" or "Product" matches the same shape as "Norwell", so the
 * anchor is sometimes a function word. That was survivable while the anchor was
 * only tested for presence in the excerpt; the actor test compares names against
 * it, so a junk anchor makes every real name look like a rival and refuses
 * support that is plainly there. The actor test therefore stands down unless the
 * anchor is a plausible name. Anchor selection itself is left alone: changing it
 * would move statements well outside this fix.
 */
const NOT_A_NAME = new Set([
  "we", "our", "us", "the", "this", "that", "these", "those", "it", "its",
  "they", "their", "there", "here", "as", "at", "in", "on", "by", "for",
  "first", "second", "third", "fourth", "fifth", "further", "finally",
  "product", "revenue", "customer", "company", "fund", "management", "returns",
  "across", "female", "male", "leveraging", "following", "during", "since",
  "however", "overall", "base", "net", "gross", "total", "operational",
]);

function isPlausibleEntityName(anchor) {
  const a = String(anchor ?? "").trim();
  if (a.length < 3) return false;
  if (/\s/.test(a)) return true;
  return !NOT_A_NAME.has(a);
}

/** Quoted spans, straight or curly. */
const QUOTED_SPAN_RE = /["\u201c]([^"\u201d]{10,})["\u201d]/g;

/**
 * A first-person claim inside quotation marks, in an excerpt that never names
 * the author.
 *
 * The narrow signal matters. An unquoted "we" is how a client's own memo reads —
 * "We seek approval for an investment of up to EUR 480 million" — and treating
 * that as a stranger refused several hundred genuinely supported statements when
 * measured against the corpus. A QUOTED "we" is different: press releases put
 * speech in quotation marks and attribute it to a named individual at a named
 * firm, and the attribution usually sits outside the excerpt the matcher was
 * handed. So a quoted first-person claim, in an excerpt that does not name the
 * author, is somebody else talking.
 */
function quotedFirstPersonBelongsToSomeoneElse(excerpt) {
  if (excerptNamesTheAuthor(excerpt)) return false;
  QUOTED_SPAN_RE.lastIndex = 0;
  for (const m of String(excerpt ?? "").matchAll(QUOTED_SPAN_RE)) {
    if (FIRST_PERSON_ACTOR_RE.test(m[1])) return true;
  }
  return false;
}

/**
 * Does the excerpt credit the anchored relation to somebody who is neither the
 * anchor nor the authoring organisation?
 *
 * This is the "claiming somebody else's deal" check. Skipping the author when
 * choosing an anchor is right when the author is incidental to the proposition,
 * and wrong when the author is the actor in it. A draft saying "Halden Group has
 * agreed to acquire Norwell" anchors on Norwell, finds Norwell in a press
 * release, and confirms — even though the release says Westhaven is the buyer.
 *
 * Two shapes are caught, both from text already to hand, no model call:
 *
 *   1. a NAMED organisation in subject position before the relation. Requiring
 *      it to precede the relation is what separates "Westhaven Capital agrees to
 *      acquire Norwell" from "Norwell was acquired ... from Bridgepoint", where
 *      the trailing name is not the actor.
 *   2. a QUOTED first-person claim where the excerpt never names the author. The
 *      quotation "We are excited to partner with the Norwell management team to
 *      support continued growth" names no organisation at all, so a
 *      named-actor-only test misses it entirely — and that one is the live false
 *      green. See quotedFirstPersonBelongsToSomeoneElse for why the quotation
 *      marks, rather than the "we", are what carries the signal.
 *
 * A single-word actor ("Bridgepoint") is not counted: sentence-initial words
 * like "Leveraging" and "These" have the same shape, and over-refusing costs
 * real support. This misses rather than over-fires, deliberately.
 *
 * The whole test is inert where no authoring organisation is configured. It asks
 * whether an actor is somebody OTHER than the author, which without an author is
 * not a question. Running it anyway reads every "we" as a stranger and every
 * company named in a headline as a rival, and the corpus showed that refusing
 * six genuinely supported statements — a client's own IC memo corroborated by
 * its own source. Unconfigured tenants therefore see no change from this rule.
 */
function excerptCreditsADifferentActor(excerpt, anchor, sharedRelations) {
  if (!resolveAuthoringOrganisationName()) return false;
  if (!isPlausibleEntityName(anchor)) return false;
  const relations = sharedRelations.filter((r) => !ACTORLESS_RELATION_PHRASES.has(r));
  if (relations.length === 0) return false;

  const exLower = excerpt.toLowerCase();
  const earliestRelation = Math.min(
    ...relations.map((r) => exLower.indexOf(r)).filter((i) => i >= 0)
  );
  if (!Number.isFinite(earliestRelation)) return false;

  // Only the NEAREST name before the relation is a candidate subject. Scanning
  // everything before it reads the target company out of a headline ("Meridian
  // Capital completes acquisition of Lumen Specialty Chemicals ... today
  // announced") or a newly appointed CEO as the rival actor, and refuses support
  // that is plainly there.
  const before = excerpt.slice(0, earliestRelation);
  const names = before.match(ANCHOR_ENTITY_RE) ?? [];
  const subject = [...names].reverse().find((n) => /\s/.test(n));
  if (subject) {
    const lower = subject.toLowerCase();
    const sharesGroundWithAnchor =
      lower === anchor || lower.includes(anchor) || anchor.includes(lower);
    if (!sharesGroundWithAnchor && !isAuthoringOrganisationName(subject)) return true;
  }

  if (quotedFirstPersonBelongsToSomeoneElse(excerpt)) return true;

  return false;
}

function excerptNamesTheAuthor(excerpt) {
  for (const m of String(excerpt ?? "").match(ANCHOR_ENTITY_RE) ?? []) {
    if (isAuthoringOrganisationName(m)) return true;
  }
  return false;
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
  // Exact phrase equality, not the substring overlap used to decide confirmation.
  // That overlap is deliberately loose and pairs "establish" with "is", because
  // "establish" happens to contain those two letters. Loose is fine for asking
  // whether two texts talk about the same thing; for asking who performed a
  // specific act it invents a relation and then finds a stranger performing it.
  const sharedRelations = relationInExcerpt.filter((e) => relationInStmt.includes(e));
  if (excerptCreditsADifferentActor(ex, entity, sharedRelations)) {
    return { corePropositionConfirmed: false, missingModifierComponents: [] };
  }
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
