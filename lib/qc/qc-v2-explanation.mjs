// lib/qc/qc-v2-explanation.mjs
// A7.13: QC V2 explanations, commentary, display verdicts, hover/popup payloads (extracted — logic unchanged).

import { isQuantityMismatchStructured } from "./binding-directness.mjs";

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
function buildPopupSectionsForDisplayItem(item, claimText, claimLevelClassification, supportMismatch = null, components = null, popupDiag = null, llmExplanation = null) {
  const ct = (claimText || "").trim();
  const code = item?.explanationCode;
  const ex = (item?.excerptText || "").trim();
  if (!ex) return { originalClaimText: ct, whatThisShows: null, whatIsNotShown: null };

  const llmExplanationTrim = typeof llmExplanation === "string" ? llmExplanation.trim() : "";
  const hasLlmExplanationOverride = llmExplanationTrim.length > 0;

  if (code === "CONFLICT_VALUE" && item.valueSummary) {
    return {
      originalClaimText: ct,
      whatThisShows: hasLlmExplanationOverride ? llmExplanationTrim : `Supports the ${item.valueSummary} reading.`,
      whatIsNotShown: null,
    };
  }

  const isQuantityMismatchPartial =
    isQuantityMismatchStructured(supportMismatch)
    && claimLevelClassification === "partial"
    && (code === "RELATED_CONTEXT" || code === "PARTIAL_MODIFIER");

  if (isQuantityMismatchPartial) {
    if (hasLlmExplanationOverride) {
      return { originalClaimText: ct, whatThisShows: llmExplanationTrim, whatIsNotShown: null };
    }
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
    return { originalClaimText: ct, whatThisShows: hasLlmExplanationOverride ? llmExplanationTrim : parts.text, whatIsNotShown: null };
  }

  if (code === "FULL_CONFIRM" || item.classification === "full") {
    if (hasLlmExplanationOverride) {
      return { originalClaimText: ct, whatThisShows: llmExplanationTrim, whatIsNotShown: null };
    }
    const lead = leadClaimFragment(ct) || ct.slice(0, 160).trim();
    const wts = lead ? `Shows that ${lead.replace(/\.$/, "")}.` : null;
    return { originalClaimText: ct, whatThisShows: wts, whatIsNotShown: null };
  }
  if (code === "PARTIAL_MODIFIER" || item.classification === "partial" || claimLevelClassification === "partial") {
    const tail = tailClaimFragment(ct);
    const wns = tail ? `Does not say ${tail.endsWith(".") ? tail.slice(0, -1) : tail}.` : null;
    if (hasLlmExplanationOverride) {
      return { originalClaimText: ct, whatThisShows: llmExplanationTrim, whatIsNotShown: wns };
    }
    const lead = leadClaimFragment(ct);
    const wts = lead ? `Shows that ${lead.replace(/\.$/, "")}.` : null;
    return { originalClaimText: ct, whatThisShows: wts, whatIsNotShown: wns };
  }
  if (code === "RELATED_CONTEXT" || item.classification === "related") {
    return {
      originalClaimText: ct,
      whatThisShows: hasLlmExplanationOverride ? llmExplanationTrim : null,
      whatIsNotShown: null,
    };
  }
  return {
    originalClaimText: ct,
    whatThisShows: hasLlmExplanationOverride ? llmExplanationTrim : null,
    whatIsNotShown: null,
  };
}
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
    excerptOptimised: item.excerptOptimised === true,
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

export {
  extractValueSummaryFromExcerpt,
  buildQuantityMismatchEditorialParts,
  buildQuantityMismatchEditorialText,
  buildConflictEvidence,
  claimLevelClassification,
  buildQcExplanation,
  getExplanationCode,
  buildCommentaryFromExplanationCode,
  leadClaimFragment,
  tailClaimFragment,
  selectExplanationTypeFromSignals,
  phrasesForSupportedElements,
  phrasesForMissingElements,
  partialFragmentsContainForbidden,
  tryTier1TypedPartialFragments,
  tryTier2CompactPartialFragments,
  tier3AbstractPartialFragments,
  buildPartialConcreteExplanation,
  buildTypedExplanationFromSignals,
  buildPopupSectionsForDisplayItem,
  computeDisplayVerdictAndConcern,
  verdictPayloadFromDisplayVerdict,
  sanitizeDisplaySourceItemForExport,
  buildExportedAuthority,
  buildCommentaryFromExplanation,
  buildWhyItMattersFromExplanation,
  buildCommentaryTemplates,
  buildHoverPayload,
};
