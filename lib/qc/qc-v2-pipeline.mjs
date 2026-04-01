// lib/qc/qc-v2-pipeline.mjs
// A6.40: QC V2 — deterministic pipeline from atomic claims. Single matcher, proposition-level matching, rule-based commentary.

import { corePropositionConfirmed } from "./evidence-relationship.mjs";
import {
  computeQuantityMismatchInferencePolicy,
  countBindingPolicyMetrics,
  countDirectSupportingBindings,
  isQuantityMismatchStructured,
} from "./binding-directness.mjs";

/** Claim types (rule-based). */
export const CLAIM_TYPES = Object.freeze([
  "numeric_finance",
  "launch_or_product",
  "qualitative_corporate_fact",
  "market_or_industry_trend",
  "expectation_or_projection",
  "descriptive_fact",
  "other_fact",
]);

/**
 * A6.40 §4: Deterministic claim typing. Log QC_V2_CLAIM_TYPE.
 */
export function detectClaimType(claimText, log = () => {}) {
  const t = (claimText || "").toLowerCase();
  let claimType = "other_fact";
  if (/\$[\d,.]+\s*(?:million|billion|mm|m|bn|b|k)?|\d+(?:\.\d+)?\s*%\s*(?:stake|ownership)|series\s+[a-d]|funding\s+round|raised\s+\$|valuation|pre-money|post-money/i.test(t)) {
    claimType = "numeric_finance";
  } else if (/\blaunch(?:ed)?\b|\brelease(?:d)?\b|\bintroduce(?:d)?\b|\bannounce(?:d)?\b|\broll(?:ed)?\s+out\b/i.test(t)) {
    claimType = "launch_or_product";
  } else if (/\bfounded\b|\bbased\s+in\b|\bheadquartered\b|\bacquired\b|\bmerged\b|\bestablished\b/i.test(t)) {
    claimType = "qualitative_corporate_fact";
  } else if (/\bmarket\s+demand\b|\bindustry\s+commentary\b|\bshift(?:ing)?\s+toward\b|\bdemand\s+is\s+shift|integrated\s+payments\s+platform/i.test(t)) {
    claimType = "market_or_industry_trend";
  } else if (/\bexpects?\b|\banticipates?\b|\bforecast\b|\bguidance\b|\bwill\s+materially\b|\bthis\s+year\b/i.test(t)) {
    claimType = "expectation_or_projection";
  } else if (/\bis\b|\bare\b|\bwas\b|\bwere\b|\bhas\b|\bhave\b|\benables?\b|\bprovides?\b|\bsupports?\b|\boffers?\b/i.test(t)) {
    claimType = "descriptive_fact";
  }
  log("QC_V2_CLAIM_TYPE", JSON.stringify({ claimPreview: (claimText || "").substring(0, 80), claimType }));
  return claimType;
}

/**
 * A6.40 §5: Component derivation (pattern-based). Entity, relation, object, amount, location, timeframe, target, etc.
 */
export function deriveComponents(claimText) {
  const t = (claimText || "").trim();
  const lower = t.toLowerCase();
  const components = {
    entity: null,
    relation: null,
    object: null,
    amount: null,
    location: null,
    timeframe: null,
    target: null,
    certainty: null,
  };
  const entityMatch = t.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/);
  if (entityMatch) components.entity = entityMatch[1];
  const relationPhrases = [
    "founded in", "founded", "based in", "headquartered", "launched", "launch", "announced", "acquired",
    "raised", "released", "introduced", "expects", "anticipates", "forecast",
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
  ];
  for (const r of relationPhrases) {
    if (lower.includes(r)) { components.relation = r; break; }
  }
  const amountMatch = t.match(/\$[\d,.]+\s*(?:million|billion|mm|m|bn|b|k)?|\d+(?:\.\d+)?\s*%/i);
  if (amountMatch) components.amount = amountMatch[0];
  const locationMatch = t.match(/\b(?:in|at)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
  if (locationMatch) components.location = locationMatch[1];
  if (/this\s+year|\d{4}/i.test(t)) components.timeframe = t.match(/this\s+year|\d{4}/i)?.[0] ?? null;
  if (/for\s+large\s+merchants|targeted\s+at|large\s+merchants/i.test(t)) components.target = "large merchants";
  if (/expects?|anticipates?|will\s+materially/i.test(t)) components.certainty = "expectation";
  return components;
}

/**
 * A6.49h: At most one corpus hit per cited ref — refId match first, then docId; tiebreak: number match, then first in hits order.
 */
export function pickCorpusHitForCitation(citationRefId, hits) {
  const rid = String(citationRefId);
  if (!Array.isArray(hits) || hits.length === 0) return { hit: null, matchedKey: null };
  const poolA = hits.filter((h) => h?.refId != null && String(h.refId) === rid);
  const pool = poolA.length > 0
    ? poolA
    : hits.filter((h) => h?.docId != null && String(h.docId) === rid);
  const matchedKey = poolA.length > 0 ? "refId" : pool.length > 0 ? "docId" : null;
  if (!pool.length) return { hit: null, matchedKey: null };
  let best = pool[0];
  let bestPos = hits.indexOf(best);
  const rank = (h) => (h.matchType === "number" ? 1 : 0);
  for (let i = 1; i < pool.length; i++) {
    const cur = pool[i];
    const curPos = hits.indexOf(cur);
    if (rank(cur) > rank(best) || (rank(cur) === rank(best) && curPos < bestPos)) {
      best = cur;
      bestPos = curPos;
    }
  }
  return { hit: best, matchedKey };
}

/**
 * A6.49i: Uploaded vs web — authoritative ref metadata first; numeric uploadedLen heuristic only as fallback.
 */
function classifyRefUploadedVsWeb(ref, refId, uploadedLen) {
  const st = ref?.sourceType != null ? String(ref.sourceType).trim().toLowerCase() : "";
  const ty = ref?.type != null ? String(ref.type).trim().toLowerCase() : "";
  if (st === "uploaded" || ty === "uploaded") {
    return { isWeb: false, routingBasis: "authoritative_source_type", authoritativeRead: st || ty || "uploaded" };
  }
  if (ty === "web" || st === "web_search" || st === "web") {
    return { isWeb: true, routingBasis: "authoritative_source_type", authoritativeRead: st || ty || "web" };
  }
  const heuristicWeb = (Number(refId) || 0) > uploadedLen;
  return {
    isWeb: heuristicWeb,
    routingBasis: "heuristic_fallback",
    authoritativeRead: null,
  };
}

/**
 * Build candidate list for one claim from statement's evidence bundle and corpus result.
 */
export function getCandidatesForClaim(statement, claim, refsById, uploadedLen, assignCredibilityTier, hitAssocLog = null) {
  const diagVerbose = typeof process !== "undefined" && process.env?.BRIGHTLINE_DIAG_VERBOSE === "1";
  const logAssoc = (payload) => {
    if (!diagVerbose || !hitAssocLog?.log) return;
    hitAssocLog.log("QC_V2_UPLOADED_HIT_ASSOCIATION", JSON.stringify(payload));
  };
  const logRoute = (payload) => {
    if (!diagVerbose || !hitAssocLog?.log) return;
    hitAssocLog.log("QC_V2_REF_SOURCE_ROUTING", JSON.stringify(payload));
  };
  const claimCites = Array.isArray(claim?.citations) ? claim.citations : [];
  const corpusResult = statement.meta?._evidenceBundleCorpusResult ?? null;
  const hits = (corpusResult?.found && Array.isArray(corpusResult.hits)) ? corpusResult.hits : [];
  const bindings = Array.isArray(statement.evidenceBundle?.supportBindings) ? statement.evidenceBundle.supportBindings : [];
  const bindingByRefId = new Map();
  bindings.forEach((b) => { if (b?.refId != null) bindingByRefId.set(String(b.refId), b); });
  const candidates = [];
  for (const cid of claimCites) {
    const refId = cid != null ? String(cid) : null;
    if (!refId || !refsById.has(refId)) continue;
    const ref = refsById.get(refId);
    const { isWeb, routingBasis, authoritativeRead } = classifyRefUploadedVsWeb(ref, refId, uploadedLen);
    logRoute({
      claimId: hitAssocLog?.claimId ?? null,
      refId,
      authoritativeSourceType: ref?.sourceType ?? ref?.type ?? null,
      routingDecision: isWeb ? "web" : "uploaded",
      routingBasis,
      uploadedLen,
      authoritativeRead: authoritativeRead ?? undefined,
    });
    let excerpt = "";
    if (isWeb) {
      excerpt = (ref?.snippet && String(ref.snippet).trim()) ? String(ref.snippet).trim() : (ref?.title && String(ref.title).trim()) ? String(ref.title).trim() : "";
      if (!excerpt) continue;
      const tier = ref?.credibilityTier ?? (assignCredibilityTier ? assignCredibilityTier(ref?.url ?? "") : "LOW");
      candidates.push({
        refId,
        rawTitle: ref?.title ?? "Web source",
        displayTitle: ref?.title ?? "Web source",
        sourceOrigin: "web",
        excerptText: excerpt,
        credibilityTier: tier,
        url: ref?.url ?? null,
      });
    } else {
      const { hit: pickedHit, matchedKey: corpusPickKey } = pickCorpusHitForCitation(refId, hits);
      let hit = pickedHit?.excerpt && String(pickedHit.excerpt).trim() ? pickedHit : null;
      let hitCorpusKey = hit ? corpusPickKey : null;
      const binding = bindingByRefId.get(refId);
      let excerptSource = null;
      if (hit) {
        excerpt = String(hit.excerpt).trim();
        excerptSource = "hit";
      } else if (binding?.excerpt && String(binding.excerpt).trim() && binding.excerpt !== "(excerpt not captured)") {
        excerpt = String(binding.excerpt).trim();
        excerptSource = "binding";
      }
      if (!excerpt && ref?.title) {
        excerpt = (ref.title || "").slice(0, 300);
        excerptSource = "title_fallback";
      }
      if (excerpt) {
        /** A6.49g: upstream numeric truth from corpus/binding — not the V2 component matcher. */
        const BINDING_MATCH_SUPPORTS_NUMERIC = new Set([
          "exact", "rounded_equivalent", "unit_equivalent", "partial_support", "paraphrase",
        ]);
        let upstreamNumericEvidence = false;
        let upstreamNumericEvidenceSource = null;
        if (excerptSource === "hit" && hit?.matchType === "number") {
          upstreamNumericEvidence = true;
          upstreamNumericEvidenceSource = "corpus_hit_number";
        } else if (excerptSource === "binding" && binding) {
          const mt = String(binding.matchType || "none").toLowerCase();
          if (binding.reasonCode === "numeric_tuple" || BINDING_MATCH_SUPPORTS_NUMERIC.has(mt)) {
            upstreamNumericEvidence = true;
            upstreamNumericEvidenceSource = binding.reasonCode === "numeric_tuple"
              ? "binding_numeric_tuple"
              : `binding_match_${mt}`;
          }
        }
        const matchedHitKeyType =
          excerptSource === "hit"
            ? (hitCorpusKey ?? "none")
            : excerptSource === "binding"
              ? "binding"
              : excerptSource === "title_fallback"
                ? "title_fallback"
                : "none";
        logAssoc({
          claimId: hitAssocLog?.claimId ?? null,
          citationRefId: refId,
          matchedHitKeyType,
          hitDocId: hit?.docId ?? pickedHit?.docId ?? null,
          hitRefId: hit?.refId ?? pickedHit?.refId ?? null,
          excerptSource,
          upstreamNumericEvidence,
          upstreamNumericEvidenceSource,
        });
        candidates.push({
          refId,
          rawTitle: ref?.title ?? "Untitled source",
          displayTitle: ref?.title ?? "Untitled source",
          sourceOrigin: "uploaded",
          excerptText: excerpt,
          credibilityTier: "HIGH",
          url: ref?.url ?? null,
          upstreamNumericEvidence,
          upstreamNumericEvidenceSource,
        });
      }
    }
  }
  return candidates;
}

/** Credibility: rejected for confirmation (cannot produce conflict). */
const REJECTED_CREDIBILITY = new Set(["LOW", "WIKIPEDIA", "AGGREGATOR", "CONTENT_FARM", "ANONYMOUS", "AI_GENERATED"]);

/** A6.43: keyValue from claim components (numeric/key value). */
function getKeyValue(components, claimType) {
  if (claimType === "numeric_finance" && components?.amount) return components.amount;
  return null;
}

/**
 * A6.43 §1: Deterministic excerpt score. +3 entity, +3 relation, +4 key value, +2 modifier, +1 contextual, -3 if no entity.
 */
/** A6.49j: Broad numeric surface for excerpt survival (digits, currency, million/m, etc.). */
function isNumericCue(text) {
  if (typeof text !== "string" || !text.trim()) return false;
  const t = text.toLowerCase();
  if (/\d/.test(t)) return true;
  if (/[$€£¥₹]/.test(text)) return true;
  /** Word-based amounts: number word + optional "hundred" + magnitude (not bare "million", etc.). */
  const wordNumericPhrase =
    /\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:hundred\s+)?(thousand|million|billion)\b/i;
  if (wordNumericPhrase.test(t)) return true;
  if (/\d+(?:\.\d+)?\s*%/.test(t)) return true;
  if (/\$[\d,.]+\s*(?:million|billion|m|bn)?/.test(text)) return true;
  return false;
}

function scoreExcerpt(components, excerpt, evResult, claimType) {
  const ex = (excerpt || "").trim().toLowerCase();
  if (!ex) return -10;
  let score = 0;
  const entity = components?.entity;
  const hasEntity = entity && ex.includes((entity || "").toLowerCase());
  if (hasEntity) score += 3;
  else score -= 3;
  const relation = components?.relation;
  if (relation && ex.includes((relation || "").toLowerCase())) score += 3;
  const keyValue = getKeyValue(components, claimType);
  if (keyValue && (ex.includes(keyValue.toLowerCase()) || ex.replace(/,/g, "").includes((keyValue || "").replace(/,/g, "").toLowerCase()))) score += 4;
  const hasModifier = components?.target || components?.amount || components?.location;
  if (hasModifier && (components?.target && ex.includes("large") || components?.location && ex.includes((components.location || "").toLowerCase()) || components?.amount && ex.includes((components.amount || "").replace(/,/g, "")))) score += 2;
  if (ex.length >= 40 && (hasEntity || relation)) score += 1;
  return score;
}

/**
 * A6.43 §3: Minimum excerpt quality gate. Display only if at least one: entity+relation, entity+keyValue, conflicting keyValue, explains missing modifier.
 * A6.49f / A6.49g: Narrow additive path for numeric_finance when upstream numeric evidence is present (corpus number hit / binding tuple) and excerpt has a numeric cue (not title-only synthetic). Does not require confirmedComponents.amount.
 * A6.49j: numeric_mismatch_excerpt — quantity_mismatch-structured + related|partial + strict upstreamNumericEvidence + isNumericCue (display survival only).
 */
function passesExcerptQualityGate(ev, components, claimType, refsById = new Map(), gateLog = null, supportMismatch = null) {
  const diagVerbose = typeof process !== "undefined" && process.env?.BRIGHTLINE_DIAG_VERBOSE === "1";
  const logGate = (payload) => {
    if (!diagVerbose || !gateLog?.log) return;
    gateLog.log("QC_V2_EXCERPT_QUALITY_GATE", JSON.stringify({
      claimId: gateLog.claimId ?? null,
      refId: ev.candidate?.refId ?? null,
      ...payload,
    }));
  };
  const logNumericMismatchDiag = (pass, failReason = null) => {
    if (!diagVerbose || !gateLog?.log) return;
    const payload = {
      claimId: gateLog.claimId ?? null,
      refId: ev.candidate?.refId ?? null,
      branch: "numeric_mismatch_excerpt",
      pass,
    };
    if (!pass && failReason) payload.failReason = failReason;
    gateLog.log("QC_V2_EXCERPT_QUALITY_GATE", JSON.stringify(payload));
  };
  const cc = ev.confirmedComponents ?? [];
  const miss = ev.missingComponents ?? [];
  const conflict = ev.conflictingComponents ?? [];
  const hasEntity = cc.includes("entity");
  const hasRelation = cc.includes("relation");
  const hasKeyValue = cc.includes("amount");
  if (hasEntity && hasRelation) {
    logGate({ outcome: "pass", branch: "entity_relation" });
    return true;
  }
  const keyVal = getKeyValue(components, claimType);
  if (keyVal && hasEntity && hasKeyValue) {
    logGate({ outcome: "pass", branch: "entity_keyvalue" });
    return true;
  }
  if (conflict.length > 0) {
    const excerpt = (ev.candidate?.excerptText || "").trim();
    if (/\$[\d,.]+\s*(?:million|billion|m|bn)?|\d+(?:\.\d+)?\s*%/.test(excerpt)) {
      logGate({ outcome: "pass", branch: "conflict_numeric_cue" });
      return true;
    }
  }
  if (miss.length > 0 && (hasEntity || hasRelation)) {
    logGate({ outcome: "pass", branch: "modifier_miss_context" });
    return true;
  }

  if (claimType === "numeric_finance") {
    const excerpt = (ev.candidate?.excerptText || "").trim();
    if (!excerpt) {
      logGate({ outcome: "fail", branch: "numeric_evidence", reason: "empty_excerpt" });
      return false;
    }
    if (ev.rejected) {
      logGate({ outcome: "fail", branch: "numeric_evidence", reason: "rejected_credibility" });
      return false;
    }
    if (ev.classification === "none") {
      logGate({ outcome: "fail", branch: "numeric_evidence", reason: "classification_none" });
      return false;
    }
    if (isTitleOnlySyntheticExcerpt(ev.candidate, refsById)) {
      logGate({ outcome: "fail", branch: "numeric_evidence", reason: "title_only_synthetic" });
      return false;
    }
    if (isQuantityMismatchStructured(supportMismatch)) {
      let failReason = null;
      let pass = false;
      if (!excerpt || excerpt.length === 0) failReason = "empty_excerpt";
      else if (isTitleOnlySyntheticExcerpt(ev.candidate, refsById)) failReason = "title_only_synthetic";
      else if (ev.rejected) failReason = "rejected_credibility";
      else if (ev.classification === "none") failReason = "classification_none";
      else if (ev.classification !== "related" && ev.classification !== "partial") failReason = "classification_not_related_or_partial";
      else if (!isNumericCue(excerpt)) failReason = "no_numeric_cue";
      else if (ev.candidate?.upstreamNumericEvidence !== true) failReason = "upstream_numeric_evidence_not_true";
      else pass = true;
      logNumericMismatchDiag(pass, failReason);
      if (pass) {
        logGate({ outcome: "pass", branch: "numeric_mismatch_excerpt" });
        return true;
      }
    }
    const numericCue = /\$[\d,.]+\s*(?:million|billion|m|bn)?|\d+(?:\.\d+)?\s*%/.test(excerpt);
    /** Upstream: corpus numeric hit / binding tuple (see getCandidatesForClaim). Eval fallbacks: amount line still populated when matcher agrees. */
    const upstreamTruth =
      ev.candidate?.upstreamNumericEvidence === true
      || cc.includes("amount")
      || conflict.length > 0;
    const upstreamSource =
      ev.candidate?.upstreamNumericEvidence === true
        ? (ev.candidate?.upstreamNumericEvidenceSource || "upstream_unknown")
        : cc.includes("amount")
          ? "eval_confirmed_amount"
          : conflict.length > 0
            ? "eval_conflict_amount"
            : null;
    if (upstreamTruth && numericCue) {
      logGate({
        outcome: "pass",
        branch: "numeric_evidence",
        upstreamSource,
      });
      return true;
    }
    logGate({
      outcome: "fail",
      branch: "numeric_evidence",
      reason: !upstreamTruth ? "no_upstream_numeric_truth" : "no_numeric_cue_in_excerpt",
      upstreamSource: upstreamSource ?? undefined,
    });
    return false;
  }
  return false;
}

/** A6.50j: Stop words aligned with A6.50f content-word extraction. */
const A6_50J_KEYWORD_STOP = new Set([
  "the", "this", "that", "these", "those", "with", "from", "their", "there", "about", "which",
  "would", "could", "should", "have", "been", "will", "also", "into", "onto", "over", "under",
  "through", "between", "within", "toward", "during", "after", "before", "around", "company",
  "portfolio",
]);

/**
 * A6.50j: Qualitative claim types eligible for keyword-presence confirmation.
 * other_fact is included because detectClaimType uses it for thesis-style claims not matching narrower patterns.
 */
const A6_50J_KEYWORD_CLAIM_TYPES = new Set([
  "investment_thesis",
  "growth_strategy",
  "business_description",
  "descriptive_fact",
  "other_qualitative",
  "other_fact",
]);

function extractA650jContentWords(claimText) {
  const lower = (claimText || "").toLowerCase();
  const tokens = lower.match(/\b[a-z]{5,}\b/g) || [];
  return [...new Set(tokens)].filter((w) => !A6_50J_KEYWORD_STOP.has(w));
}

/** @param {string[]} words @param {string} excerpt */
function findA650jContentWordsInExcerpt(words, excerpt) {
  const ex = excerpt || "";
  const found = [];
  for (const w of words) {
    const re = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(ex)) found.push(w);
  }
  return found;
}

/**
 * A6.40 §10–14: Single matcher — proposition-level. Returns confirmedComponents, missingComponents, conflictingComponents.
 */
function evaluateCandidate(claimText, claimType, components, candidate, assignCredibilityTier, claimId = null) {
  const excerpt = (candidate?.excerptText || "").trim();
  if (!excerpt || excerpt === "(excerpt not captured)") {
    return { confirmedComponents: [], missingComponents: [], conflictingComponents: [], classification: "none" };
  }
  const tier = candidate.credibilityTier ?? assignCredibilityTier?.(candidate?.url ?? "") ?? "LOW";
  const rejected = REJECTED_CREDIBILITY.has(String(tier).toUpperCase());
  const { corePropositionConfirmed: coreOk, missingModifierComponents } = corePropositionConfirmed(claimText, excerpt, { claimType, claimId });
  const confirmedComponents = [];
  const missingComponents = [...(missingModifierComponents || [])];
  const conflictingComponents = [];
  if (components.entity && excerpt.toLowerCase().includes((components.entity || "").toLowerCase())) confirmedComponents.push("entity");
  if (coreOk) {
    confirmedComponents.push("relation");
    if (missingModifierComponents && missingModifierComponents.length > 0) {
      if (missingModifierComponents.includes("target")) missingComponents.push("target_market");
      if (missingModifierComponents.includes("degree_qualifier")) missingComponents.push("projection_or_expectation");
    }
  }
  if (claimType === "numeric_finance" && components.amount) {
    if (excerpt.includes(components.amount) || excerpt.replace(/,/g, "").includes((components.amount || "").replace(/,/g, ""))) {
      confirmedComponents.push("amount");
    } else {
      const amountMatches = [...excerpt.matchAll(/\$[\d,.]+\s*(?:million|billion|mm|m|bn|b|k|thousand)?/gi)];
      const claimAmountNormalized = normalizeAmount(components.amount);
      let formatEquivalentHandled = false;
      const hasDollarFigure = amountMatches.length > 0;
      for (const match of amountMatches) {
        const excerptAmount = match[0];
        const excerptAmountNormalized = normalizeAmount(excerptAmount);
        if (claimAmountNormalized == null || excerptAmountNormalized == null) continue;
        const tolerance = Math.max(Math.abs(claimAmountNormalized) * 0.01, 1e-9);
        if (Math.abs(claimAmountNormalized - excerptAmountNormalized) <= tolerance) {
          formatEquivalentHandled = true;
          const claimFamily = claimTypeToRoleFamily(claimType);
          const excerptFamily = excerptAmountRoleFamily(excerpt, excerptAmount);
          const roleCompatible = claimFamily === excerptFamily || claimFamily === "UNKNOWN" || excerptFamily === "UNKNOWN";
          const result = roleCompatible ? "confirmed" : "conflict";
          console.log(`[A6.50g] amount match: claimType=${claimType} claimAmount=${components.amount} excerptAmount=${excerptAmount} claimFamily=${claimFamily} excerptFamily=${excerptFamily} result=${result}`);
          if (roleCompatible) confirmedComponents.push("amount");
          else conflictingComponents.push("amount");
          break;
        }
      }
      if (!formatEquivalentHandled && hasDollarFigure) {
        conflictingComponents.push("amount");
      }
    }
  }
  if (components.location && !excerpt.toLowerCase().includes((components.location || "").toLowerCase())) {
    if (/founded|based\s+in|headquartered/.test(claimText.toLowerCase())) missingComponents.push("location");
  }
  let classification = "none";
  if (conflictingComponents.length > 0 && !rejected) classification = "conflict";
  else if (confirmedComponents.includes("entity") && coreOk && missingComponents.length === 0) classification = "full";
  else if (confirmedComponents.includes("entity") && coreOk && missingComponents.length > 0) classification = "partial";
  else if (confirmedComponents.length > 0) classification = "related";

  // A6.50j: Relaxed keyword-presence confirmation (qualitative claim types only; never numeric_finance).
  const ctNorm = String(claimType || "").trim().toLowerCase();
  if (
    ctNorm !== "numeric_finance"
    && A6_50J_KEYWORD_CLAIM_TYPES.has(ctNorm)
    && !rejected
    && (classification === "related" || classification === "none")
  ) {
    const contentWords = extractA650jContentWords(claimText);
    const wordsInExcerpt = findA650jContentWordsInExcerpt(contentWords, excerpt);
    const n = wordsInExcerpt.length;
    let keywordResult = "none";
    if (n >= 3) {
      if (!confirmedComponents.includes("relation")) confirmedComponents.push("relation");
      if (!confirmedComponents.includes("keyword_presence")) confirmedComponents.push("keyword_presence");
      classification = "partial";
      keywordResult = "partial";
    } else if (n === 2) {
      keywordResult = "related";
    }
    const wordsStr = wordsInExcerpt.join(",");
    console.log(`[A6.50j] keyword presence confirmation: claimType=${claimType} wordsFound=${n} words=${wordsStr} result=${keywordResult}`);
  }

  return { confirmedComponents, missingComponents, conflictingComponents, classification, rejected };
}

/** A6.50g: Normalize currency amount string to numeric value. */
function normalizeAmount(str) {
  if (typeof str !== "string") return null;
  const raw = str.trim().toLowerCase();
  if (!raw) return null;
  const cleaned = raw.replace(/\$/g, "").replace(/,/g, "").trim();
  const m = cleaned.match(/^(\d+(?:\.\d+)?)\s*(million|billion|thousand|mm|bn|m|b|k)?$/i);
  if (!m) return null;
  const base = Number(m[1]);
  if (!Number.isFinite(base)) return null;
  const suffix = (m[2] || "").toLowerCase();
  const multiplier =
    suffix === "mm" || suffix === "m" || suffix === "million" ? 1e6 :
    suffix === "bn" || suffix === "b" || suffix === "billion" ? 1e9 :
    suffix === "k" || suffix === "thousand" ? 1e3 :
    1;
  return base * multiplier;
}

/** A6.50g: Claim/canonical type to role family mapping. */
function claimTypeToRoleFamily(claimType) {
  const t = String(claimType || "").trim().toLowerCase();
  if (t === "investment_amount") return "INVESTMENT";
  if (t === "valuation_pre_money" || t === "valuation_post_money" || t === "valuation_enterprise_value" || t === "valuation_equity_value") return "VALUATION";
  if (t === "metric_amount") return "METRIC";
  return "UNKNOWN";
}

/** A6.50g: Determine local role family around a matched excerpt amount. */
function excerptAmountRoleFamily(excerpt, matchedAmountStr) {
  const text = typeof excerpt === "string" ? excerpt : "";
  const needle = typeof matchedAmountStr === "string" ? matchedAmountStr : "";
  if (!text || !needle) return "UNKNOWN";
  const idx = text.toLowerCase().indexOf(needle.toLowerCase());
  if (idx < 0) return "UNKNOWN";
  const center = idx + Math.floor(needle.length / 2);
  const start = Math.max(0, center - 75);
  const end = Math.min(text.length, center + 75);
  const window = text.slice(start, end).toLowerCase();
  const countMatches = (tokens) => tokens.reduce((n, token) => n + (window.includes(token) ? 1 : 0), 0);
  const investmentTokens = ["invest", "investing", "investment", "financing", "financing round", "series", "seed", "commit", "deploy", "participate", "check", "up to"];
  const valuationTokens = ["valuation", "valued", "pre-money", "post-money", "premoney", "postmoney", "enterprise value", "ev", "priced at", "cap table"];
  const metricTokens = ["revenue", "mrr", "arr", "gmv", "run rate", "annualized", "per month", "per year", "subscription", "fee", "pricing", "avg", "average", "arpu"];
  const scores = {
    INVESTMENT: countMatches(investmentTokens),
    VALUATION: countMatches(valuationTokens),
    METRIC: countMatches(metricTokens),
  };
  const ordered = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (!ordered.length || ordered[0][1] <= 0) return "UNKNOWN";
  if (ordered.length > 1 && ordered[0][1] === ordered[1][1]) return "UNKNOWN";
  return ordered[0][0];
}

/**
 * A6.43 §5: Deterministic valueSummary from excerpt. No free text generation.
 */
function extractValueSummaryFromExcerpt(excerpt, conflictingComponent, components) {
  const ex = (excerpt || "").trim();
  if (conflictingComponent === "amount" || components?.amount) {
    const m = ex.match(/\$[\d,.]+\s*(?:million|billion|m|bn|k)?/i) || ex.match(/\d+(?:\.\d+)?\s*%\s*(?:stake|ownership)?/i);
    if (m) return m[0].trim();
  }
  if (conflictingComponent === "target" || components?.target) {
    if (/large\s+merchants|for\s+large/i.test(ex)) return "large merchants";
  }
  return null;
}

/**
 * A6.49l: Editorial quantity-mismatch line (uses extractValueSummaryFromExcerpt + claim cues only).
 */
function buildQuantityMismatchEditorialParts(excerpt, claimText, components) {
  const ex = (excerpt || "").trim();
  const ct = (claimText || "").trim();
  const amountToken = extractValueSummaryFromExcerpt(ex, "amount", components) || "";
  const citesInvestorSurface = /\b(evaluating|investing|investment|up\s+to)\b/i.test(ex);
  let actualPhrase;
  if (citesInvestorSurface && amountToken) {
    actualPhrase = `an investment of up to ${amountToken}`;
  } else if (amountToken) {
    actualPhrase = `the ${amountToken}`;
  } else {
    actualPhrase = "a different funding figure";
  }
  const expectedPhrase = /\braised\b/i.test(ct) ? "total amount raised" : "total amount stated";
  const text = `The source refers to ${actualPhrase}, not the ${expectedPhrase} in the round.`;
  return { text, actualPhrase, expectedPhrase, templateUsed: "mismatch_editorial" };
}

function buildQuantityMismatchEditorialText(excerpt, claimText, components) {
  return buildQuantityMismatchEditorialParts(excerpt, claimText, components).text;
}

/**
 * A6.43 §4: Conflict evidence grouping. sideA / sideB by same keyValue.
 */
function buildConflictEvidence(evaluations, components, claimType, log, claimId) {
  const conflictEvs = evaluations.filter((e) => e.classification === "conflict" && !e.rejected && (e.conflictingComponents?.length > 0));
  if (conflictEvs.length === 0) return null;
  const conflictingComponent = conflictEvs[0]?.conflictingComponents?.[0] ?? "amount";
  const byValue = new Map();
  for (const ev of conflictEvs) {
    const excerpt = ev.candidate?.excerptText ?? "";
    const valueSummary = extractValueSummaryFromExcerpt(excerpt, conflictingComponent, components) || "unknown";
    const list = byValue.get(valueSummary) || [];
    list.push({
      refId: ev.candidate?.refId ?? null,
      excerptText: (excerpt && String(excerpt).trim()) ? String(excerpt).trim() : "",
      valueSummary,
    });
    byValue.set(valueSummary, list);
  }
  const sides = Array.from(byValue.entries());
  const sideA = (sides[0] && sides[0][1]) || [];
  const sideB = (sides[1] && sides[1][1]) || [];
  log("QC_V2_CONFLICT_GROUPING", { claimId, sideACount: sideA.length, sideBCount: sideB.length });
  return { conflictingComponent, sideA, sideB };
}

/**
 * A6.40 §15–16: Claim-level decision. conflict > full > partial > related > none. Credibility: rejected cannot trigger conflict.
 */
function claimLevelClassification(evaluations) {
  const hasCredibleConflict = evaluations.some((e) => e.classification === "conflict" && !e.rejected);
  if (hasCredibleConflict) return "conflict";
  const hasFull = evaluations.some((e) => e.classification === "full");
  if (hasFull) return "full";
  const hasPartial = evaluations.some((e) => e.classification === "partial");
  if (hasPartial) return "partial";
  const hasRelated = evaluations.some((e) => e.classification === "related");
  if (hasRelated) return "related";
  return "none";
}

/**
 * A6.42: Structured explanation payload (Bloomberg-style entity / relation / modifier).
 */
function buildQcExplanation(components, confirmedComponents, missingComponents, conflictingComponents, classification) {
  const entityStatus = confirmedComponents.includes("entity") ? "confirmed" : "missing";
  const relationStatus = confirmedComponents.includes("relation") ? "confirmed" : "missing";
  const hasModifier = !!(components?.target || components?.amount || components?.location || components?.timeframe || components?.certainty);
  const modifierStatus = !hasModifier ? "n_a" : (missingComponents.length > 0 ? "missing" : "confirmed");
  const contradictionStatus = conflictingComponents.length > 0 ? "conflicting" : "none";
  let evidenceSummary = "";
  if (classification === "full") evidenceSummary = "Confirmed by the source.";
  else if (classification === "partial") {
    const missingList = missingComponents.length > 0 ? missingComponents.join(", ") : "one or more modifiers";
    evidenceSummary = `Partially confirmed — ${missingList} not backed up by the source.`;
  } else if (classification === "related") evidenceSummary = "The source covers the topic but doesn't confirm this statement.";
  else if (classification === "none") evidenceSummary = "Not confirmed by any source.";
  else if (classification === "conflict") evidenceSummary = "The sources give conflicting information on this point.";
  return { entityStatus, relationStatus, modifierStatus, contradictionStatus, evidenceSummary };
}

/** A6.43 §7: Fixed explanation codes for commentary/hover. */
const EXPLANATION_CODES = Object.freeze(["FULL_CONFIRM", "PARTIAL_MODIFIER", "RELATED_CONTEXT", "NO_SUPPORT", "CONFLICT_VALUE"]);

function getExplanationCode(classification, confirmedComponents = [], missingComponents = [], conflictingComponents = []) {
  if (classification === "conflict") return "CONFLICT_VALUE";
  if (classification === "full") return "FULL_CONFIRM";
  if (classification === "partial") return "PARTIAL_MODIFIER";
  if (classification === "related") return "RELATED_CONTEXT";
  if (classification === "none") return "NO_SUPPORT";
  return "NO_SUPPORT";
}

/**
 * A6.43 §8: Controlled commentary from explanationCode only. No generic fallback.
 * A6.46: Superseded by buildPlainLanguageCommentary for claim-level card text; kept for item codes only.
 */
function buildCommentaryFromExplanationCode(explanationCode, conflictOpts = {}) {
  switch (explanationCode) {
    case "RELATED_CONTEXT":
      return "The source covers this subject but doesn't directly back up this statement. Check whether the source contains a more specific passage, or consider revising the claim.";
    case "PARTIAL_MODIFIER":
      return "The source supports the main point here, but the specific detail stated isn't confirmed. Either remove the detail or find a source that backs it up.";
    case "CONFLICT_VALUE":
      if (conflictOpts.valueA != null && conflictOpts.valueB != null) {
        return `The sources give different figures here — one says ${conflictOpts.valueA}, another says ${conflictOpts.valueB}. Clarify which is correct before publishing.`;
      }
      return "The sources don't agree on this point. Review the evidence and clarify which version is accurate.";
    case "NO_SUPPORT":
      return "Nothing in the provided sources backs up this statement. Either add a source that supports it or remove the claim.";
    case "FULL_CONFIRM":
      return "Supported by the source.";
    default:
      return "Nothing in the provided sources backs up this statement. Either add a source that supports it or remove the claim.";
  }
}

/** A6.46: Lead fragment of claim (before a limiting detail) for "what shows" / partial copy. */
function leadClaimFragment(claimText) {
  let t = (claimText || "").trim();
  if (!t) return "";
  if (/\bintended\s+for\b/i.test(t)) t = t.split(/\bintended\s+for\b/i)[0].trim();
  else if (/\bfor\s+large\s+merchants\b/i.test(t)) t = t.split(/\bfor\s+large\s+merchants\b/i)[0].trim();
  else if (/,/.test(t) && /\b(?:but|although)\b/i.test(t)) t = t.split(/\b(?:but|although)\b/i)[0].trim();
  else if (/,/.test(t)) t = t.split(",")[0].trim();
  return t.replace(/\.$/, "").replace(/^Later,?\s+/i, "").trim();
}

/** A6.46: Tail fragment for "what is not shown" (partial). */
function tailClaimFragment(claimText) {
  const t = (claimText || "").trim();
  if (!t) return null;
  if (/\bintended\s+for\b/i.test(t)) return t.slice(t.search(/\bintended\s+for\b/i)).replace(/\.$/, "").trim();
  if (/\bfor\s+large\s+merchants\b/i.test(t)) return t.slice(t.search(/\bfor\s+large\s+merchants\b/i)).replace(/\.$/, "").trim();
  return null;
}

/**
 * A6.48: Map structured signals → explanation type (priority: mismatch > partial > confirm > related > absence).
 */
function selectExplanationTypeFromSignals(signals) {
  const entityStatus = signals?.entityStatus ?? "missing";
  const relationStatus = signals?.relationStatus ?? "missing";
  const modifierStatus = signals?.modifierStatus ?? "n_a";
  const contradictionStatus = signals?.contradictionStatus ?? "none";
  const signalsUsed = { entityStatus, relationStatus, modifierStatus, contradictionStatus };

  if (contradictionStatus !== "none") {
    return { explanationType: "mismatch", priorityLevel: 1, signalsUsed };
  }
  if (entityStatus === "confirmed" && relationStatus === "confirmed" && modifierStatus === "missing") {
    return { explanationType: "partial", priorityLevel: 2, signalsUsed };
  }
  if (entityStatus === "confirmed" && relationStatus === "confirmed" && (modifierStatus === "confirmed" || modifierStatus === "n_a")) {
    return { explanationType: "confirm", priorityLevel: 2, signalsUsed };
  }
  if (entityStatus === "confirmed") {
    return { explanationType: "related", priorityLevel: 3, signalsUsed };
  }
  return { explanationType: "absence", priorityLevel: 4, signalsUsed };
}

/** A6.48: Supported-element phrases from confirmed components only (pattern-derived entity/relation labels allowed). */
function phrasesForSupportedElements(confirmedComponents, components) {
  const parts = [];
  if (confirmedComponents.includes("entity") && components?.entity) {
    parts.push(`information about ${components.entity}`);
  } else if (confirmedComponents.includes("entity")) {
    parts.push("the subject named in the sources");
  }
  if (confirmedComponents.includes("relation")) {
    parts.push(components?.relation ? `the relationship described (${components.relation})` : "the relationship described in the sources");
  }
  if (confirmedComponents.includes("amount") && components?.amount) {
    parts.push(`the figure ${components.amount}`);
  }
  return parts.length > 0 ? parts.join(" and ") : "material reflected in the sources";
}

/** A6.48: Missing-element phrases from missingComponents only (no claim substrings). */
function phrasesForMissingElements(missingComponents) {
  const miss = missingComponents || [];
  const parts = [];
  if (miss.includes("target_market")) parts.push("the target audience detail");
  if (miss.includes("projection_or_expectation")) parts.push("the outlook or expectation");
  if (miss.includes("amount")) parts.push("the funding figure as stated");
  if (miss.includes("location")) parts.push("the location as stated");
  if (parts.length === 0 && miss.length > 0) parts.push("additional material details");
  return parts.length > 0 ? parts.join(", ") : "the unstated material detail";
}

/** A6.49b: Tier 1–2 partial fragments must not use these abstract phrases. */
function partialFragmentsContainForbidden(supported, missing) {
  const bad = /\b(information about|relationship described|intended audience)\b/i;
  return bad.test(supported || "") || bad.test(missing || "");
}

/**
 * A6.49b §2: Tier 1 — entity + relation + object; modifier/target for missing when structured fields exist.
 */
function tryTier1TypedPartialFragments(claimText, components, missingComponents) {
  const ent = components?.entity?.trim();
  const rel = components?.relation;
  if (!ent || !rel) return null;
  const lower = claimText.toLowerCase();
  const relIdx = lower.indexOf(rel.toLowerCase());
  if (relIdx < 0) return null;
  let afterRel = claimText.slice(relIdx + rel.length).trim().replace(/^[,.\s]+/, "");
  const stop = /\b(?:intended\s+for|for\s+large|that|which)\b/i;
  const m = afterRel.match(stop);
  const objectPart = m ? afterRel.slice(0, m.index).trim().replace(/[.,;:\s]+$/u, "") : afterRel.split(/[.;]/)[0]?.trim() || "";
  if (!objectPart) return null;
  const supported = `${ent} ${rel} ${objectPart}`.replace(/\s+/g, " ").trim();
  let missing = null;
  if (missingComponents?.includes("target_market")) {
    const tail = tailClaimFragment(claimText);
    if (tail && /\bintended\s+for\b/i.test(tail)) {
      missing = tail.toLowerCase().startsWith("intended") ? `it was ${tail}` : tail;
    } else if (components?.target) {
      missing = components.target === "large merchants" ? "it was intended for large merchants" : `it was intended for ${components.target}`;
    } else {
      missing = "the target audience detail as stated";
    }
  } else {
    missing = phrasesForMissingElements(missingComponents);
  }
  if (partialFragmentsContainForbidden(supported, missing)) return null;
  return { supported, missing, fragmentSource: "typed_component" };
}

/**
 * A6.49b §2 Tier 2: compact deterministic fallback from subclaim text (max 10 words supported).
 */
function tryTier2CompactPartialFragments(claimText, components, missingComponents) {
  let t = (claimText || "").trim();
  const ent = components?.entity?.trim();
  if (ent && t.toLowerCase().startsWith(ent.toLowerCase())) {
    t = t.slice(ent.length).replace(/^[,.\s:]+/, "").trim();
  }
  if (!t) return null;
  const lower = t.toLowerCase();
  let breakIdx = -1;
  const candidates = [
    () => lower.search(/\bintended\b/i),
    () => lower.search(/\bthat\b/i),
    () => lower.search(/\bwhich\b/i),
    () => lower.search(/\bfor\s+large\s+merchants\b/i),
  ];
  for (const find of candidates) {
    const i = find();
    if (i >= 0 && (breakIdx < 0 || i < breakIdx)) breakIdx = i;
  }
  if (breakIdx <= 0) return null;
  const beforeRaw = t.slice(0, breakIdx).trim().replace(/[.,;:\s]+$/u, "");
  const afterRaw = t.slice(breakIdx).trim();
  const words = beforeRaw.split(/\s+/).filter(Boolean);
  const supported = words.slice(0, 10).join(" ");
  let missing = afterRaw;
  if (/^intended\s+for/i.test(missing)) {
    missing = `it was ${missing}`;
  } else if (/^for\s+large\s+merchants\b/i.test(missing)) {
    missing = `it was intended ${missing}`;
  } else if (/^for\s+/i.test(missing)) {
    missing = `it was intended ${missing}`;
  }
  if (!supported || !missing) return null;
  if (partialFragmentsContainForbidden(supported, missing)) return null;
  return { supported, missing, fragmentSource: "compact_fallback" };
}

/**
 * A6.49b §2 Tier 3 — last resort only (acceptance expects normal paths to avoid this).
 */
function tier3AbstractPartialFragments(missingComponents) {
  return {
    supported: "material reflected in the sources",
    missing: phrasesForMissingElements(missingComponents),
    fragmentSource: "abstract_fallback",
  };
}

function buildPartialConcreteExplanation(claimText, components, confirmedComponents, missingComponents) {
  const t1 = tryTier1TypedPartialFragments(claimText, components, missingComponents);
  if (t1) return t1;
  const t2 = tryTier2CompactPartialFragments(claimText, components, missingComponents);
  if (t2) return t2;
  return tier3AbstractPartialFragments(missingComponents);
}

/**
 * A6.48: Deterministic explanation from typed signals (no post-hoc sanitisation, no raw claim copy).
 */
function buildTypedExplanationFromSignals({
  qcExplanation,
  confirmedComponents,
  missingComponents,
  conflictingComponents,
  conflictOpts,
  components,
  downgradedForNoExcerpt,
  claimText,
}) {
  let { explanationType, priorityLevel, signalsUsed } = selectExplanationTypeFromSignals(qcExplanation);

  if (downgradedForNoExcerpt) {
    if (explanationType === "confirm") {
      explanationType = "absence";
      priorityLevel = 4;
    }
  }

  let text;
  let supportedFragment = null;
  let missingFragment = null;
  let fragmentSource = null;
  switch (explanationType) {
    case "mismatch":
      if (conflictOpts?.valueA != null && conflictOpts?.valueB != null) {
        text = `The sources describe ${conflictOpts.valueA}, not ${conflictOpts.valueB}.`;
      } else {
        text = "The sources don't give a single consistent reading here. Review the evidence and clarify before publishing.";
      }
      break;
    case "partial": {
      const concrete = buildPartialConcreteExplanation(
        claimText,
        components,
        confirmedComponents || [],
        missingComponents || [],
      );
      text = `The source confirms ${concrete.supported}, but it does not say ${concrete.missing}.`;
      supportedFragment = concrete.supported;
      missingFragment = concrete.missing;
      fragmentSource = concrete.fragmentSource;
      break;
    }
    case "confirm":
      text = "Supported by the source.";
      break;
    case "related":
      text = "The source covers related content but doesn't directly confirm this statement. Check for a more specific passage or consider revising.";
      break;
    case "absence":
    default:
      text = "Nothing in the provided sources backs up this statement. Either add a source that supports it or remove the claim.";
      break;
  }

  return {
    text,
    explanationType,
    priorityLevel,
    signalsUsed,
    supportedFragment,
    missingFragment,
    fragmentSource,
  };
}

/** A6.46: Per-citation popup sections (deterministic). A6.49l: relationship-aware + editorial quantity mismatch. */
function buildPopupSectionsForDisplayItem(item, claimText, claimLevelClassification, supportMismatch = null, components = null, popupDiag = null) {
  const ct = (claimText || "").trim();
  const code = item?.explanationCode;
  const ex = (item?.excerptText || "").trim();
  if (!ex) return { originalClaimText: ct, whatThisShows: null, whatIsNotShown: null };

  if (code === "CONFLICT_VALUE" && item.valueSummary) {
    return {
      originalClaimText: ct,
      whatThisShows: `Supports the ${item.valueSummary} reading.`,
      whatIsNotShown: null,
    };
  }

  const isQuantityMismatchPartial =
    isQuantityMismatchStructured(supportMismatch)
    && claimLevelClassification === "partial"
    && (code === "RELATED_CONTEXT" || code === "PARTIAL_MODIFIER");

  if (isQuantityMismatchPartial) {
    const parts = buildQuantityMismatchEditorialParts(ex, ct, components);
    const diagVerbose = typeof process !== "undefined" && process.env?.BRIGHTLINE_DIAG_VERBOSE === "1";
    if (diagVerbose && popupDiag?.log) {
      popupDiag.log("QC_V2_POPUP_MISMATCH_EDITORIAL", JSON.stringify({
        claimId: popupDiag.claimId ?? null,
        explanationType: "partial_mismatch",
        actualPhrase: parts.actualPhrase,
        expectedPhrase: parts.expectedPhrase,
        templateUsed: parts.templateUsed,
      }));
    }
    return { originalClaimText: ct, whatThisShows: parts.text, whatIsNotShown: null };
  }

  if (code === "FULL_CONFIRM" || item.classification === "full") {
    const lead = leadClaimFragment(ct) || ct.slice(0, 160).trim();
    const wts = lead ? `Shows that ${lead.replace(/\.$/, "")}.` : null;
    return { originalClaimText: ct, whatThisShows: wts, whatIsNotShown: null };
  }
  if (code === "PARTIAL_MODIFIER" || item.classification === "partial" || claimLevelClassification === "partial") {
    const lead = leadClaimFragment(ct);
    const tail = tailClaimFragment(ct);
    const wts = lead ? `Shows that ${lead.replace(/\.$/, "")}.` : null;
    const wns = tail ? `Does not say ${tail.endsWith(".") ? tail.slice(0, -1) : tail}.` : null;
    return { originalClaimText: ct, whatThisShows: wts, whatIsNotShown: wns };
  }
  if (code === "RELATED_CONTEXT" || item.classification === "related") {
    return {
      originalClaimText: ct,
      whatThisShows: null,
      whatIsNotShown: null,
    };
  }
  return {
    originalClaimText: ct,
    whatThisShows: null,
    whatIsNotShown: null,
  };
}

/**
 * A6.49b/c: ORIGINAL SENTENCE popup dedup — same rule as frontend StatementReviewCard (claim-level).
 * originalSentenceText: full sentence span; originalClaimText: atomic claim text.
 */
export function computeV2PopupOriginalSentenceDedup({
  originalSentenceText,
  originalClaimText,
  sentenceSubclaimCount,
}) {
  const ostRaw =
    originalSentenceText && String(originalSentenceText).trim()
      ? String(originalSentenceText).trim()
      : null;
  const octRaw = typeof originalClaimText === "string" ? originalClaimText.trim() : "";
  const subClaimN = sentenceSubclaimCount;

  let originalSentenceShown = false;
  let reason = "shown_multi_context";

  if (ostRaw && octRaw) {
    if (ostRaw === octRaw) {
      originalSentenceShown = false;
      reason = "exact_match";
    } else if (octRaw.length > 0 && ostRaw.includes(octRaw) && typeof subClaimN === "number" && subClaimN <= 2) {
      originalSentenceShown = false;
      reason = "contained_short_sentence";
    } else if (octRaw.length > 0 && ostRaw.includes(octRaw) && typeof subClaimN === "number" && subClaimN > 2) {
      originalSentenceShown = true;
      reason = "shown_multi_context";
    } else {
      originalSentenceShown = false;
      reason = "contained_short_sentence";
    }
  } else {
    originalSentenceShown = false;
    reason = "exact_match";
  }

  return { originalSentenceShown, reason };
}

function computeDisplayVerdictAndConcern(verdictPayload, classification) {
  if (verdictPayload === "conflicting_sources") {
    return { displayVerdict: "conflict", concernLevel: "high" };
  }
  if (verdictPayload === "confirmed" && classification === "full") {
    return { displayVerdict: "supported_full", concernLevel: "none" };
  }
  if (verdictPayload === "partially_confirmed" && classification === "partial") {
    return { displayVerdict: "supported_partial", concernLevel: "moderate" };
  }
  return { displayVerdict: "not_supported", concernLevel: "high" };
}

/** A6.47: Single source of truth for verdictPayload on exported authority (aligned with displayVerdict). */
function verdictPayloadFromDisplayVerdict(displayVerdict) {
  if (displayVerdict === "conflict") return "conflicting_sources";
  if (displayVerdict === "supported_full") return "confirmed";
  if (displayVerdict === "supported_partial") return "partially_confirmed";
  return "no_clear_support";
}

/** A6.47: Strip pipeline-only fields from display source rows before export. */
function sanitizeDisplaySourceItemForExport(item) {
  if (!item || typeof item !== "object") return item;
  return {
    refId: item.refId,
    sourceOrigin: item.sourceOrigin,
    displaySourceName: item.displaySourceName,
    displayTitle: item.displayTitle,
    rawTitle: item.rawTitle ?? null,
    citationIndex: item.citationIndex,
    excerptText: item.excerptText,
    originalClaimText: item.originalClaimText,
    whatThisShows: item.whatThisShows,
    whatIsNotShown: item.whatIsNotShown ?? null,
    whyItMattersText: item.whyItMattersText ?? null,
    valueSummary: item.valueSummary,
    explanationCode: item.explanationCode,
  };
}

/**
 * A6.47: Render-boundary authority — no classification, selectedExcerptDirectness, or qcExplanation.
 */
function buildExportedAuthority(params, log) {
  const {
    claimId,
    claimText,
    sentenceSpan,
    sentenceIndex,
    subclaimIndex,
    originalSentenceText,
    displayVerdict,
    concernLevel,
    commentaryPayload,
    displaySourceItems,
    selectedEvidence,
    selectedExcerptText,
    hoverPayload,
    conflictEvidence,
    hasUsableExcerpt,
    typedExplanationType,
  } = params;
  const verdictPayload = verdictPayloadFromDisplayVerdict(displayVerdict);
  const exported = {
    claimId,
    claimText,
    sentenceSpan,
    sentenceIndex,
    subclaimIndex,
    originalSentenceText,
    displayVerdict,
    concernLevel,
    commentaryPayload,
    displaySourceItems: (displaySourceItems || []).map(sanitizeDisplaySourceItemForExport),
    verdictPayload,
    hasUsableExcerpt: hasUsableExcerpt === true,
    typedExplanationType: typedExplanationType ?? null,
  };
  if (selectedEvidence && selectedExcerptText) {
    exported.selectedEvidence = selectedEvidence;
    exported.selectedExcerptText = selectedExcerptText;
  } else {
    exported.selectedEvidence = null;
    exported.selectedExcerptText = null;
  }
  if (hoverPayload && hasUsableExcerpt === true) {
    exported.hoverPayload = hoverPayload;
  } else {
    exported.hoverPayload = null;
  }
  if (displayVerdict === "conflict" && conflictEvidence) {
    exported.conflictEvidence = conflictEvidence;
  }
  const exportedFields = Object.keys(exported);
  log("QC_V2_AUTHORITY_EXPORT", JSON.stringify({
    claimId,
    exportedFields,
    containsInternalFields: false,
  }));
  log("QC_V2_AGGREGATION_INPUT", JSON.stringify({
    claimId,
    displayVerdict,
  }));
  return exported;
}


/**
 * A6.42 §4 / A6.43: Commentary. When conflictOpts provided use CONFLICT_VALUE template; else explanationCode templates.
 */
function buildCommentaryFromExplanation(classification, components, qcExplanation, conflictingComponents = [], conflictOpts = {}) {
  const explanationCode = getExplanationCode(classification, null, null, conflictingComponents);
  if (classification === "conflict" && conflictOpts.valueA != null && conflictOpts.valueB != null) {
    return buildCommentaryFromExplanationCode("CONFLICT_VALUE", {
      component: (conflictingComponents && conflictingComponents[0]) || "value",
      valueA: conflictOpts.valueA,
      valueB: conflictOpts.valueB,
    });
  }
  return buildCommentaryFromExplanationCode(explanationCode, conflictOpts);
}

/**
 * A6.49e: Title-only synthetic excerpt (ref title slice) must not qualify mismatch-backed partial.
 */
function isTitleOnlySyntheticExcerpt(candidate, refsById) {
  const ref = refsById.get(String(candidate?.refId ?? ""));
  const title = (ref?.title || "").trim();
  const ex = (candidate?.excerptText || "").trim();
  if (!title || !ex) return false;
  const slice300 = title.slice(0, Math.min(300, title.length));
  return ex === slice300 || ex === title;
}

/**
 * A6.49e / A6.49k: Quantity-type mismatch (meta or inferred). Non-direct supportBindings do not
 * short-circuit; only direct confirming bindings skip heuristic inference.
 */
function inferQuantityTypeMismatch(stmt, claimText, uploadedDocs, claim, directSupportingBindingsCount) {
  const fromMeta = stmt.meta?.supportMismatch;
  if (fromMeta?.kind != null && typeof fromMeta.explanation === "string" && fromMeta.explanation.trim()) {
    return fromMeta;
  }
  const bindings = Array.isArray(stmt.evidenceBundle?.supportBindings) ? stmt.evidenceBundle.supportBindings : [];
  const directCount =
    typeof directSupportingBindingsCount === "number"
      ? directSupportingBindingsCount
      : countDirectSupportingBindings(bindings, claim, claimText);
  if (directCount >= 1) return null;
  const canonicalClaimsArr = Array.isArray(stmt.assessment?.canonicalClaims) ? stmt.assessment.canonicalClaims : [];
  const moneyTypes = new Set(["investment_amount", "metric_amount", "valuation"]);
  const hasMoneyClaim = canonicalClaimsArr.some((cc) => {
    const t = (cc?.type && String(cc.type).trim().toLowerCase()) || "";
    return moneyTypes.has(t) || t.startsWith("valuation_");
  });
  const STATEMENT_CUES = ["raised", "financing round", "round", "series"];
  const stmtLower = (claimText || "").toLowerCase();
  const hasStatementCue = STATEMENT_CUES.some((cue) => stmtLower.includes(cue));
  const SOURCE_CUES = ["investing", "investment", "evaluating", "up to"];
  const docs = Array.isArray(uploadedDocs) ? uploadedDocs : [];
  const allSourceText = docs.map((d) => (d && typeof d.text === "string" ? d.text : "")).join(" ");
  const sourceLower = allSourceText.toLowerCase();
  const hasSourceCue = SOURCE_CUES.some((cue) => sourceLower.includes(cue));
  if (!hasMoneyClaim || !hasStatementCue || !hasSourceCue) return null;
  return {
    kind: "quantity_type_mismatch",
    quantityA: "round_size_raised",
    quantityB: "investor_investment_amount",
    /** Card/popup copy: buildQuantityMismatchEditorialText (A6.49l); field kept for schema compatibility. */
    explanation: "",
  };
}

function mismatchPartialEvaluationsOk(evaluations, refsById, components, claimType, gateLog = null, supportMismatch = null) {
  return evaluations.some((ev) => {
    if (ev.rejected) return false;
    const c = ev.candidate;
    if (!c?.excerptText?.trim()) return false;
    if (isTitleOnlySyntheticExcerpt(c, refsById)) return false;
    if (!passesExcerptQualityGate(ev, components, claimType, refsById, gateLog, supportMismatch)) return false;
    if (ev.classification === "none") return false;
    return ev.classification === "related" || ev.classification === "partial";
  });
}

/**
 * A6.43 §9: WHY IT MATTERS from explanationCode. Conflict: "Supports \"$X\" reading".
 */
function buildWhyItMattersFromExplanation(explanationCode, valueSummary = null) {
  if (explanationCode === "CONFLICT_VALUE" && valueSummary) return `Supports the ${valueSummary} figure.`;
  if (explanationCode === "FULL_CONFIRM") return "Confirmed by the source.";
  if (explanationCode === "PARTIAL_MODIFIER") return "Main point confirmed — but the specific detail isn't backed up.";
  if (explanationCode === "RELATED_CONTEXT") return "Covers the topic but doesn't confirm this specific statement.";
  if (explanationCode === "NO_SUPPORT") return "Not confirmed by any source.";
  if (explanationCode === "CONFLICT_VALUE") return "Supports one side of the disagreement.";
  return "Not confirmed by any source.";
}

/**
 * A6.43 §8: Commentary from explanationCode only. conflictOpts: { valueA, valueB } for CONFLICT_VALUE.
 */
function buildCommentaryTemplates(classification, missingComponents = [], components = null, qcExplanation = null, conflictingComponents = [], conflictOpts = {}) {
  return buildCommentaryFromExplanation(classification, components, qcExplanation, conflictingComponents, conflictOpts);
}

/**
 * A6.40 §20: Hover payload.
 */
function buildHoverPayload(classification, selectedEvidence, selectedExcerptText, whyItMattersText, originalSentenceText) {
  const fallbackWhy =
    whyItMattersText
    ?? (classification === "full"
      ? "Confirmed by the source."
      : classification === "partial"
        ? "Main point confirmed — but the specific detail isn't backed up."
        : "Not confirmed by any source.");
  return {
    sourceLabelType: selectedEvidence?.sourceOrigin === "web" ? "WEB SEARCH" : "SOURCE",
    displaySourceName: (selectedEvidence?.displayTitle && String(selectedEvidence.displayTitle).trim()) || "Source",
    excerptText: selectedExcerptText ?? "",
    whyItMattersText: fallbackWhy,
    originalSentenceText: originalSentenceText ?? "",
  };
}

/**
 * A6.40: Run QC V2 pipeline. Input: statements with assessment.canonicalClaims. Output: statements with meta.qcEvidenceAuthorities.
 * Legacy evidenceBundle is used only as candidate source; classification is V2-only.
 */
export function runQcV2Pipeline(statements, context) {
  const {
    unifiedReferences = [],
    uploadedLen = 0,
    assignCredibilityTier = () => "LOW",
    runId = null,
    reqSig = null,
    uploadedDocs: contextUploadedDocs = [],
  } = context || {};
  const refsById = new Map();
  (unifiedReferences || []).forEach((r) => { if (r?.id != null) refsById.set(String(r.id), r); });
  const log = (name, payload) => {
    if (typeof payload === "string") console.log(name, payload);
    else console.log(name, JSON.stringify(payload));
  };
  for (let idx = 0; idx < (statements || []).length; idx++) {
    const stmt = statements[idx];
    if (!stmt || typeof stmt !== "object") continue;
    if (stmt.__dealTermsCanonical === true) {
      const preview = (typeof stmt.text === "string" ? stmt.text : "").slice(0, 60);
      console.log(`[A6.50h] skipping QC authority emission for dealTermsCanonical statement: ${preview}`);
      stmt.meta = { ...(stmt.meta || {}), qcEvidenceAuthorities: [] };
      continue;
    }
    const canonicalClaims = Array.isArray(stmt?.assessment?.canonicalClaims) ? stmt.assessment.canonicalClaims : [];
    const sentenceSpan = (typeof stmt.text === "string" ? stmt.text : "").trim();
    const originalSentenceText = sentenceSpan;
    if (canonicalClaims.length === 0) {
      log("QC_V2_ZERO_CLAIM_SENTENCE", { statementIndex: idx, statementPreview: sentenceSpan.substring(0, 80) });
      stmt.meta = { ...(stmt.meta || {}), qcEvidenceAuthorities: [] };
      continue;
    }
    const authorities = [];
    for (let cIdx = 0; cIdx < canonicalClaims.length; cIdx++) {
      const claim = canonicalClaims[cIdx];
      if (!claim || typeof claim !== "object") continue;
      const claimId = claim.id ?? `claim_${idx}_${cIdx}`;
      const claimText = claim.displayText || sentenceSpan;
      const claimType = detectClaimType(claimText, (name, payload) => log(name, payload));
      const components = deriveComponents(claimText);
      const candidates = getCandidatesForClaim(stmt, claim, refsById, uploadedLen, assignCredibilityTier, { log, claimId });
      const webCandCount = candidates.filter((c) => c.sourceOrigin === "web").length;
      if (webCandCount > 0) log("QC_V2_WEB_FILTER", { claimId, webCandidatesIncluded: webCandCount });
      const evaluations = candidates.map((c) => {
        const ev = evaluateCandidate(claimText, claimType, components, c, assignCredibilityTier, claimId);
        const score = scoreExcerpt(components, c?.excerptText, ev, claimType);
        log("QC_V2_EXCERPT_SCORE", { claimId, refId: c?.refId ?? null, excerptScore: score, selected: false });
        return { candidate: c, ...ev, excerptScore: score };
      });
      log("QC_V2_CANDIDATE_EVALUATION", { claimId, claimPreview: claimText.substring(0, 60), candidateCount: candidates.length, evaluations: evaluations.map((e) => ({ refId: e.candidate?.refId, classification: e.classification })) });
      const classification = claimLevelClassification(evaluations);
      const uploadedDocsForMismatch = Array.isArray(contextUploadedDocs) ? contextUploadedDocs : [];
      const supportBindingsArr = Array.isArray(stmt.evidenceBundle?.supportBindings) ? stmt.evidenceBundle.supportBindings : [];
      const {
        supportBindingsLength,
        directSupportingBindingsCount,
        mismatchCompatibleBindingsCount,
        placeholderBindingsCount,
      } = countBindingPolicyMetrics(supportBindingsArr, claim, claimText);
      const supportMismatchEffective = inferQuantityTypeMismatch(
        stmt,
        claimText,
        uploadedDocsForMismatch,
        claim,
        directSupportingBindingsCount,
      );
      const { quantityMismatchInferenceSkipped, skipReason } = computeQuantityMismatchInferencePolicy({
        directSupportingBindingsCount,
        metaSupportMismatch: stmt.meta?.supportMismatch,
        supportMismatchEffective,
      });
      /** A6.49n: mismatch-compatible alone is insufficient — requires structured quantity mismatch + excerpt-backed partial path. */
      const mismatchPartialEligible =
        classification !== "conflict"
        && isQuantityMismatchStructured(supportMismatchEffective)
        && mismatchPartialEvaluationsOk(evaluations, refsById, components, claimType, { log, claimId }, supportMismatchEffective);
      const diagVerbosePolicy = typeof process !== "undefined" && process.env?.BRIGHTLINE_DIAG_VERBOSE === "1";
      if (diagVerbosePolicy) {
        log("QC_V2_MISMATCH_BINDING_POLICY", JSON.stringify({
          claimId,
          supportBindings: supportBindingsArr.length,
          supportBindingsLength,
          directSupportingBindingsCount,
          mismatchCompatibleBindingsCount,
          placeholderBindingsCount,
          quantityMismatchInferenceSkipped,
          skipReason,
          mismatchPartialEligible,
        }));
      }
      const verdictBasisClassification =
        classification === "conflict"
          ? "conflict"
          : mismatchPartialEligible && (classification === "related" || classification === "none")
            ? "partial"
            : classification;
      if (mismatchPartialEligible) {
        log("QC_V2_MISMATCH_PARTIAL", { claimId, fromClassification: classification, verdictBasisClassification });
      }
      const originalClassification = classification;
      const sameClass = evaluations.filter((e) => e.classification === classification);
      const best = sameClass.length > 0
        ? sameClass.reduce((a, b) => {
            if ((b.excerptScore ?? -99) > (a.excerptScore ?? -99)) return b;
            if ((b.excerptScore ?? -99) < (a.excerptScore ?? -99)) return a;
            const lenA = (a.candidate?.excerptText || "").length;
            const lenB = (b.candidate?.excerptText || "").length;
            return lenB < lenA ? b : a;
          })
        : evaluations.find((e) => e.classification === "related") || evaluations[0];
      if (best) log("QC_V2_EXCERPT_SCORE", { claimId, refId: best.candidate?.refId ?? null, excerptScore: best.excerptScore ?? null, selected: true });
      const selectedCandidate = best?.candidate ?? null;
      const selectedExcerptText = selectedCandidate?.excerptText ?? null;
      const selectedExcerptReason = selectedCandidate ? "proposition_match" : "no_direct_excerpt";
      const confirmedComponents = best?.confirmedComponents ?? [];
      const missingComponents = best?.missingComponents ?? [];
      const conflictingComponents = best?.conflictingComponents ?? [];
      const conflictEvidence = classification === "conflict" ? buildConflictEvidence(evaluations, components, claimType, log, claimId) : null;
      const conflictOpts = conflictEvidence && conflictEvidence.sideA?.length && conflictEvidence.sideB?.length
        ? { component: conflictEvidence.conflictingComponent ?? "amount", valueA: conflictEvidence.sideA[0]?.valueSummary ?? "one value", valueB: conflictEvidence.sideB[0]?.valueSummary ?? "another value" }
        : {};
      const evidenceOrigin = !selectedCandidate ? "none" : (selectedCandidate.sourceOrigin === "web" ? "web" : "uploaded");
      let verdictPayload =
        verdictBasisClassification === "conflict"
          ? "conflicting_sources"
          : verdictBasisClassification === "full"
            ? "confirmed"
            : verdictBasisClassification === "partial"
              ? "partially_confirmed"
              : "no_clear_support";
      const qcExplanation = buildQcExplanation(components, confirmedComponents, missingComponents, conflictingComponents, verdictBasisClassification);
      log("QC_V2_EXPLANATION_BUILD", { claimId, entityStatus: qcExplanation.entityStatus, relationStatus: qcExplanation.relationStatus, modifierStatus: qcExplanation.modifierStatus, contradictionStatus: qcExplanation.contradictionStatus });
      const displaySourceItems = [];
      evaluations.forEach((ev) => {
        const c = ev.candidate;
        const excerptText = (c?.excerptText && String(c.excerptText).trim()) ? String(c.excerptText).trim() : "";
        log("QC_V2_CITATION_EXCERPT", { claimId, refId: c?.refId ?? null, hasExcerpt: !!excerptText });
        if (!excerptText) return;
        if (!passesExcerptQualityGate(ev, components, claimType, refsById, { log, claimId }, supportMismatchEffective)) {
          log("QC_V2_CITATION_FILTER", { claimId, refId: c?.refId ?? null, filteredReason: "excerpt_quality_gate" });
          return;
        }
        const itemCode = getExplanationCode(ev.classification, ev.confirmedComponents, ev.missingComponents, ev.conflictingComponents);
        const itemValueSummary = ev.classification === "conflict" ? extractValueSummaryFromExcerpt(excerptText, ev.conflictingComponents?.[0], components) : null;
        const itemWhyItMatters = buildWhyItMattersFromExplanation(itemCode, itemValueSummary);
        displaySourceItems.push({
          refId: c.refId,
          sourceOrigin: c.sourceOrigin,
          displaySourceName: c.displayTitle ?? `Source [${displaySourceItems.length + 1}]`,
          displayTitle: c.displayTitle ?? `Source [${displaySourceItems.length + 1}]`,
          rawTitle: c.rawTitle ?? null,
          citationIndex: displaySourceItems.length,
          excerptText,
          classification: ev.classification,
          confirmedComponents: ev.confirmedComponents ?? [],
          missingComponents: ev.missingComponents ?? [],
          conflictingComponents: ev.conflictingComponents ?? [],
          whyItMattersText: itemWhyItMatters,
          explanationCode: itemCode,
          valueSummary: itemValueSummary ?? undefined,
        });
      });
      if (classification === "conflict" && conflictEvidence && displaySourceItems.length > 0) {
        const refIdsIn = new Set(displaySourceItems.map((i) => String(i?.refId ?? "")));
        for (const side of [conflictEvidence.sideA, conflictEvidence.sideB]) {
          for (const entry of side || []) {
            if (!entry?.refId || refIdsIn.has(String(entry.refId))) continue;
            const cand = evaluations.find((e) => String(e.candidate?.refId) === String(entry.refId))?.candidate;
            const displayName = cand?.displayTitle ?? `Source [${displaySourceItems.length + 1}]`;
            const whyItMatters = buildWhyItMattersFromExplanation("CONFLICT_VALUE", entry.valueSummary || null);
            displaySourceItems.push({
              refId: entry.refId,
              sourceOrigin: cand?.sourceOrigin ?? "uploaded",
              displaySourceName: displayName,
              displayTitle: displayName,
              rawTitle: cand?.rawTitle ?? null,
              citationIndex: displaySourceItems.length,
              excerptText: entry.excerptText || "",
              classification: "conflict",
              confirmedComponents: [],
              missingComponents: [],
              conflictingComponents: conflictEvidence.conflictingComponent ? [conflictEvidence.conflictingComponent] : [],
              whyItMattersText: whyItMatters,
              explanationCode: "CONFLICT_VALUE",
              valueSummary: entry.valueSummary ?? undefined,
            });
            refIdsIn.add(String(entry.refId));
          }
        }
      }
      // A6.46 / A6.49e: Suppress related/none display rows unless quantity mismatch + excerpt-backed partial path applies.
      if ((classification === "related" || classification === "none") && !mismatchPartialEligible) {
        displaySourceItems.length = 0;
      }
      // A6.46: Conflict cards — only sources that sit on a disagreement side with a usable excerpt.
      if (classification === "conflict" && conflictEvidence) {
        const conflictRefSet = new Set();
        for (const side of [conflictEvidence.sideA, conflictEvidence.sideB]) {
          for (const e of side || []) {
            if (e?.refId != null && e.excerptText && String(e.excerptText).trim()) {
              conflictRefSet.add(String(e.refId));
            }
          }
        }
        if (conflictRefSet.size > 0) {
          const onlyConflictSides = displaySourceItems.filter((i) => conflictRefSet.has(String(i.refId)));
          displaySourceItems.length = 0;
          displaySourceItems.push(...onlyConflictSides);
        }
      }
      if (displaySourceItems.length > 5) displaySourceItems.length = 5;
      const enrichedItems = [];
      for (const raw of displaySourceItems) {
        const popup = buildPopupSectionsForDisplayItem(
          raw,
          claimText,
          verdictBasisClassification,
          mismatchPartialEligible ? supportMismatchEffective : null,
          components,
          { log, claimId },
        );
        if (!popup.whatThisShows) continue;
        enrichedItems.push({
          ...raw,
          originalClaimText: popup.originalClaimText,
          whatThisShows: popup.whatThisShows,
          whatIsNotShown: popup.whatIsNotShown,
        });
      }
      displaySourceItems.length = 0;
      displaySourceItems.push(...enrichedItems);
      // A6.47: Citation integrity — drop rows missing excerpt or whatThisShows (non-downgraded path only).
      const integrityFiltered = displaySourceItems.filter((i) =>
        i.excerptText && String(i.excerptText).trim()
        && i.whatThisShows && String(i.whatThisShows).trim(),
      );
      displaySourceItems.length = 0;
      displaySourceItems.push(...integrityFiltered);

      // A6.47: hasUsableExcerpt AFTER popup enrichment, BEFORE verdict eligibility
      let hasUsableExcerpt = displaySourceItems.length > 0;
      const downgradeIfNoExcerpt = new Set(["full", "partial", "conflict", "related"]);
      let effectiveClassification = verdictBasisClassification;
      let conflictEvidenceOut = conflictEvidence;
      let downgradedForNoExcerpt = false;
      if (!hasUsableExcerpt && downgradeIfNoExcerpt.has(originalClassification)) {
        downgradedForNoExcerpt = true;
        effectiveClassification = "none";
        verdictPayload = "no_clear_support";
        conflictEvidenceOut = null;
        displaySourceItems.length = 0;
        hasUsableExcerpt = false;
        log("QC_V2_DOWNGRADE_APPLIED", JSON.stringify({
          claimId,
          originalClassification,
          downgradedTo: "not_supported",
          clearedEvidence: true,
        }));
      }
      const typedExplanation = buildTypedExplanationFromSignals({
        qcExplanation,
        confirmedComponents,
        missingComponents,
        conflictingComponents,
        conflictOpts,
        components,
        downgradedForNoExcerpt,
        claimText,
      });
      let commentaryPayload = typedExplanation.text;
      if (!downgradedForNoExcerpt && mismatchPartialEligible && supportMismatchEffective?.kind) {
        const exFor =
          (displaySourceItems[0]?.excerptText && String(displaySourceItems[0].excerptText).trim())
          || selectedExcerptText
          || "";
        commentaryPayload = buildQuantityMismatchEditorialText(exFor, claimText, components);
      }
      log("QC_V2_EXPLANATION_SELECTED", JSON.stringify({
        claimId,
        explanationType: typedExplanation.explanationType,
        priorityLevel: typedExplanation.priorityLevel,
        signalsUsed: typedExplanation.signalsUsed,
      }));
      if (typedExplanation.explanationType === "partial") {
        log("QC_V2_PARTIAL_FRAGMENT_BUILD", JSON.stringify({
          claimId,
          supportedFragment: typedExplanation.supportedFragment,
          missingFragment: typedExplanation.missingFragment,
          fragmentSource: typedExplanation.fragmentSource,
        }));
      }
      const explanationCode = getExplanationCode(effectiveClassification, confirmedComponents, missingComponents, conflictingComponents);
      log("QC_V2_COMMENTARY_CODE", { claimId, explanationCode });
      const primaryValueSummary = effectiveClassification === "conflict" && selectedCandidate
        ? extractValueSummaryFromExcerpt(selectedExcerptText, conflictingComponents[0], components)
        : null;
      const whyItMattersText = buildWhyItMattersFromExplanation(explanationCode, primaryValueSummary);
      const mayShowSelectedEvidence =
        hasUsableExcerpt
        && selectedCandidate
        && !downgradedForNoExcerpt
        && effectiveClassification !== "related"
        && effectiveClassification !== "none";
      let authoritySelectedEvidence = mayShowSelectedEvidence ? {
        refId: selectedCandidate.refId,
        sourceType: selectedCandidate.sourceOrigin === "web" ? "web_search" : "uploaded",
        title: selectedCandidate.displayTitle,
        url: refsById.get(String(selectedCandidate.refId))?.url ?? null,
      } : null;
      let authoritySelectedExcerptText = mayShowSelectedEvidence ? selectedExcerptText : null;

      let hoverPayload = null;
      if (!downgradedForNoExcerpt && authoritySelectedEvidence && authoritySelectedExcerptText) {
        hoverPayload = buildHoverPayload(
          effectiveClassification,
          selectedCandidate ? { ...selectedCandidate, displayTitle: selectedCandidate.displayTitle } : null,
          authoritySelectedExcerptText,
          whyItMattersText,
          originalSentenceText,
        );
      }
      const { displayVerdict, concernLevel } = computeDisplayVerdictAndConcern(verdictPayload, effectiveClassification);
      log("QC_V2_VERDICT_ELIGIBILITY", JSON.stringify({
        claimId,
        classification: effectiveClassification,
        hasUsableExcerpt,
        displayVerdict,
      }));
      log("QC_V2_CONCERN_ASSIGNMENT", JSON.stringify({
        claimId,
        displayVerdict,
        concernLevel,
      }));
      for (const item of displaySourceItems) {
        log("QC_V2_POPUP_BUILD", JSON.stringify({
          claimId,
          refId: item?.refId ?? null,
          hasOriginalClaim: !!(item?.originalClaimText && String(item.originalClaimText).trim()),
          hasExcerpt: !!(item?.excerptText && String(item.excerptText).trim()),
          hasWhatThisShows: !!(item?.whatThisShows && String(item.whatThisShows).trim()),
          hasWhatIsNotShown: !!(item?.whatIsNotShown && String(item.whatIsNotShown).trim()),
        }));
      }
      const sentenceSubclaimCountForDedup =
        typeof stmt.sentence_subclaim_count === "number"
          ? stmt.sentence_subclaim_count
          : canonicalClaims.length;
      const popupDedup = computeV2PopupOriginalSentenceDedup({
        originalSentenceText,
        originalClaimText: claimText,
        sentenceSubclaimCount: sentenceSubclaimCountForDedup,
      });
      log("QC_V2_POPUP_DEDUP", JSON.stringify({
        claimId,
        originalSentenceShown: popupDedup.originalSentenceShown,
        reason: popupDedup.reason,
      }));
      const authority = buildExportedAuthority({
        claimId,
        claimText,
        sentenceSpan,
        sentenceIndex: idx,
        subclaimIndex: cIdx,
        originalSentenceText,
        displayVerdict,
        concernLevel,
        commentaryPayload,
        displaySourceItems,
        selectedEvidence: authoritySelectedEvidence,
        selectedExcerptText: authoritySelectedExcerptText,
        hoverPayload,
        conflictEvidence: conflictEvidenceOut,
        hasUsableExcerpt,
        typedExplanationType: typedExplanation.explanationType,
      }, log);
      authorities.push(authority);
      log("QC_V2_AUTHORITY_BUILD", { claimId, displayVerdict: authority.displayVerdict, hasUsableExcerpt: authority.hasUsableExcerpt });
      log("QC_V2_COMMENTARY_BUILD", { claimId, commentaryPreview: (commentaryPayload || "").substring(0, 60) });
      log("QC_V2_HOVER_BUILD", { claimId, hasHoverPayload: !!(authority.hoverPayload && Object.keys(authority.hoverPayload).length) });
    }
    stmt.meta = { ...(stmt.meta || {}), qcEvidenceAuthorities: authorities };
  }
  return statements;
}
