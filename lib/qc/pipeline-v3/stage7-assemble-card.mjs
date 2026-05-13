import { logCanaryScore } from "../../observability.js";
import { recomputeV4EditorialVerdictFromConcerns } from "../editorial-compliance-reviewer.mjs";

/** R3.4: Editorial concern codes dropped when Evidence verdict is conflicting (v4 assembly only). */
const SUPPRESSED_ON_EVIDENCE_CONFLICT = new Set([
  "overreach_unsupported_causal",
  "internal_plausibility",
]);

function mapVerdictToSupportState(verdict) {
  if (verdict === "confirmed") return "supported";
  if (verdict === "partially_confirmed") return "partial";
  if (verdict === "conflicting") return "conflicting";
  if (verdict === "not_supported") return "not_supported";
  return "not_supported";
}

function mapSupportStateToDisplayVerdict(supportState) {
  if (supportState === "supported") return "supported_full";
  if (supportState === "partial") return "supported_partial";
  if (supportState === "conflicting") return "conflict";
  return "not_supported";
}

function mapSupportStateToConcernLevel(supportState) {
  if (supportState === "supported") return "none";
  if (supportState === "partial") return "moderate";
  if (supportState === "conflicting") return "high";
  return "high";
}

function safeEditorialDefaults() {
  return {
    editorialVerdict: "clean",
    editorialConcerns: [],
    editorialNote: null,
    editorialSuggestedDirection: null,
    editorialSuggestedRewrite: null,
    complianceVerdict: "clean",
    complianceConcerns: [],
    complianceNote: null,
    complianceSuggestedDirection: null,
    complianceSuggestedRewrite: null,
    suppressInQcWorkbench: false,
  };
}

function safeCard(statementIndex = 0) {
  const editorial = safeEditorialDefaults();
  const supportState = "not_supported";
  return {
    index: Number.isFinite(statementIndex) ? statementIndex : 0,
    statement: "",
    charStart: 0,
    charEnd: 0,
    supportState,
    hasConflict: false,
    primaryExcerpt: null,
    conflictExcerpt: null,
    evidenceSummary: "",
    supportRefIds: [],
    supportRefTitles: [],
    primaryRefId: null,
    primaryRefTitle: null,
    primarySourceOrigin: null,
    primaryExcerptText: null,
    primaryExcerptStart: null,
    primaryExcerptEnd: null,
    secondarySupportCount: 0,
    supportingReferenceIds: [],
    supportingReferenceTitles: [],
    hasRealExcerpt: false,
    conflictValues: null,
    reasoningHeadline: null,
    reasoningParagraph: null,
    displayMode: supportState,
    draftSpan: { startChar: 0, endChar: 0 },
    evidenceTrace: [],
    selectedExcerptReason: null,
    excerptMatchType: "none",
    suggestedImprovement: null,
    whyItMatters: null,
    displayVerdict: mapSupportStateToDisplayVerdict(supportState),
    concernLevel: mapSupportStateToConcernLevel(supportState),
    sentenceSubclaimCount: null,
    qcClaimId: null,
    originalClaimText: null,
    citationHovers: [],
    primaryExcerptTrusted: false,
    conflictEvidence: null,
    pipelineVersion: "v3",
    ...editorial,
  };
}

/**
 * @param {object} [assemblyContext]
 * @param {"v3"|"v4"} [assemblyContext.pipelineRoute]
 * @param {string} [assemblyContext.traceId]
 * @param {string} [assemblyContext.outputType]
 */
export function assembleCard(statementEntry, statementIndex, assemblyContext = {}) {
  try {
    const entry = statementEntry && typeof statementEntry === "object" ? statementEntry : {};
    const verdict = entry?.verdictResult?.verdict;
    const supportState = mapVerdictToSupportState(verdict);
    const displayVerdict = mapSupportStateToDisplayVerdict(supportState);
    const concernLevel = mapSupportStateToConcernLevel(supportState);
    const hasConflict = entry?.verdictResult?.hasConflict === true;
    const primaryExcerpt = entry?.excerptResult?.primaryExcerpt ?? null;
    const conflictExcerpt = entry?.excerptResult?.conflictExcerpt ?? null;
    const confirmingMatches = Array.isArray(entry?.verdictResult?.confirmingMatches)
      ? entry.verdictResult.confirmingMatches
      : [];
    const supportRefIds = confirmingMatches
      .map((m) => m?.sourceIndex)
      .filter((v) => Number.isFinite(v));
    const supportRefTitles = confirmingMatches
      .map((m) => (typeof m?.sourceLabel === "string" ? m.sourceLabel : ""))
      .filter((v) => v.trim().length > 0);

    const editorialDefaults = safeEditorialDefaults();
    const editorial = entry?.editorialResult && typeof entry.editorialResult === "object"
      ? {
          editorialVerdict:
            typeof entry.editorialResult.editorialVerdict === "string"
              ? entry.editorialResult.editorialVerdict
              : editorialDefaults.editorialVerdict,
          editorialConcerns: Array.isArray(entry.editorialResult.editorialConcerns)
            ? entry.editorialResult.editorialConcerns
            : editorialDefaults.editorialConcerns,
          editorialNote:
            typeof entry.editorialResult.editorialNote === "string"
              ? entry.editorialResult.editorialNote
              : null,
          editorialSuggestedDirection:
            typeof entry.editorialResult.editorialSuggestedDirection === "string"
              ? entry.editorialResult.editorialSuggestedDirection
              : null,
          editorialSuggestedRewrite:
            typeof entry.editorialResult.editorialSuggestedRewrite === "string"
              ? entry.editorialResult.editorialSuggestedRewrite
              : null,
          complianceVerdict:
            typeof entry.editorialResult.complianceVerdict === "string"
              ? entry.editorialResult.complianceVerdict
              : editorialDefaults.complianceVerdict,
          complianceConcerns: Array.isArray(entry.editorialResult.complianceConcerns)
            ? entry.editorialResult.complianceConcerns
            : editorialDefaults.complianceConcerns,
          complianceNote:
            typeof entry.editorialResult.complianceNote === "string"
              ? entry.editorialResult.complianceNote
              : null,
          complianceSuggestedDirection:
            typeof entry.editorialResult.complianceSuggestedDirection === "string"
              ? entry.editorialResult.complianceSuggestedDirection
              : null,
          complianceSuggestedRewrite:
            typeof entry.editorialResult.complianceSuggestedRewrite === "string"
              ? entry.editorialResult.complianceSuggestedRewrite
              : null,
          suppressInQcWorkbench: entry.editorialResult.suppressInQcWorkbench === true,
        }
      : editorialDefaults;

    let editorialOut = editorial;
    const pipelineRoute = assemblyContext?.pipelineRoute === "v4" ? "v4" : "v3";
    if (
      pipelineRoute === "v4" &&
      verdict === "conflicting" &&
      Array.isArray(editorial.editorialConcerns) &&
      editorial.editorialConcerns.length > 0
    ) {
      const traceId = typeof assemblyContext?.traceId === "string" ? assemblyContext.traceId : undefined;
      const idx = Number.isFinite(statementIndex) ? statementIndex : 0;
      const original = editorial.editorialConcerns;
      const kept = [];
      for (const c of original) {
        const code = typeof c?.concernCode === "string" ? c.concernCode : "";
        if (SUPPRESSED_ON_EVIDENCE_CONFLICT.has(code)) {
          logCanaryScore({
            traceId,
            name: "editorial_concern_suppressed_by_evidence",
            value: 1,
            metadata: {
              statementIndex: idx,
              suppressedRuleId: code,
              evidenceVerdict: "conflicting",
            },
          });
          continue;
        }
        kept.push(c);
      }
      if (kept.length !== original.length) {
        editorialOut = {
          ...editorial,
          editorialConcerns: kept,
          editorialVerdict: recomputeV4EditorialVerdictFromConcerns(kept, assemblyContext?.outputType),
        };
      }
    }

    const statement = typeof entry.statementText === "string" ? entry.statementText : "";
    const charStart = Number.isFinite(entry.startChar) ? entry.startChar : 0;
    const charEnd = Number.isFinite(entry.endChar) ? entry.endChar : charStart;
    const evidenceSummary =
      typeof entry?.commentaryResult?.commentary === "string" ? entry.commentaryResult.commentary : "";

    const primaryPassage = typeof primaryExcerpt?.passage === "string" ? primaryExcerpt.passage : "";
    const hasRealExcerpt = primaryPassage.trim().length > 0;

    return {
      index: Number.isFinite(statementIndex) ? statementIndex : 0,
      statement,
      charStart,
      charEnd,
      supportState,
      hasConflict,
      primaryExcerpt,
      conflictExcerpt,
      evidenceSummary,

      // Additional existing qcCard fields preserved for frontend compatibility.
      supportRefIds,
      supportRefTitles,
      primaryRefId: null,
      primaryRefTitle: primaryExcerpt?.sourceLabel ?? null,
      primarySourceOrigin: null,
      primaryExcerptText: hasRealExcerpt ? primaryPassage : null,
      primaryExcerptStart: null,
      primaryExcerptEnd: null,
      secondarySupportCount: 0,
      supportingReferenceIds: [],
      supportingReferenceTitles: [],
      hasRealExcerpt,
      conflictValues: null,
      reasoningHeadline: null,
      reasoningParagraph: evidenceSummary || null,
      displayMode: supportState,
      draftSpan: { startChar: charStart, endChar: charEnd },
      evidenceTrace: [],
      selectedExcerptReason: null,
      excerptMatchType: "none",
      suggestedImprovement: null,
      whyItMatters: null,
      displayVerdict,
      concernLevel,
      sentenceSubclaimCount: null,
      qcClaimId: null,
      originalClaimText: statement || null,
      citationHovers: [],
      primaryExcerptTrusted: false,
      conflictEvidence: null,
      pipelineVersion: "v3",
      ...editorialOut,
    };
  } catch {
    return safeCard(statementIndex);
  }
}
