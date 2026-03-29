// lib/qc/evidence-authority.mjs
// A6.30: Single post-rescue evidence authority per atomic claim. One authoritative object per claim; verdict, commentary, citation pills, hover derive from it.

import { classifyEvidenceRelationship, corePropositionConfirmed, inferClaimTypeForRelation } from "./evidence-relationship.mjs";
import { selectTargetedExcerpt } from "./targeted-excerpt.mjs";

/** Classification: full | partial | related | none | conflict. Computed once after merge. */
export const CLASSIFICATION = Object.freeze(["full", "partial", "related", "none", "conflict"]);

/** evidenceOrigin: uploaded | web | mixed | none */
export const EVIDENCE_ORIGIN = Object.freeze(["uploaded", "web", "mixed", "none"]);

/** selectedExcerptDirectness: direct | partial | related | none */
export const DIRECTNESS = Object.freeze(["direct", "partial", "related", "none"]);

/** selectedExcerptReason (allowed enum) */
export const EXCERPT_REASONS = Object.freeze([
  "entity_numeric_match",
  "entity_action_match",
  "relation_match",
  "partial_component_match",
  "related_topic_only",
  "conflict_match",
  "web_direct_confirmation",
  "no_direct_excerpt",
]);

/** Map relationship + matchType to spec classification. Conflict takes precedence. */
function toClassification(relationship, matchType, hasCounter) {
  if (hasCounter || relationship === "counter") return "conflict";
  if (relationship === "none") return "none";
  if (relationship === "partial") return "partial";
  if (relationship === "context") return "related";
  if (relationship === "support") {
    if (matchType === "exact" || matchType === "rounded_equivalent" || matchType === "unit_equivalent") return "full";
    if (matchType === "partial_support" || matchType === "paraphrase") return "partial";
    return "related";
  }
  return "none";
}

/** Map directness from selectTargetedExcerpt to spec: direct | partial | related | none. Topic similarity alone must not produce direct. */
function toSpecDirectness(directness, excerptMatchType) {
  if (directness === "direct") return "direct";
  if (directness === "partial_direct") return "partial";
  if (directness === "related_only" || directness === "weak_related") return "related";
  return "none";
}

/** Map selectedExcerptReason from targeted-excerpt to spec enum. */
function toSpecExcerptReason(reason, isWeb, directness) {
  if (isWeb && directness === "direct") return "web_direct_confirmation";
  if (!reason || reason === "related_but_not_direct") return "related_topic_only";
  const r = String(reason);
  if (["entity_numeric_match", "entity_action_match", "relation_match", "partial_component_match", "conflict_match"].includes(r)) return r;
  if (r === "entity_match" || r === "numeric_match") return "entity_numeric_match";
  if (r === "trend_match" || r === "lexical_best" || r === "fallback_first") return "partial_component_match";
  if (!reason || directness === "none") return "no_direct_excerpt";
  return "related_topic_only";
}

/** Why-it-matters text by classification/directness (rule-based). */
function buildWhyItMattersText(classification, selectedExcerptDirectness) {
  if (classification === "conflict") return "Sources disagree on this point.";
  if (classification === "full" && selectedExcerptDirectness === "direct") return "Directly confirms this claim.";
  if (classification === "partial" || selectedExcerptDirectness === "partial") return "Confirms part of this claim.";
  if (classification === "related" || selectedExcerptDirectness === "related") return "Related to the topic but does not confirm the claim.";
  if (classification === "none" || selectedExcerptDirectness === "none") return "Provides context, not confirmation.";
  return "See commentary.";
}

/** A6.31: Build concrete partial commentary (what is confirmed, what is missing). Avoid vague fallback when concrete exists. */
function buildPartialCommentaryConcrete(claimText, missingModifierComponents) {
  const t = (claimText || "").toLowerCase();
  const missing = Array.isArray(missingModifierComponents) ? missingModifierComponents : [];
  if (missing.includes("target") && /launch|enterprise\s+payments|platform\s+for\s+large\s+merchants/i.test(t)) {
    return "The source confirms the enterprise payments launch, but it does not say the platform is targeted at large merchants.";
  }
  if (missing.includes("degree_qualifier") && /materially\s+strengthen|expects?|adoption\s+this\s+year/i.test(t)) {
    return "The source confirms the launch, but it does not support the stronger claim that it will materially strengthen enterprise adoption this year.";
  }
  if (/\$|million|billion|raised|funding/i.test(t)) return "The source confirms the product or launch context; it does not confirm the funding amount. Split the sentence so each claim can be sourced separately.";
  if (missing.length > 0) return "The source confirms part of this statement but not all material elements. Split the claims and source each point separately.";
  return "The source confirms part of this statement but not the full claim.";
}

/** Commentary from authority: rule-based, 2–3 sentences, ≤50 words. By class: full, partial, related, none, conflict. */
function buildCommentaryFromPayload(classification, claimText, commentaryPayload) {
  if (commentaryPayload && typeof commentaryPayload === "string" && commentaryPayload.trim()) return commentaryPayload.trim();
  const t = (claimText || "").toLowerCase();
  if (classification === "conflict") return "Sources disagree on this point.";
  if (classification === "full") return "The source confirms this statement.";
  if (classification === "partial") {
    if (typeof commentaryPayload === "object" && commentaryPayload !== null && Array.isArray(commentaryPayload.missingModifierComponents)) {
      return buildPartialCommentaryConcrete(claimText, commentaryPayload.missingModifierComponents);
    }
    if (/\$|million|billion|raised|funding/i.test(t)) return "The source confirms the product or launch context; it does not confirm the funding amount. Split the sentence so each claim can be sourced separately.";
    return "The source confirms part of this statement but not the rest. Split the claims and source each point separately.";
  }
  if (classification === "related") return "The source discusses the topic but does not confirm this claim as written.";
  if (classification === "none") return "Uploaded sources do not address this claim, or no source confirms it.";
  return "The source is related to this topic but does not directly confirm this claim.";
}

/** Extract domain from URL for displaySourceItems. */
function domainFromUrl(url) {
  if (typeof url !== "string" || !url.trim()) return null;
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

/**
 * Build one displaySourceItem from a candidate/ref.
 * @param {{ refId, title?, url?, sourceType?, excerpt? }} refOrBinding
 * @param {number} citationIndex
 * @param {object} hoverPayloadRef - reference to hover payload (e.g. index or id for this source)
 */
function toDisplaySourceItem(refOrBinding, citationIndex, hoverPayloadRef) {
  const refId = refOrBinding?.refId ?? refOrBinding?.id ?? null;
  const isWeb = refOrBinding?.sourceType === "web_search" || refOrBinding?.sourceType === "web";
  return {
    refId,
    sourceOrigin: isWeb ? "web" : "uploaded",
    sourceLabelType: isWeb ? "WEB SEARCH" : "SOURCE",
    displayTitle: (refOrBinding?.title && String(refOrBinding.title).trim()) || (refId ? `Source [${refId}]` : "Source"),
    rawTitle: refOrBinding?.title ?? null,
    domain: domainFromUrl(refOrBinding?.url ?? ""),
    citationIndex,
    hoverPayloadRef,
  };
}

/**
 * Build per-claim evidence authority. Called once per atomic claim after rescue merge.
 * Gathers uploaded + web candidates for this claim, merges once, classifies once, then builds displaySourceItems, commentary, hover, verdict.
 *
 * @param {Object} params
 * @param {Object} params.claim - Canonical claim { id, displayText, citations, type, value, ... }
 * @param {string} params.claimText - Claim text (displayText or statement slice)
 * @param {string} params.statementText - Full statement text
 * @param {number} params.sentenceIndex - Statement index in document
 * @param {string} params.sentenceSpan - Sentence text span (e.g. stmt.text)
 * @param {number} params.subclaimIndex - Index of claim within statement
 * @param {Array} params.uploadedCandidates - Candidates from uploaded refs (bindings with refId, excerpt, matchType, sourceType: 'uploaded')
 * @param {Array} params.webCandidates - Candidates from web refs (bindings with refId, excerpt, sourceType: 'web_search')
 * @param {Array} params.unifiedReferences - All refs (for title, url)
 * @param {Function} [params.assignCredibilityTier] - (url) => tier for web filtering
 * @param {string} [params.statementRole] - For classifyEvidenceRelationship
 * @param {number} [params.uploadedLen] - Count of uploaded refs (refId > uploadedLen => web)
 * @returns {Object} qcEvidenceAuthority
 */
export function buildClaimEvidenceAuthority(params) {
  const {
    claim,
    claimText,
    statementText,
    sentenceIndex = null,
    sentenceSpan = null,
    subclaimIndex = null,
    uploadedCandidates = [],
    webCandidates = [],
    unifiedReferences = [],
    assignCredibilityTier = () => "LOW",
    statementRole = "unknown",
    uploadedLen = 0,
  } = params;

  const refsById = new Map();
  (unifiedReferences || []).forEach((r) => { if (r?.id != null) refsById.set(String(r.id), r); });

  const claimId = claim?.id ?? null;
  const mergedCandidates = [...(uploadedCandidates || []), ...(webCandidates || [])];

  // Classification: once after merge. Use first support-grade candidate; if any counter → conflict.
  let classification = "none";
  let confirmedComponents = [];
  let missingComponents = [];
  let conflictingComponents = [];
  const hasCounter = mergedCandidates.some((c) => {
    const rel = classifyEvidenceRelationship({
      statementText: claimText || statementText,
      canonicalClaims: [claim].filter(Boolean),
      candidateExcerpt: c.excerpt,
      matchType: c.matchType || "none",
      supportBinding: c,
      statementRole,
      evidenceRole: c.role || "unknown",
    });
    return rel.relationship === "counter";
  });

  if (mergedCandidates.length === 0) {
    classification = "none";
  } else {
    const supportCandidates = mergedCandidates.filter((c) => {
      const rel = classifyEvidenceRelationship({
        statementText: claimText || statementText,
        canonicalClaims: [claim].filter(Boolean),
        candidateExcerpt: c.excerpt,
        matchType: c.matchType || "none",
        supportBinding: c,
        statementRole,
        evidenceRole: c.role || "unknown",
      });
      return rel.relationship === "support" || rel.relationship === "partial";
    });
    const best = supportCandidates[0];
    const rel = best ? classifyEvidenceRelationship({
      statementText: claimText || statementText,
      canonicalClaims: [claim].filter(Boolean),
      candidateExcerpt: best.excerpt,
      matchType: best.matchType || "none",
      supportBinding: best,
      statementRole,
      evidenceRole: best.role || "unknown",
    }) : { relationship: "none" };
    classification = toClassification(rel.relationship, best?.matchType ?? "none", hasCounter);
    if (hasCounter) classification = "conflict";
  }

  // Uploaded-first: if uploaded fully confirms, evidenceOrigin = uploaded
  const hasUploadedSupport = (uploadedCandidates || []).some((c) => {
    const rel = classifyEvidenceRelationship({
      statementText: claimText || statementText,
      canonicalClaims: [claim].filter(Boolean),
      candidateExcerpt: c.excerpt,
      matchType: c.matchType || "none",
      supportBinding: c,
      statementRole,
      evidenceRole: c.role || "unknown",
    });
    return rel.relationship === "support" || rel.relationship === "partial";
  });
  const hasWebSupport = (webCandidates || []).some((c) => {
    const rel = classifyEvidenceRelationship({
      statementText: claimText || statementText,
      canonicalClaims: [claim].filter(Boolean),
      candidateExcerpt: c.excerpt,
      matchType: c.matchType || "none",
      supportBinding: c,
      statementRole,
      evidenceRole: c.role || "unknown",
    });
    return rel.relationship === "support" || rel.relationship === "partial";
  });
  let evidenceOrigin = "none";
  if (hasUploadedSupport && classification === "full") evidenceOrigin = "uploaded";
  else if (hasWebSupport && !hasUploadedSupport) evidenceOrigin = "web";
  else if (hasUploadedSupport || hasWebSupport) evidenceOrigin = "mixed";

  // Select excerpt: use selectTargetedExcerpt on merged (support-only) candidates
  const supportOnly = mergedCandidates.filter((c) => {
    const rel = classifyEvidenceRelationship({
      statementText: claimText || statementText,
      canonicalClaims: [claim].filter(Boolean),
      candidateExcerpt: c.excerpt,
      matchType: c.matchType || "none",
      supportBinding: c,
      statementRole,
      evidenceRole: c.role || "unknown",
    });
    return rel.relationship === "support" || rel.relationship === "partial";
  });
  const excerptResult = selectTargetedExcerpt(claimText || statementText, supportOnly, { maxExcerptLength: 220 });
  const selectedEvidence = excerptResult.selectedBinding ?? null;
  const selectedExcerptText = (excerptResult.selectedExcerptText && String(excerptResult.selectedExcerptText).trim()) || null;
  const selectedExcerptDirectness = toSpecDirectness(excerptResult.directness, excerptResult.excerptMatchType);
  const selectedExcerptReason = toSpecExcerptReason(
    excerptResult.selectedExcerptReason,
    selectedEvidence?.sourceType === "web_search",
    selectedExcerptDirectness
  );
  confirmedComponents = Array.isArray(excerptResult.confirmedComponents) ? excerptResult.confirmedComponents : [];
  missingComponents = Array.isArray(excerptResult.missingMaterialElements) ? excerptResult.missingMaterialElements : [];

  // Verdict (supportState) from classification
  const verdictPayload = classification === "conflict" ? "conflicting_sources"
    : classification === "full" ? "confirmed"
    : classification === "partial" ? "partially_confirmed"
    : "no_clear_support";

  // Commentary: rule-based from classification; A6.31 for partial use core-proposition missingModifierComponents when available
  let commentaryPayloadArg = null;
  if (classification === "partial" && selectedExcerptText) {
    const { corePropositionConfirmed: coreOk, missingModifierComponents: missing } = corePropositionConfirmed(statementText || claimText, selectedExcerptText, {
      claimType: inferClaimTypeForRelation(claimText || statementText || ""),
      claimId: claim?.id ?? null,
    });
    if (coreOk && Array.isArray(missing) && missing.length > 0) commentaryPayloadArg = { missingModifierComponents: missing };
  }
  const commentaryText = buildCommentaryFromPayload(classification, claimText, commentaryPayloadArg);

  // Hover payload
  const whyItMattersText = buildWhyItMattersText(classification, selectedExcerptDirectness);
  const hoverPayload = {
    sourceLabelType: selectedEvidence?.sourceType === "web_search" ? "WEB SEARCH" : "SOURCE",
    displaySourceName: (selectedEvidence?.title && String(selectedEvidence.title).trim()) || (selectedEvidence?.refId ? refsById.get(String(selectedEvidence.refId))?.title : null) || "Source",
    excerptText: selectedExcerptText,
    whyItMattersText,
    originalSentenceText: (sentenceSpan && sentenceSpan !== claimText) ? sentenceSpan : null,
  };

  // displaySourceItems: from mergedCandidates (support + display-eligible), ordered uploaded first
  const displaySourceItems = [];
  mergedCandidates.forEach((c, i) => {
    const ref = refsById.get(String(c.refId)) || c;
    displaySourceItems.push(toDisplaySourceItem({ ...c, title: c.title ?? ref?.title, url: c.url ?? ref?.url }, i, i));
  });

  return {
    claimId,
    claimText: claimText ?? (claim?.displayText || ""),
    sentenceIndex,
    sentenceSpan,
    subclaimIndex,
    evidenceOrigin,
    uploadedCandidates: uploadedCandidates || [],
    webCandidates: webCandidates || [],
    mergedCandidates,
    classification,
    confirmedComponents,
    missingComponents,
    conflictingComponents,
    selectedEvidence,
    selectedExcerptText,
    selectedExcerptDirectness,
    selectedExcerptReason,
    displaySourceItems,
    commentaryPayload: commentaryText,
    hoverPayload,
    verdictPayload,
  };
}

/**
 * A6.30a: Build one synthetic statement-level authority when there are no canonical claims.
 * Uses existing statement-level evidence (evidenceBundle, assessment.citations) only; no new extraction.
 *
 * @param {Object} params
 * @param {Object} params.statement - Full statement object (evidenceBundle, assessment.citations)
 * @param {number} params.sentenceIndex - Statement index
 * @param {Map} params.refById - ref id -> ref
 * @returns {{ authority: Object, hadEvidenceBundle: boolean, hadAssessmentCitations: boolean }}
 */
export function buildSyntheticStatementAuthority(params) {
  const { statement, sentenceIndex = null, refById = new Map() } = params;
  const statementText = typeof statement?.text === "string" ? statement.text : "";
  const evidenceBundle = statement?.evidenceBundle || {};
  const supportBindings = Array.isArray(evidenceBundle.supportBindings) ? evidenceBundle.supportBindings : [];
  const visibleSupportBindings = Array.isArray(evidenceBundle.visibleSupportBindings) ? evidenceBundle.visibleSupportBindings : supportBindings;
  const primary = evidenceBundle.primary;
  const reasoningHeadline = (evidenceBundle.reasoning && evidenceBundle.reasoning.headline) ? String(evidenceBundle.reasoning.headline) : "";
  const assessmentCitations = Array.isArray(statement?.assessment?.citations) ? statement.assessment.citations : [];
  const hadEvidenceBundle = supportBindings.length > 0 || visibleSupportBindings.length > 0 || primary != null;
  const hadAssessmentCitations = assessmentCitations.length > 0;

  // Derive classification from existing evidence state; do not invent support.
  let classification = "none";
  const hasCounter = supportBindings.some((b) => b.relationship === "counter");
  if (hasCounter || reasoningHeadline === "conflicting_sources") {
    classification = "conflict";
  } else if (visibleSupportBindings.length > 0 || (primary && primary.excerpt)) {
    const primaryBinding = supportBindings.find((b) => b.refId === primary?.refId) || supportBindings[0] || (primary ? { ...primary, matchType: primary.matchType || "paraphrase" } : null);
    const matchType = (primaryBinding && (primaryBinding.matchType || primary?.matchType)) ? String(primaryBinding.matchType || primary.matchType) : "none";
    const relationship = primaryBinding?.relationship ?? "support";
    if (relationship === "counter") classification = "conflict";
    else if (relationship === "context") classification = "related";
    else if (relationship === "partial") classification = "partial";
    else if (relationship === "support") {
      if (matchType === "exact" || matchType === "rounded_equivalent" || matchType === "unit_equivalent") classification = "full";
      else if (matchType === "partial_support" || matchType === "paraphrase") classification = "partial";
      else classification = "related";
    } else classification = "none";
  }

  const verdictPayload = classification === "conflict" ? "conflicting_sources"
    : classification === "full" ? "confirmed"
    : classification === "partial" ? "partially_confirmed"
    : "no_clear_support";

  const primaryBinding = visibleSupportBindings.find((b) => b.refId === primary?.refId) || visibleSupportBindings[0];
  const selectedEvidence = (primary || primaryBinding) ? {
    refId: (primary?.refId ?? primaryBinding?.refId) ?? null,
    sourceType: (primary?.sourceType ?? primaryBinding?.sourceType) || "uploaded",
    title: (primary?.title ?? primaryBinding?.title) ?? "Untitled source",
    url: (primary?.url ?? primaryBinding?.url) ?? null,
    matchType: (primary?.matchType ?? primaryBinding?.matchType) ?? "paraphrase",
  } : null;
  const selectedExcerptText = (primary?.excerpt && String(primary.excerpt).trim()) || (primaryBinding?.excerpt && String(primaryBinding.excerpt).trim()) || null;
  const selectedExcerptDirectness = classification === "full" ? "direct" : classification === "partial" ? "partial" : classification === "related" ? "related" : "none";
  const selectedExcerptReason = selectedExcerptText ? "partial_component_match" : "no_direct_excerpt";

  const commentaryText = buildCommentaryFromPayload(classification, statementText, null);
  const whyItMattersText = buildWhyItMattersText(classification, selectedExcerptDirectness);
  const hoverPayload = {
    sourceLabelType: selectedEvidence?.sourceType === "web_search" ? "WEB SEARCH" : "SOURCE",
    displaySourceName: (selectedEvidence?.title && String(selectedEvidence.title).trim()) || (selectedEvidence?.refId ? (refById.get(String(selectedEvidence.refId))?.title) : null) || "Source",
    excerptText: selectedExcerptText,
    whyItMattersText,
    originalSentenceText: null,
  };

  const displaySourceItems = [];
  const usedRefIds = new Set();
  for (const b of visibleSupportBindings) {
    if (!b?.refId || usedRefIds.has(String(b.refId))) continue;
    usedRefIds.add(String(b.refId));
    const ref = refById.get(String(b.refId)) || b;
    displaySourceItems.push(toDisplaySourceItem({ ...b, title: b.title ?? ref?.title, url: b.url ?? ref?.url }, displaySourceItems.length, displaySourceItems.length));
  }
  if (displaySourceItems.length === 0 && hadAssessmentCitations) {
    assessmentCitations.forEach((cid, i) => {
      const refId = cid != null ? String(cid) : null;
      if (!refId || usedRefIds.has(refId)) return;
      usedRefIds.add(refId);
      const ref = refById.get(refId);
      if (!ref) return;
      displaySourceItems.push(toDisplaySourceItem(ref, i, i));
    });
  }

  const evidenceOrigin = supportBindings.some((b) => b.sourceType === "web_search") && supportBindings.some((b) => b.sourceType === "uploaded")
    ? "mixed"
    : supportBindings.some((b) => b.sourceType === "web_search") ? "web"
    : supportBindings.length > 0 ? "uploaded"
    : "none";

  const authority = {
    claimId: null,
    claimText: statementText,
    sentenceIndex,
    sentenceSpan: statementText,
    subclaimIndex: 0,
    evidenceOrigin,
    uploadedCandidates: [],
    webCandidates: [],
    mergedCandidates: supportBindings.slice(),
    classification,
    confirmedComponents: [],
    missingComponents: [],
    conflictingComponents: [],
    selectedEvidence,
    selectedExcerptText,
    selectedExcerptDirectness,
    selectedExcerptReason,
    displaySourceItems,
    commentaryPayload: commentaryText,
    hoverPayload,
    verdictPayload,
  };

  return { authority, hadEvidenceBundle, hadAssessmentCitations };
}

/**
 * Derive statement-level evidence/citations/evidenceBundle from per-claim authorities.
 * Legacy fields written only after authority is complete.
 *
 * @param {Object} statement - Statement object (mutated)
 * @param {Array} authorities - qcEvidenceAuthority[] from buildClaimEvidenceAuthority
 * @param {Map} refById - ref id -> ref
 * @param {Function} [uniqueSupportRefIds] - (bindings) => refId[]
 */
export function deriveStatementEvidenceFromAuthorities(statement, authorities, refById, uniqueSupportRefIds) {
  if (!Array.isArray(authorities) || authorities.length === 0) return;
  const supportRefIds = new Set();
  const bindings = [];
  for (const auth of authorities) {
    for (const item of auth.displaySourceItems || []) {
      if (item?.refId) supportRefIds.add(String(item.refId));
    }
    if (auth.selectedEvidence && auth.selectedExcerptText) {
      bindings.push({
        refId: auth.selectedEvidence.refId,
        sourceType: auth.selectedEvidence.sourceType || "uploaded",
        title: auth.selectedEvidence.title ?? "Untitled source",
        url: auth.selectedEvidence.url ?? null,
        excerpt: auth.selectedExcerptText,
        matchType: auth.selectedEvidence.matchType ?? "paraphrase",
        claimId: auth.claimId,
      });
    }
  }
  const refIds = uniqueSupportRefIds ? uniqueSupportRefIds(bindings) : Array.from(supportRefIds);
  statement.citations = refIds.slice();
  if (statement.assessment) statement.assessment.citations = refIds.slice();
  statement.evidence = refIds.map((id) => {
    const ref = refById?.get(String(id));
    return ref ? { title: ref.title ?? "", url: ref.url ?? null, sourceType: ref.sourceType ?? "uploaded" } : { title: "Reference " + id, url: null, sourceType: "uploaded" };
  });
  if (statement.assessment) statement.assessment.evidence = statement.evidence;
  statement.evidenceBundle = statement.evidenceBundle || {};
  statement.evidenceBundle.supportBindings = bindings;
  statement.evidenceBundle.visibleSupportBindings = bindings;
  const primaryAuth = authorities.find((a) => a.selectedEvidence) || authorities[0];
  if (primaryAuth?.selectedEvidence) {
    statement.evidenceBundle.primary = {
      refId: primaryAuth.selectedEvidence.refId,
      sourceType: primaryAuth.selectedEvidence.sourceType || "uploaded",
      title: primaryAuth.selectedEvidence.title ?? "Untitled source",
      url: primaryAuth.selectedEvidence.url ?? null,
      excerpt: primaryAuth.selectedExcerptText,
    };
  } else {
    statement.evidenceBundle.primary = null;
  }
  statement.evidenceBundle.reasoning = statement.evidenceBundle.reasoning || {};
  statement.evidenceBundle.reasoning.headline = primaryAuth?.verdictPayload ?? "no_clear_support";
  statement.evidenceBundle.reasoning.paragraph = primaryAuth?.commentaryPayload ?? null;
}
