// lib/qc/qc-v2-pipeline.mjs
// A6.40: QC V2 — deterministic pipeline from atomic claims. Single matcher, proposition-level matching, rule-based commentary.

import { corePropositionConfirmed } from "./evidence-relationship.mjs";

/** Claim types (rule-based). */
export const CLAIM_TYPES = Object.freeze([
  "numeric_finance",
  "launch_or_product",
  "qualitative_corporate_fact",
  "market_or_industry_trend",
  "expectation_or_projection",
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
  const relationPhrases = ["founded in", "founded", "based in", "headquartered", "launched", "launch", "announced", "acquired", "raised", "released", "introduced", "expects", "anticipates", "forecast"];
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
 * Build candidate list for one claim from statement's evidence bundle and corpus result.
 */
function getCandidatesForClaim(statement, claim, refsById, uploadedLen, assignCredibilityTier) {
  const claimCites = Array.isArray(claim?.citations) ? claim.citations : [];
  const corpusResult = statement.meta?._evidenceBundleCorpusResult ?? null;
  const hits = (corpusResult?.found && Array.isArray(corpusResult.hits)) ? corpusResult.hits : [];
  const hitsByDocId = new Map();
  hits.forEach((h) => { if (h?.docId != null) hitsByDocId.set(String(h.docId), h); });
  const bindings = Array.isArray(statement.evidenceBundle?.supportBindings) ? statement.evidenceBundle.supportBindings : [];
  const bindingByRefId = new Map();
  bindings.forEach((b) => { if (b?.refId != null) bindingByRefId.set(String(b.refId), b); });
  const candidates = [];
  for (const cid of claimCites) {
    const refId = cid != null ? String(cid) : null;
    if (!refId || !refsById.has(refId)) continue;
    const ref = refsById.get(refId);
    const isWeb = (Number(refId) || 0) > uploadedLen || ref?.type === "web" || ref?.sourceType === "web_search";
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
      const hit = hitsByDocId.get(refId);
      if (hit?.excerpt && String(hit.excerpt).trim()) excerpt = String(hit.excerpt).trim();
      else {
        const binding = bindingByRefId.get(refId);
        if (binding?.excerpt && String(binding.excerpt).trim() && binding.excerpt !== "(excerpt not captured)") excerpt = String(binding.excerpt).trim();
      }
      if (!excerpt && ref?.title) excerpt = (ref.title || "").slice(0, 300);
      if (excerpt) {
        candidates.push({
          refId,
          rawTitle: ref?.title ?? "Untitled source",
          displayTitle: ref?.title ?? "Untitled source",
          sourceOrigin: "uploaded",
          excerptText: excerpt,
          credibilityTier: "HIGH",
          url: ref?.url ?? null,
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
 */
function passesExcerptQualityGate(ev, components, claimType) {
  const cc = ev.confirmedComponents ?? [];
  const miss = ev.missingComponents ?? [];
  const conflict = ev.conflictingComponents ?? [];
  const hasEntity = cc.includes("entity");
  const hasRelation = cc.includes("relation");
  const hasKeyValue = cc.includes("amount");
  if (hasEntity && hasRelation) return true;
  const keyVal = getKeyValue(components, claimType);
  if (keyVal && hasEntity && hasKeyValue) return true;
  if (conflict.length > 0) {
    const excerpt = (ev.candidate?.excerptText || "").trim();
    if (/\$[\d,.]+\s*(?:million|billion|m|bn)?|\d+(?:\.\d+)?\s*%/.test(excerpt)) return true;
  }
  if (miss.length > 0 && (hasEntity || hasRelation)) return true;
  return false;
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
    if (excerpt.includes(components.amount) || excerpt.replace(/,/g, "").includes((components.amount || "").replace(/,/g, ""))) confirmedComponents.push("amount");
    else if (/\$[\d,.]+\s*(?:million|billion|m|bn)?|\d+(?:\.\d+)?\s*%/.test(excerpt)) {
      conflictingComponents.push("amount");
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
  return { confirmedComponents, missingComponents, conflictingComponents, classification, rejected };
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
  if (classification === "full") evidenceSummary = "The source confirms the entity, relation, and modifiers.";
  else if (classification === "partial") {
    const missingList = missingComponents.length > 0 ? missingComponents.join(", ") : "one or more modifiers";
    evidenceSummary = `Launch confirmed but ${missingList} not specified.`;
  } else if (classification === "related") evidenceSummary = "The source discusses the topic but does not confirm the claim.";
  else if (classification === "none") evidenceSummary = "No source confirms this claim.";
  else if (classification === "conflict") evidenceSummary = "Sources disagree on one or more components.";
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
 */
function buildCommentaryFromExplanationCode(explanationCode, conflictOpts = {}) {
  switch (explanationCode) {
    case "RELATED_CONTEXT":
      return "The source discusses the same topic but does not confirm the specific claim.";
    case "PARTIAL_MODIFIER":
      return "The source confirms the core claim but does not support the stated modifier.";
    case "CONFLICT_VALUE":
      if (conflictOpts.valueA != null && conflictOpts.valueB != null) {
        const comp = conflictOpts.component === "amount" ? "funding amount" : conflictOpts.component === "target" ? "target market" : (conflictOpts.component || "value");
        return `Sources disagree on the ${comp}. One source indicates ${conflictOpts.valueA}, while another indicates ${conflictOpts.valueB}.`;
      }
      return "Sources disagree on this point.";
    case "NO_SUPPORT":
      return "No source confirms this claim.";
    case "FULL_CONFIRM":
      return "The source confirms the claim.";
    default:
      return "No source confirms this claim.";
  }
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
 * A6.43 §9: WHY IT MATTERS from explanationCode. Conflict: "Supports \"$X\" reading".
 */
function buildWhyItMattersFromExplanation(explanationCode, valueSummary = null) {
  if (explanationCode === "CONFLICT_VALUE" && valueSummary) return `Supports "${valueSummary}" reading`;
  if (explanationCode === "FULL_CONFIRM") return "Directly confirms the claim.";
  if (explanationCode === "PARTIAL_MODIFIER") return "Confirms the core claim but not the stated modifier.";
  if (explanationCode === "RELATED_CONTEXT") return "Discusses the topic but does not confirm the specific claim.";
  if (explanationCode === "NO_SUPPORT") return "No source confirms this claim.";
  if (explanationCode === "CONFLICT_VALUE") return "Supports one side of the conflict.";
  return "See commentary.";
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
  return {
    sourceLabelType: selectedEvidence?.sourceOrigin === "web" ? "WEB SEARCH" : "SOURCE",
    displaySourceName: (selectedEvidence?.displayTitle && String(selectedEvidence.displayTitle).trim()) || "Source",
    excerptText: selectedExcerptText ?? "",
    whyItMattersText: whyItMattersText ?? (classification === "full" ? "Directly confirms this claim." : classification === "partial" ? "Confirms part of this claim." : "See commentary."),
    originalSentenceText: originalSentenceText ?? "",
  };
}

/**
 * A6.40 §17 / A6.42 / A6.43: Authority object (single source of truth per claim). Includes qcExplanation and conflictEvidence.
 */
function buildAuthorityObject(params) {
  const {
    claimId,
    claimText,
    sentenceSpan,
    sentenceIndex,
    subclaimIndex,
    originalSentenceText,
    claimType,
    evidenceOrigin,
    classification,
    confirmedComponents,
    missingComponents,
    conflictingComponents,
    selectedEvidence,
    selectedExcerptText,
    selectedExcerptDirectness,
    selectedExcerptReason,
    displaySourceItems,
    hoverPayload,
    commentaryPayload,
    verdictPayload,
    qcExplanation,
    conflictEvidence,
  } = params;
  return {
    claimId,
    claimText,
    sentenceSpan,
    sentenceIndex,
    subclaimIndex,
    originalSentenceText,
    claimType,
    evidenceOrigin,
    classification,
    confirmedComponents: confirmedComponents ?? [],
    missingComponents: missingComponents ?? [],
    conflictingComponents: conflictingComponents ?? [],
    selectedEvidence,
    selectedExcerptText,
    selectedExcerptDirectness: selectedExcerptDirectness ?? "none",
    selectedExcerptReason: selectedExcerptReason ?? "no_direct_excerpt",
    displaySourceItems: displaySourceItems ?? [],
    hoverPayload,
    commentaryPayload,
    verdictPayload,
    qcExplanation: qcExplanation ?? null,
    conflictEvidence: conflictEvidence ?? null,
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
      const candidates = getCandidatesForClaim(stmt, claim, refsById, uploadedLen, assignCredibilityTier);
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
      const selectedExcerptDirectness = classification === "full" ? "direct" : classification === "partial" ? "partial" : classification === "related" ? "related" : "none";
      const selectedExcerptReason = selectedCandidate ? "proposition_match" : "no_direct_excerpt";
      const confirmedComponents = best?.confirmedComponents ?? [];
      const missingComponents = best?.missingComponents ?? [];
      const conflictingComponents = best?.conflictingComponents ?? [];
      const conflictEvidence = classification === "conflict" ? buildConflictEvidence(evaluations, components, claimType, log, claimId) : null;
      const conflictOpts = conflictEvidence && conflictEvidence.sideA?.length && conflictEvidence.sideB?.length
        ? { component: conflictEvidence.conflictingComponent ?? "amount", valueA: conflictEvidence.sideA[0]?.valueSummary ?? "one value", valueB: conflictEvidence.sideB[0]?.valueSummary ?? "another value" }
        : {};
      const evidenceOrigin = !selectedCandidate ? "none" : (selectedCandidate.sourceOrigin === "web" ? "web" : "uploaded");
      const verdictPayload = classification === "conflict" ? "conflicting_sources" : classification === "full" ? "confirmed" : classification === "partial" ? "partially_confirmed" : "no_clear_support";
      const qcExplanation = buildQcExplanation(components, confirmedComponents, missingComponents, conflictingComponents, classification);
      log("QC_V2_EXPLANATION_BUILD", { claimId, entityStatus: qcExplanation.entityStatus, relationStatus: qcExplanation.relationStatus, modifierStatus: qcExplanation.modifierStatus, contradictionStatus: qcExplanation.contradictionStatus });
      const explanationCode = getExplanationCode(classification, confirmedComponents, missingComponents, conflictingComponents);
      log("QC_V2_COMMENTARY_CODE", { claimId, explanationCode });
      let commentaryPayload = buildCommentaryTemplates(classification, missingComponents, components, qcExplanation, conflictingComponents, conflictOpts);
      const primaryValueSummary = classification === "conflict" && selectedCandidate
        ? extractValueSummaryFromExcerpt(selectedExcerptText, conflictingComponents[0], components)
        : null;
      const whyItMattersText = buildWhyItMattersFromExplanation(explanationCode, primaryValueSummary);
      const hoverPayload = buildHoverPayload(classification, selectedCandidate, selectedExcerptText, whyItMattersText, originalSentenceText);
      const displaySourceItems = [];
      evaluations.forEach((ev) => {
        const c = ev.candidate;
        const excerptText = (c?.excerptText && String(c.excerptText).trim()) ? String(c.excerptText).trim() : "";
        log("QC_V2_CITATION_EXCERPT", { claimId, refId: c?.refId ?? null, hasExcerpt: !!excerptText });
        if (!excerptText) return;
        if (!passesExcerptQualityGate(ev, components, claimType)) {
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
      if (displaySourceItems.length > 5) displaySourceItems.length = 5;
      let authoritySelectedEvidence = selectedCandidate ? {
        refId: selectedCandidate.refId,
        sourceType: selectedCandidate.sourceOrigin === "web" ? "web_search" : "uploaded",
        title: selectedCandidate.displayTitle,
        url: refsById.get(String(selectedCandidate.refId))?.url ?? null,
      } : null;
      let authoritySelectedExcerptText = selectedExcerptText;
      if (displaySourceItems.length === 0) {
        commentaryPayload = "No source directly confirms this claim.";
        authoritySelectedEvidence = null;
        authoritySelectedExcerptText = null;
      }
      const authority = buildAuthorityObject({
        claimId,
        claimText,
        sentenceSpan,
        sentenceIndex: idx,
        subclaimIndex: cIdx,
        originalSentenceText,
        claimType,
        evidenceOrigin,
        classification,
        confirmedComponents,
        missingComponents,
        conflictingComponents,
        selectedEvidence: authoritySelectedEvidence,
        selectedExcerptText: authoritySelectedExcerptText,
        selectedExcerptDirectness,
        selectedExcerptReason,
        displaySourceItems,
        hoverPayload,
        commentaryPayload,
        verdictPayload,
        qcExplanation,
        conflictEvidence,
      });
      authorities.push(authority);
      log("QC_V2_AUTHORITY_BUILD", { claimId, classification: authority.classification, selectedExcerptDirectness: authority.selectedExcerptDirectness });
      log("QC_V2_COMMENTARY_BUILD", { claimId, commentaryPreview: (commentaryPayload || "").substring(0, 60) });
      log("QC_V2_HOVER_BUILD", { claimId, hasExcerpt: !!authoritySelectedExcerptText });
    }
    stmt.meta = { ...(stmt.meta || {}), qcEvidenceAuthorities: authorities };
  }
  return statements;
}
