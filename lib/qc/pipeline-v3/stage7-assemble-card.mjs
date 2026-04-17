function mapVerdictToSupportState(verdict) {
  if (verdict === "confirmed") return "supported";
  if (verdict === "partially_confirmed") return "partial";
  if (verdict === "conflicting") return "conflicting";
  if (verdict === "not_supported") return "not_supported";
  return "not_supported";
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
  return {
    index: Number.isFinite(statementIndex) ? statementIndex : 0,
    statement: "",
    charStart: 0,
    charEnd: 0,
    supportState: "not_supported",
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
    displayMode: "not_supported",
    draftSpan: { startChar: 0, endChar: 0 },
    evidenceTrace: [],
    selectedExcerptReason: null,
    excerptMatchType: "none",
    suggestedImprovement: null,
    whyItMatters: null,
    displayVerdict: null,
    concernLevel: null,
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

export function assembleCard(statementEntry, statementIndex) {
  try {
    const entry = statementEntry && typeof statementEntry === "object" ? statementEntry : {};
    const verdict = entry?.verdictResult?.verdict;
    const supportState = mapVerdictToSupportState(verdict);
    const hasConflict = entry?.verdictResult?.hasConflict === true;
    const primaryExcerpt = entry?.excerptResult?.primaryExcerpt ?? null;
    const conflictExcerpt = entry?.excerptResult?.conflictExcerpt ?? null;

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
      supportRefIds: [],
      supportRefTitles: [],
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
      displayVerdict: null,
      concernLevel: null,
      sentenceSubclaimCount: null,
      qcClaimId: null,
      originalClaimText: statement || null,
      citationHovers: [],
      primaryExcerptTrusted: false,
      conflictEvidence: null,
      pipelineVersion: "v3",
      ...editorial,
    };
  } catch {
    return safeCard(statementIndex);
  }
}
