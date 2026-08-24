// A9.14: When evidence review is disabled, finish QC after statement extraction with skipped qcCards,
// run editorial/compliance only, and return a valid QC API payload (no evidence pipeline).

import { validateQcResponse } from "./qc-api-schema.mjs";
import { runEditorialComplianceReview } from "./editorial-compliance-reviewer.mjs";
import {
  normalizeOutputType,
  normalizeVisibility,
} from "../output-intent.js";

function normalizeReferenceSourceType(ref) {
  if (!ref || typeof ref !== "object") return ref;
  const url = ref.url;
  const type = ref.type;
  const existing = ref.sourceType;
  const isWeb =
    (url && /^https?:\/\//i.test(String(url))) ||
    type === "web" ||
    existing === "web" ||
    existing === "web_search";
  return { ...ref, sourceType: isWeb ? "web_search" : "uploaded" };
}

export function buildSkippedEvidenceQcCard(stmt) {
  const text = typeof stmt?.text === "string" ? stmt.text : "";
  return {
    statement: text,
    supportState: "skipped",
    concernState: "none",
    displayVerdict: "Not reviewed",
    concernLevel: "none",
    sentenceSubclaimCount: null,
    qcClaimId: null,
    originalClaimText: null,
    supportRefIds: [],
    supportRefTitles: [],
    primaryRefId: null,
    primaryRefTitle: null,
    primarySourceOrigin: null,
    primaryExcerpt: null,
    primaryExcerptText: null,
    primaryExcerptStart: null,
    primaryExcerptEnd: null,
    secondarySupportCount: 0,
    supportingReferenceIds: [],
    supportingReferenceTitles: [],
    hasRealExcerpt: false,
    hasConflict: false,
    conflictValues: null,
    reasoningHeadline: null,
    reasoningParagraph: null,
    displayMode: "unsupported",
    draftSpan: stmt?.draftSpan ?? null,
    selectedExcerptReason: null,
    excerptMatchType: "none",
    suggestedImprovement: null,
    whyItMatters: null,
    primaryExcerptTrusted: false,
  };
}

/**
 * @param {object} ctx
 * @param {object[]} ctx.statements
 * @param {string} ctx.draftText
 * @param {object} ctx.body
 * @param {object[]} ctx.unifiedReferences
 * @param {object} ctx.webObs
 * @param {boolean} ctx.webEnabled
 * @param {string} ctx.webMode
 * @param {string|null} ctx.runId
 * @param {string|null} ctx.reqSig
 * @param {boolean} ctx.selectionUsed
 * @param {string|null} ctx.selectionHash
 * @param {string} ctx.selectedText
 * @param {object} ctx.llmClaimExtractionMeta
 * @param {object[]|null} ctx.sourceIngestionWarnings
 * @param {string|null} ctx.sourceIngestionWarningMessage
 * @param {boolean} ctx.totalTextLowWarning
 * @param {object[]|null} ctx.extractionGuardrailResults
 * @param {object[]} ctx.sources
 */
export async function finalizeEvidenceSkippedReview(ctx) {
  const {
    statements: inputStatements,
    draftText,
    body,
    unifiedReferences,
    webObs,
    webEnabled,
    webMode,
    runId,
    reqSig,
    selectionUsed,
    selectionHash,
    selectedText,
    llmClaimExtractionMeta,
    sourceIngestionWarnings,
    sourceIngestionWarningMessage,
    totalTextLowWarning,
    extractionGuardrailResults,
    sources,
  } = ctx;

  const stmts = Array.isArray(inputStatements) ? inputStatements : [];
  const editorialEnabled = !(body?.editorialEnabled === false || body?.editorial_enabled === false);
  const complianceEnabled = !(body?.complianceEnabled === false || body?.compliance_enabled === false);

  const prepared = stmts.map((stmt, idx) => {
    if (!stmt || typeof stmt !== "object") return stmt;
    const next = {
      ...stmt,
      id: stmt.id ?? `stmt_skip_${idx}`,
      citations: undefined,
      evidence: undefined,
      assessment: {
        ...(stmt.assessment && typeof stmt.assessment === "object" ? stmt.assessment : {}),
        reasons: [],
        citations: [],
        reliabilityLabel: "Low",
        reliabilityScore: 20,
      },
      evidenceBundle: {
        reasoning: { headline: "skipped", paragraph: null },
        supportBindings: [],
      },
    };
    next.qcCard = buildSkippedEvidenceQcCard(next);
    return next;
  });

  const normalizedRefs = (unifiedReferences || []).map(normalizeReferenceSourceType);
  const uploadedReferencesLen = normalizedRefs.filter((r) => r?.sourceType === "uploaded").length;
  const webRefsLen = Math.max(0, normalizedRefs.length - uploadedReferencesLen);

  const finalResponseObject = {
    ok: true,
    statements: prepared,
    references: normalizedRefs,
    meta: {
      web: {
        enabled: webEnabled,
        used: false,
        provider: "tavily",
        mode: webMode,
        references: [],
        usedReferenceIds: [],
      },
      webSearch: webObs != null ? { ...webObs, used: false } : { enabled: !!webEnabled, used: false },
      extractionQuality: "ok",
      uploadedSourcesCount: uploadedReferencesLen,
      webSourcesCount: webRefsLen,
      selectionUsed: !!selectionUsed,
      selectionHash: selectionHash || null,
      selectionPreview:
        selectionUsed && selectedText
          ? selectedText.length <= 120
            ? selectedText
            : `${selectedText.substring(0, 120)}...`
          : null,
      llmClaimExtraction: llmClaimExtractionMeta || { fallback_mode: true },
      reviewOptions: {
        evidenceEnabled: false,
        editorialEnabled,
        complianceEnabled,
      },
      evidenceReviewSkipped: true,
      fullPipelineCompleted: true,
      fullPipelineCheckpoint: "evidence_skipped_fast_path",
    },
  };

  if (sourceIngestionWarnings && sourceIngestionWarnings.length > 0) {
    finalResponseObject.meta.sourceIngestionWarnings = sourceIngestionWarnings;
  }
  if (sourceIngestionWarningMessage) {
    finalResponseObject.meta.sourceIngestionWarning = sourceIngestionWarningMessage;
  }
  if (totalTextLowWarning) {
    finalResponseObject.meta.totalTextLowWarning = true;
  }
  if (Array.isArray(extractionGuardrailResults) && extractionGuardrailResults.length > 0) {
    finalResponseObject.meta.extractionGuardrailResults = extractionGuardrailResults;
  }
  if (Array.isArray(sources)) {
    finalResponseObject.meta.sourcesCount = sources.length;
  }

  const visibleForEditorial = prepared.filter(
    (s) => s && typeof s === "object" && s.qcCard && typeof s.qcCard === "object" && s.qcCard.suppressInQcWorkbench !== true
  );
  try {
    const authoringOrganisation =
      typeof body?.options?.authoringOrganisation === "string" && body.options.authoringOrganisation.trim()
        ? body.options.authoringOrganisation.trim()
        : typeof body?.authoringOrganisation === "string" && body.authoringOrganisation.trim()
          ? body.authoringOrganisation.trim()
          : null;
    await runEditorialComplianceReview(visibleForEditorial, {
      outputType: normalizeOutputType(body?.outputType),
      requiredVersion: normalizeVisibility(body?.visibility ?? body?.requiredVersion),
      draftText: typeof draftText === "string" ? draftText : "",
      sources: Array.isArray(sources) ? sources : [],
      editorialEnabled,
      complianceEnabled,
      authoringOrganisation,
    });
  } catch (editorialErr) {
    console.warn("[EDITORIAL_COMPLIANCE_ERROR][EVIDENCE_SKIP]", editorialErr?.message || String(editorialErr));
  }

  validateQcResponse(finalResponseObject);
  return finalResponseObject;
}
