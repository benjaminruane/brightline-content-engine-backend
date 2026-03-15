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

/**
 * A6.40 §10–14: Single matcher — proposition-level. Returns confirmedComponents, missingComponents, conflictingComponents.
 */
function evaluateCandidate(claimText, claimType, components, candidate, assignCredibilityTier) {
  const excerpt = (candidate?.excerptText || "").trim();
  if (!excerpt || excerpt === "(excerpt not captured)") {
    return { confirmedComponents: [], missingComponents: [], conflictingComponents: [], classification: "none" };
  }
  const tier = candidate.credibilityTier ?? assignCredibilityTier?.(candidate?.url ?? "") ?? "LOW";
  const rejected = REJECTED_CREDIBILITY.has(String(tier).toUpperCase());
  const { corePropositionConfirmed: coreOk, missingModifierComponents } = corePropositionConfirmed(claimText, excerpt);
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
  else if (confirmedComponents.length > 0 || excerpt.length > 50) classification = "related";
  return { confirmedComponents, missingComponents, conflictingComponents, classification, rejected };
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
 * A6.40 §18–19: Rule-based commentary. Max 3 sentences, 50 words.
 */
function buildCommentaryTemplates(classification, missingComponents = []) {
  const missingList = missingComponents.length > 0 ? missingComponents.join(", ") : "one or more modifiers";
  switch (classification) {
    case "full": return "This source directly confirms the claim.";
    case "partial": return `This source confirms the core claim but does not specify ${missingList}.`;
    case "related": return "This source discusses the same topic but does not confirm the claim.";
    case "none": return "No source confirms this claim.";
    case "conflict": return "Sources disagree on this point.";
    default: return "No source confirms this claim.";
  }
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
 * A6.40 §17: Authority object (single source of truth per claim).
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
        const ev = evaluateCandidate(claimText, claimType, components, c, assignCredibilityTier);
        return { candidate: c, ...ev };
      });
      log("QC_V2_CANDIDATE_EVALUATION", { claimId, claimPreview: claimText.substring(0, 60), candidateCount: candidates.length, evaluations: evaluations.map((e) => ({ refId: e.candidate?.refId, classification: e.classification })) });
      const classification = claimLevelClassification(evaluations);
      const best = evaluations.find((e) => e.classification === classification) || evaluations.find((e) => e.classification === "related") || evaluations[0];
      const selectedCandidate = best?.candidate ?? null;
      const selectedExcerptText = selectedCandidate?.excerptText ?? null;
      const selectedExcerptDirectness = classification === "full" ? "direct" : classification === "partial" ? "partial" : classification === "related" ? "related" : "none";
      const selectedExcerptReason = selectedCandidate ? "proposition_match" : "no_direct_excerpt";
      const confirmedComponents = best?.confirmedComponents ?? [];
      const missingComponents = best?.missingComponents ?? [];
      const conflictingComponents = best?.conflictingComponents ?? [];
      const evidenceOrigin = !selectedCandidate ? "none" : (selectedCandidate.sourceOrigin === "web" ? "web" : "uploaded");
      const verdictPayload = classification === "conflict" ? "conflicting_sources" : classification === "full" ? "confirmed" : classification === "partial" ? "partially_confirmed" : "no_clear_support";
      const commentaryPayload = buildCommentaryTemplates(classification, missingComponents);
      const whyItMattersText = classification === "full" ? "Directly confirms this claim." : classification === "partial" ? "Confirms part of this claim." : classification === "related" ? "Related topic." : "No source confirms this claim.";
      const hoverPayload = buildHoverPayload(classification, selectedCandidate, selectedExcerptText, whyItMattersText, originalSentenceText);
      const displaySourceItems = (candidates || []).slice(0, 5).map((c, i) => ({
        refId: c.refId,
        sourceOrigin: c.sourceOrigin,
        displayTitle: c.displayTitle ?? `Source [${i + 1}]`,
        rawTitle: c.rawTitle ?? null,
        citationIndex: i,
      }));
      const selectedEvidence = selectedCandidate ? {
        refId: selectedCandidate.refId,
        sourceType: selectedCandidate.sourceOrigin === "web" ? "web_search" : "uploaded",
        title: selectedCandidate.displayTitle,
        url: refsById.get(String(selectedCandidate.refId))?.url ?? null,
      } : null;
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
        selectedEvidence,
        selectedExcerptText,
        selectedExcerptDirectness,
        selectedExcerptReason,
        displaySourceItems,
        hoverPayload,
        commentaryPayload,
        verdictPayload,
      });
      authorities.push(authority);
      log("QC_V2_AUTHORITY_BUILD", { claimId, classification: authority.classification, selectedExcerptDirectness: authority.selectedExcerptDirectness });
      log("QC_V2_COMMENTARY_BUILD", { claimId, commentaryPreview: (commentaryPayload || "").substring(0, 60) });
      log("QC_V2_HOVER_BUILD", { claimId, hasExcerpt: !!selectedExcerptText });
    }
    stmt.meta = { ...(stmt.meta || {}), qcEvidenceAuthorities: authorities };
  }
  return statements;
}
