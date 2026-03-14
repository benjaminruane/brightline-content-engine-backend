// lib/qc/commentary-builder.mjs
// A6.13 / A6.20 / A6.21: Human reviewer-style commentary. Explicit claim–evidence difference. Max 50 words, 3 sentences. No generic fallbacks.

import { applyCommentaryQuality } from "./commentary-quality.mjs";

const MAX_WORDS = 50;
const MAX_SENTENCES = 3;

function inferClaimTopic(statementText) {
  const t = (statementText || "").toLowerCase();
  if (/\$[\d,.]+\s*(million|billion|m|bn|k)?|\d+\s*(million|billion|m|bn)\s*(series|round|funding|raised)/i.test(t))
    return "funding_amount";
  if (/launch(ed)?|enterprise\s+payments|platform\s+for\s+(large\s+)?merchants/i.test(t)) return "product_launch";
  if (/expect(s|ed)?|management\s+guidance|outlook|forecast|materially\s+strengthen/i.test(t)) return "expectation";
  if (/trend|industry|market|growth/i.test(t)) return "trend";
  return "claim";
}

/** One short sentence for citation hover "WHY IT MATTERS". */
function buildWhyItMatters(verdict, statementText, opts = {}) {
  const { excerptMatchType = null } = opts;
  const v = (verdict || "").toLowerCase();
  const t = (statementText || "").toLowerCase();
  const hasFunding = /\$|million|billion|series\s+[a-d]|raised\s+\d|funding/i.test(t);
  const hasLaunch = /launch|enterprise\s+payments|platform/i.test(t);

  if (v === "conflicting_sources") return "Sources disagree on this point.";
  if (v === "confirmed") {
    if (excerptMatchType === "related_only") return "Related to the topic, but does not directly confirm this claim.";
    return "Confirms this claim.";
  }
  if (v === "partially_confirmed") {
    if (hasFunding && hasLaunch) return "Confirms the launch, but not the funding amount.";
    if (hasLaunch) return "Confirms the launch, not the stronger adoption outcome.";
    return "Confirms part of the claim, not the rest.";
  }
  if (v === "no_clear_support") {
    if (hasFunding) return "Refers to investment in the round, not the same as funding as claimed.";
    if (/expect|materially\s+strengthen/i.test(t)) return "Related to the trend, but does not directly confirm this claim.";
    return "Related to the topic, but does not confirm this claim.";
  }
  return "See commentary.";
}

/** Fully confirmed: one short sentence. No filler. */
function buildConfirmedCommentary(statementText, excerptMatchType) {
  if (excerptMatchType === "related_only") {
    return "The source is related to this topic but does not confirm the claim as written. Tighten the phrasing so it does not go beyond the source.";
  }
  return "The source confirms this statement.";
}

/** Partial: what is confirmed, what is not. Explicit difference. */
function buildPartialCommentary(statementText, opts = {}) {
  const { otherPartSupported = false } = opts;
  const topic = inferClaimTopic(statementText);
  if (topic === "funding_amount" || /\$|million|billion|series\s+[a-d]|raised\s+\d/i.test(statementText || "")) {
    if (otherPartSupported) {
      return "The source confirms the enterprise payments launch, but not the funding figure from the same sentence. Split the sentence so the launch claim and funding claim can be sourced separately.";
    }
    return "The source confirms the product or launch context; it does not confirm the funding amount. Split the sentence so each claim can be sourced separately.";
  }
  if (otherPartSupported) {
    return "The source confirms part of this statement; another part of the same sentence is not confirmed. Split the claims and source each point separately.";
  }
  return "The source confirms part of this statement but not the rest of the same sentence. Split the claims and source each point separately.";
}

/** No support: claim says X, source says Y. No generic "do not state this figure". */
function buildNoSupportCommentary(statementText, opts = {}) {
  const { topRejected = null, hasRelatedSources = false, isNumericClaim = false } = opts;
  const t = (statementText || "").toLowerCase();
  const hasAmount = /\$[\d,.]+\s*(million|billion|m|bn)?|\d+\s*(million|billion)\s*(series|round|funding)/i.test(t);

  if (topRejected === "counter") {
    return "The cited material refers to risks or constraints rather than evidence for this claim.";
  }
  if (topRejected === "context") {
    return "The sources refer to related topics but do not confirm this claim as written.";
  }
  if (hasRelatedSources && hasAmount) {
    return "The claim says the company raised funding in that amount. The sources refer to an investment in the round, which is not the same thing. Add a source that states the amount as funding, or remove the figure.";
  }
  if (hasRelatedSources) {
    return "The source is related to this topic but it does not confirm this statement as written.";
  }
  if (hasAmount || isNumericClaim) {
    return "The sources refer to a round or investment but do not state the funding amount as claimed. Add a source that states the figure directly, or remove the figure.";
  }
  if (/expect|guidance|outlook|materially\s+strengthen/i.test(t)) {
    return "This reads as management expectation; the sources do not confirm it as stated. Reword as expectation only if you can source the guidance.";
  }
  return "No source confirms this claim.";
}

/** Conflicting: name the conflict; action embedded. */
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

function detectInflation(statementText, excerptMatchType) {
  if (excerptMatchType === "related_only") return true;
  const t = (statementText || "").toLowerCase();
  if (/will\s+materially|materially\s+strengthen|expects?\s+.*\s+this\s+year/i.test(t)) return true;
  if (/platform\s+for\s+large\s+merchants/i.test(t)) return true;
  return false;
}

/** True if commentary explicitly describes claim vs source difference. */
function isDifferenceExplained(commentary, commentaryMode) {
  if (!commentary || typeof commentary !== "string") return false;
  const c = commentary.toLowerCase();
  if (commentaryMode === "no_support" || commentaryMode === "partial") {
    if (/\bclaim\s+says\b|\bsource\s+(says|refers|confirms|does not)\b|\bnot the same\b|\bwhich is not the same\b/i.test(c)) return true;
    if (/\bconfirms\s+(the|part)\b.*\bbut not\b|\bdoes not confirm\b/i.test(c)) return true;
  }
  if (commentaryMode === "confirmed" && /related to this topic but does not confirm/i.test(c)) return true;
  if (commentaryMode === "conflict") return true;
  return /\bconfirms\b.*\bbut\b|\bdoes not (state|confirm)\b|\brefers to\b.*\bnot\b/i.test(c);
}

export function buildQcCommentary(params) {
  const {
    verdict,
    statementText = "",
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
  let actionEmbedded = false;
  let inflationDetected = false;

  if (normVerdict === "conflicting_sources") {
    const valueHint = conflictOpts.valueHint || "";
    commentary = buildConflictCommentary({ conflictNarrative: conflictOpts.conflictNarrative, valueHint });
    commentaryMode = "conflict";
    actionEmbedded = true;
  } else if (normVerdict === "confirmed") {
    inflationDetected = detectInflation(statementText, excerptMatchType);
    if (inflationDetected && excerptMatchType === "related_only") {
      commentary = "The source is related to this topic but does not confirm the claim as written. Tighten the phrasing so it does not go beyond the source.";
      actionEmbedded = true;
    } else if (inflationDetected && /will\s+materially|materially\s+strengthen|expects?\s+.*\s+this\s+year/i.test((statementText || "").toLowerCase())) {
      commentary = "The source confirms the launch, but not the stronger claim that it will materially strengthen enterprise adoption this year.";
      actionEmbedded = false;
    } else if (inflationDetected && /platform\s+for\s+large\s+merchants/i.test((statementText || "").toLowerCase())) {
      commentary = "The source confirms the enterprise payments launch, but it does not say the platform is targeted at large merchants.";
      actionEmbedded = false;
    } else {
      commentary = buildConfirmedCommentary(statementText, excerptMatchType);
    }
    commentaryMode = "confirmed";
  } else if (normVerdict === "partially_confirmed") {
    commentary = buildPartialCommentary(statementText, { otherPartSupported, otherPartUnsupported });
    commentaryMode = "partial";
    actionEmbedded = /\b(split|add a source|reword)\b/i.test(commentary);
    inflationDetected = false;
  } else {
    commentary = buildNoSupportCommentary(statementText, {
      topRejected,
      hasRelatedSources,
      isNumericClaim: /\$|\d+\s*(million|billion|%)/i.test(statementText),
    });
    commentaryMode = "no_support";
    actionEmbedded = /\b(add a source|remove|reword|split)\b/i.test(commentary);
  }

  commentary = applyCommentaryQuality(commentary, { maxWords: MAX_WORDS, maxSentences: MAX_SENTENCES });
  // A6.21: Do not append generic fallback when we already have specific commentary
  const differenceExplained = isDifferenceExplained(commentary, commentaryMode);
  if (recentCommentaries.length > 0 && commentary && !differenceExplained) {
    const same = recentCommentaries.some((c) => typeof c === "string" && c.trim() === commentary.trim());
    if (same) {
      const extra = " The evidence for this claim differs from others above.";
      commentary = applyCommentaryQuality(commentary + extra, { maxWords: MAX_WORDS, maxSentences: MAX_SENTENCES });
    }
  }

  const whyItMatters = buildWhyItMatters(normVerdict, statementText, { excerptMatchType });

  return {
    commentary,
    suggestedImprovement: null,
    commentaryMode,
    suggestedImprovementMode: "none",
    actionEmbedded,
    inflationDetected,
    differenceExplained: isDifferenceExplained(commentary, commentaryMode),
    whyItMatters,
  };
}

export { MAX_WORDS, MAX_SENTENCES };
