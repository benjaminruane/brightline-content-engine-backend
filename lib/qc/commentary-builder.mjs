// lib/qc/commentary-builder.mjs
// A6.13: Human, professional QC commentary. Structure: support summary, gap/issue, reviewer action. Verdict-specific; no robotic phrasing.

import { applyCommentaryQuality } from "./commentary-quality.mjs";

/**
 * Infer what the claim is about (for support summary) from statement text.
 */
function inferClaimTopic(statementText) {
  const t = (statementText || "").toLowerCase();
  if (/\$[\d,.]+\s*(million|billion|m|bn|k)?|\d+\s*(million|billion|m|bn)\s*(series|round|funding|raised)/i.test(t))
    return "funding_amount";
  if (/launch(ed)?|enterprise\s+payments|platform\s+for\s+(large\s+)?merchants/i.test(t)) return "product_launch";
  if (/expect(s|ed)?|management\s+guidance|outlook|forecast/i.test(t)) return "expectation";
  if (/trend|industry|market|growth/i.test(t)) return "trend";
  if (/valuation|valued\s+at|worth/i.test(t)) return "valuation";
  return "claim";
}

/**
 * Build commentary for supported (confirmed) verdict.
 * Identifies supported core fact and notes any phrasing risk.
 */
function buildConfirmedCommentary(statementText, excerptMatchType, primaryRefLabel) {
  const topic = inferClaimTopic(statementText);
  const ref = primaryRefLabel ? ` (${primaryRefLabel})` : "";
  if (topic === "product_launch") {
    return `The source supports the product launch${ref}. The point is broadly supported; keep the wording close to the source for precision.`;
  }
  if (topic === "funding_amount") {
    return `The source supports the funding figure${ref}. The wording is aligned with the evidence; avoid overstating beyond what the source states.`;
  }
  if (topic === "trend" || topic === "expectation") {
    return `The source supports the general direction of this point${ref}. Phrasing should stay close to the source so it reads as reported rather than inferred.`;
  }
  return `The source supports this statement${ref}. The point is broadly supported; keep the wording close to the source.`;
}

/**
 * Build commentary for partially supported (partially_confirmed).
 * Clearly identifies which part is supported and which part is not; cross-references same-sentence support where relevant.
 */
function buildPartialCommentary(statementText, excerptMatchType, opts = {}) {
  const { otherPartSupported = false, otherPartUnsupported = false } = opts;
  const topic = inferClaimTopic(statementText);
  if (topic === "funding_amount" || /\$|million|billion|series\s+[a-d]|raised\s+\d/i.test(statementText || "")) {
    const supportPart = "The source supports the product or launch context.";
    const gapPart = "The funding amount in the same sentence is not supported by the uploaded sources.";
    const actionPart = "Split the sentence so the launch claim and funding claim can be sourced separately.";
    if (otherPartSupported) {
      return `${supportPart} Another part of this sentence is supported; this part is not. ${actionPart}`;
    }
    if (otherPartUnsupported) {
      return `${supportPart} The funding figure is not supported. ${actionPart}`;
    }
    return `${supportPart} ${gapPart} ${actionPart}`;
  }
  const supportPart = "The source supports part of this statement.";
  const gapPart = "Another part of the same sentence is not supported by the provided sources.";
  const actionPart = "Split the claims and source each point separately.";
  return `${supportPart} ${gapPart} ${actionPart}`;
}

/**
 * Build commentary for no_clear_support. Distinguish: no relevant source; related but not direct; unsupported numeric/entity.
 */
function buildNoSupportCommentary(statementText, opts = {}) {
  const { topRejected = null, hasRelatedSources = false, isNumericClaim = false } = opts;
  const t = (statementText || "").toLowerCase();
  const hasAmount = /\$[\d,.]+\s*(million|billion|m|bn)?|\d+\s*(million|billion)\s*(series|round|funding)/i.test(t);

  if (topRejected === "counter") {
    return "The cited material points to risks or constraints rather than evidence for this claim.";
  }
  if (topRejected === "context") {
    return "Sources discuss related topics but do not support this claim directly.";
  }
  if (hasRelatedSources && hasAmount) {
    return "The uploaded sources discuss the company or topic, but none support the funding amount as stated. Add a source that states the figure directly, or remove the figure.";
  }
  if (hasRelatedSources) {
    return "The sources are related to this topic but do not directly support this statement as written.";
  }
  if (hasAmount || isNumericClaim) {
    return "The uploaded sources do not support this figure. Add a source that states it directly, or remove or reword the claim.";
  }
  return "No supporting evidence for this claim was found in the provided sources.";
}

/**
 * Build commentary for conflicting_sources.
 */
function buildConflictCommentary(opts = {}) {
  const { conflictNarrative = null, valueHint = "" } = opts;
  const action =
    (conflictNarrative && typeof conflictNarrative.recommendedAction === "string" && conflictNarrative.recommendedAction.trim())
      ? conflictNarrative.recommendedAction.trim()
      : "Reconcile the conflicting values before keeping the statement.";
  if (valueHint) {
    return `The sources do not agree on this point${valueHint}. ${action}`;
  }
  return `The sources do not agree on this point. ${action}`;
}

/**
 * Build concrete, action-oriented suggested improvement by verdict and context.
 */
function buildSuggestedImprovement(verdict, statementText, opts = {}) {
  const { excerptMatchType = null, topRejected = null, hasRelatedSources = false } = opts;
  const t = (statementText || "").toLowerCase();
  const hasAmount = /\$[\d,.]+\s*(million|billion|m|bn)?|\d+\s*(million|billion)\s*(series|round|funding)/i.test(t);

  if (verdict === "conflicting_sources") {
    return "Reconcile the conflicting values before keeping the statement.";
  }
  if (verdict === "partially_confirmed") {
    if (hasAmount) return "Split this sentence so the launch claim and funding claim can be assessed and sourced separately.";
    return "Split the claims in this sentence and source each point separately.";
  }
  if (verdict === "no_clear_support") {
    if (topRejected === "counter") {
      return "Use a source that supports the claim rather than one that discusses risks or constraints.";
    }
    if (hasAmount && hasRelatedSources) {
      return "Add a source that explicitly states the funding amount, or remove the figure.";
    }
    if (hasAmount) {
      return "Add a source that explicitly states this figure, or remove it.";
    }
    if (hasRelatedSources) {
      return "Add a source that directly supports this statement, or reword to match what the existing sources say.";
    }
    if (/expect|guidance|outlook/i.test(t)) {
      return "Reword this as management expectation only if you have a source for the guidance; otherwise state it as commentary.";
    }
    return "Add a source that directly supports this claim, or remove or reword it.";
  }
  if (verdict === "confirmed") {
    if (excerptMatchType === "related_only") {
      return "Tighten the phrasing so it does not go beyond what the source states.";
    }
    return "Keep the wording close to the source to avoid overstating.";
  }
  return null;
}

/**
 * Build full QC commentary (reasoningParagraph) and suggested improvement.
 * Uses support summary / gap / reviewer action where applicable; human phrasing; no template-heavy or robotic lines.
 *
 * @param {Object} params
 * @param {string} params.verdict - supportState: confirmed | partially_confirmed | no_clear_support | conflicting_sources
 * @param {string} [params.statementText] - Statement/claim text
 * @param {string} [params.primaryRefLabel] - e.g. "Source 1" or title
 * @param {string} [params.excerptMatchType] - exact | close | related_only | none
 * @param {Object} [params.conflictOpts] - conflictNarrative, conflictValues for conflict commentary
 * @param {string} [params.topRejected] - counter | context for no_support
 * @param {boolean} [params.hasRelatedSources] - Whether any related sources exist
 * @param {boolean} [params.otherPartSupported] - For partial: another subclaim from same sentence is supported
 * @param {boolean} [params.otherPartUnsupported] - For partial: another subclaim is unsupported
 * @param {string[]} [params.recentCommentaries] - Other cards' commentary to avoid identical phrasing unless evidence same
 * @returns {{ commentary: string, suggestedImprovement: string|null, commentaryMode: string, suggestedImprovementMode: string }}
 */
export function buildQcCommentary(params) {
  const {
    verdict,
    statementText = "",
    primaryRefLabel = null,
    excerptMatchType = null,
    conflictOpts = {},
    topRejected = null,
    hasRelatedSources = false,
    otherPartSupported = false,
    otherPartUnsupported = false,
    recentCommentaries = [],
  } = params;

  const normVerdict = (verdict || "").toLowerCase();
  let commentary = "";
  let commentaryMode = "fallback";
  let suggestedImprovement = null;
  let suggestedImprovementMode = "none";

  if (normVerdict === "conflicting_sources") {
    const valueHint = conflictOpts.valueHint || "";
    commentary = buildConflictCommentary({ conflictNarrative: conflictOpts.conflictNarrative, valueHint });
    commentaryMode = "conflict";
    suggestedImprovement = buildSuggestedImprovement("conflicting_sources", statementText, {});
    suggestedImprovementMode = "conflict";
  } else if (normVerdict === "confirmed") {
    commentary = buildConfirmedCommentary(statementText, excerptMatchType, primaryRefLabel);
    commentaryMode = "confirmed";
    suggestedImprovement = buildSuggestedImprovement("confirmed", statementText, { excerptMatchType });
    suggestedImprovementMode = suggestedImprovement ? "confirmed" : "none";
  } else if (normVerdict === "partially_confirmed") {
    commentary = buildPartialCommentary(statementText, excerptMatchType, {
      otherPartSupported,
      otherPartUnsupported,
    });
    commentaryMode = "partial";
    suggestedImprovement = buildSuggestedImprovement("partially_confirmed", statementText, {});
    suggestedImprovementMode = "partial";
  } else {
    commentary = buildNoSupportCommentary(statementText, {
      topRejected,
      hasRelatedSources,
      isNumericClaim: /\$|\d+\s*(million|billion|%)/i.test(statementText),
    });
    commentaryMode = "no_support";
    suggestedImprovement = buildSuggestedImprovement("no_clear_support", statementText, {
      topRejected,
      hasRelatedSources,
    });
    suggestedImprovementMode = suggestedImprovement ? "no_support" : "none";
  }

  const opts = { topRejected, hasRelatedSources, excerptMatchType };
  if (normVerdict === "no_clear_support" || !commentary) {
    suggestedImprovement = suggestedImprovement || buildSuggestedImprovement("no_clear_support", statementText, opts);
  }

  commentary = applyCommentaryQuality(commentary);
  if (recentCommentaries.length > 0 && commentary) {
    const same = recentCommentaries.some((c) => typeof c === "string" && c.trim() === commentary.trim());
    if (same) {
      commentary = applyCommentaryQuality(commentary + " (Review this claim in context of the evidence above.)");
    }
  }

  return {
    commentary,
    suggestedImprovement: suggestedImprovement ? applyCommentaryQuality(suggestedImprovement) : null,
    commentaryMode,
    suggestedImprovementMode,
  };
}
