// api/analyse-statements.js
//
// A3.7.6: Thin CORS-safe wrapper for analyse-statements.
// Lazy-loads implementation to ensure CORS headers are always set,
// even if the implementation module fails to import or initialize.
// A3.8.101: Use ESM dynamic import() to load ESM impl module

import { runPipelineV3 } from "../lib/qc/pipeline-v3/qc-pipeline-v3.mjs";
import { runPipelineV4 } from "../lib/qc/pipeline-v4/index.mjs";
import { createTraceId, flushObservability, startTrace, updateTraceMetadata } from "../lib/observability.js";
import { getDraftHashPrefix } from "../lib/draft-hash.js";
import { prepareUploadedSourcesForPipeline } from "../lib/extract-text-from-source.mjs";
import { normalizePublicationState } from "../lib/source-publication-state.mjs";
import {
  buildExcludedSources,
  buildResponseSources,
  shouldExcludePreparedSource,
  splitSourcesForResponse,
} from "../lib/response-sources.mjs";
import { scanDraftForAiProvenance } from "../lib/provenance-scan.mjs";
import { STAGE_MODELS } from "../lib/qc/model-config.mjs";
import { buildModelConfigRecord } from "../lib/qc/model-fingerprints.mjs";
import { reportModelDrift } from "../lib/qc/model-drift-reporter.mjs";

/** R3.3: soft observability threshold only — no truncation or rejection. */
const LONG_SOURCE_SOFT_CHAR_WARN = 60_000;

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin === "null" ? "*" : origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-brightline-diag");
}

const ROUTE = "analyse-statements";
const OUTPUT_TYPES = new Set([
  "reporting_commentary",
  "investor_letter",
  "press_release",
  "linkedin_post",
]);

function normalizeRequiredVersion(value) {
  const v = typeof value === "string" ? value.trim().toLowerCase() : "";
  return v === "public" ? "public" : "complete";
}

function resolveOutputType(body) {
  const fromOptions = typeof body?.options?.outputType === "string" ? body.options.outputType.trim() : "";
  if (OUTPUT_TYPES.has(fromOptions)) return fromOptions;
  const fromRoot = typeof body?.outputType === "string" ? body.outputType.trim() : "";
  if (OUTPUT_TYPES.has(fromRoot)) return fromRoot;
  const fromSelected = Array.isArray(body?.selectedTypes) && typeof body.selectedTypes[0] === "string"
    ? body.selectedTypes[0].trim()
    : "";
  if (OUTPUT_TYPES.has(fromSelected)) return fromSelected;
  return "";
}

/** Optional house name from request body. Absent or blank is null (env may still apply downstream). */
function resolveAuthoringOrganisation(body) {
  const fromOptions =
    typeof body?.options?.authoringOrganisation === "string" ? body.options.authoringOrganisation.trim() : "";
  if (fromOptions) return fromOptions;
  const fromRoot = typeof body?.authoringOrganisation === "string" ? body.authoringOrganisation.trim() : "";
  return fromRoot || null;
}

function resolveAuthoringOrganisationSource(body) {
  const fromOptions =
    typeof body?.options?.authoringOrganisation === "string" ? body.options.authoringOrganisation.trim() : "";
  if (fromOptions) return "argument";
  const fromRoot = typeof body?.authoringOrganisation === "string" ? body.authoringOrganisation.trim() : "";
  if (fromRoot) return "request";
  return null;
}

/** B29: Review toggles from request body root or options; default true when absent. */
function resolveReviewOptions(body) {
  const opts = body?.options && typeof body.options === "object" ? body.options : {};
  const flag = (rootKey, optKey) => !(body?.[rootKey] === false || opts[optKey] === false);
  return {
    evidenceEnabled: flag("evidenceEnabled", "evidenceEnabled"),
    editorialEnabled: flag("editorialEnabled", "editorialEnabled"),
    complianceEnabled: flag("complianceEnabled", "complianceEnabled"),
  };
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeBannedWords(input) {
  if (!Array.isArray(input)) return [];
  return Array.from(
    new Set(
      input
        .map((word) => (typeof word === "string" ? word.trim().toLowerCase() : ""))
        .filter(Boolean)
    )
  );
}

function extractSentenceAtIndex(text, index) {
  if (typeof text !== "string" || index < 0 || index >= text.length) return "";
  const left = text.slice(0, index + 1);
  const right = text.slice(index);
  const startOffset = Math.max(left.lastIndexOf("."), left.lastIndexOf("!"), left.lastIndexOf("?"));
  let endOffset = right.search(/[.!?]/);
  if (endOffset === -1) endOffset = right.length - 1;
  const start = startOffset === -1 ? 0 : startOffset + 1;
  const end = index + endOffset + 1;
  return text.slice(start, end).trim();
}

function getBannedWordHits(draftText, bannedWords) {
  const safeText = typeof draftText === "string" ? draftText : "";
  if (!safeText.trim()) return [];
  const out = [];
  for (const word of bannedWords) {
    const pattern = new RegExp(`\\b${escapeRegex(word)}\\b`, "gi");
    let match;
    while ((match = pattern.exec(safeText)) !== null) {
      out.push({
        word,
        sentence: extractSentenceAtIndex(safeText, match.index),
      });
    }
  }
  return out;
}

function mimeTypeForDropLog(original) {
  const m = original && typeof original.mimeType === "string" ? original.mimeType.trim() : "";
  return m || "(none)";
}

export default async function handler(req, res) {
  const rid = (req.headers && req.headers["x-brightline-rid"]) || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  req._brightlineRid = rid;
  console.log("[A3.14.5][HANDLER_ENTER]", { rid, route: ROUTE });

  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  try {
    const traceId = createTraceId();
    const body = typeof req?.body === "string" ? JSON.parse(req.body) : (req?.body || {});
    const draftText = typeof body?.draftText === "string" ? body.draftText : "";
    const candidateSources = Array.isArray(body?.uploadedSources)
      ? body.uploadedSources
      : Array.isArray(body?.sources)
        ? body.sources
        : [];

    const prep = await prepareUploadedSourcesForPipeline(candidateSources);
    const preparedSources = candidateSources.map((original, i) => {
      const row = Array.isArray(prep.sources) && i < prep.sources.length ? prep.sources[i] : null;
      if (row) return row;
      return {
        text: "",
        name: original?.name,
        title: original?.title,
        label: original?.label,
        mimeType: original?.mimeType,
        publicationState: normalizePublicationState(original?.publicationState),
      };
    });

    // R7.B46 / F13: split empty-text + unsupported_scanned sources out so they
    // never enter the aligned `sources` array (index === sourceIndex === supportSpans.sourceRefId).
    const { kept: v3Sources, dropped: droppedForExclude } = splitSourcesForResponse(
      preparedSources,
      candidateSources
    );
    {
      let dropIdx = 0;
      for (let i = 0; i < preparedSources.length; i++) {
        if (!shouldExcludePreparedSource(preparedSources[i])) continue;
        const entry = droppedForExclude[dropIdx++];
        if (!entry) continue;
        console.warn(
          `[analyse-statements] source dropped after extraction: label=${entry.label}, mimeType=${mimeTypeForDropLog(
            candidateSources[i]
          )}, reason=${entry.reason}`
        );
      }
    }

    for (const source of v3Sources) {
      if (source.text.length > LONG_SOURCE_SOFT_CHAR_WARN) {
        console.warn(
          `[analyse-statements] long source: label=${source.label}, charCount=${source.text.length}. Stage 2 chunking not yet implemented.`
        );
      }
    }
    const sourceLabels = v3Sources.map((source) => source.label);
    const sourceCount = new Set(sourceLabels).size;
    const requiredVersion = normalizeRequiredVersion(
      body?.options?.requiredVersion ??
        body?.options?.visibility ??
        body?.versionType ??
        body?.visibility ??
        body?.requiredVersion
    );
    const outputType = resolveOutputType(body);
    const reviewOptions = resolveReviewOptions(body);
    const pipelineOptions = {
      ...(body?.options || {}),
      traceId,
      requiredVersion,
      evidenceEnabled: reviewOptions.evidenceEnabled,
      editorialEnabled: reviewOptions.editorialEnabled,
      complianceEnabled: reviewOptions.complianceEnabled,
      authoringOrganisation: resolveAuthoringOrganisation(body),
      authoringOrganisationSource: resolveAuthoringOrganisationSource(body),
    };
    if (outputType) {
      pipelineOptions.outputType = outputType;
    }
    const runStartedAt = new Date().toISOString();
    const draftMetadata = {
      draftHash: getDraftHashPrefix(draftText),
      draftCharCount: draftText.length,
      sourceCount,
      sourceLabels,
      requiredVersion,
      runStartedAt,
    };
    startTrace({
      traceId,
      traceName: "qc-run",
      metadata: draftMetadata,
    });

    const useV4 =
      process.env.QC_PIPELINE_V4 === "1" || (body?.options && body.options.pipelineRoute === "v4");
    console.log(`[handler] route selected: ${useV4 ? "v4" : "v3"}`);
    if (useV4) {
      updateTraceMetadata(traceId, { pipelineRoute: "v4" });
    }

    if (outputType) {
      updateTraceMetadata(traceId, { outputType });
    } else {
      console.warn("[langfuse] outputType missing or invalid for qc-run trace", {
        rawOptionsOutputType: body?.options?.outputType,
        rawRootOutputType: body?.outputType,
        rawSelectedType: Array.isArray(body?.selectedTypes) ? body.selectedTypes[0] : undefined,
      });
    }

    const pipelineResult = useV4
      ? await runPipelineV4(draftText, v3Sources, pipelineOptions)
      : await runPipelineV3(draftText, v3Sources, pipelineOptions);
    const nothingReviewed = pipelineResult?.nothingReviewed === true;
    const qcCards = Array.isArray(pipelineResult?.qcCards) ? pipelineResult.qcCards : [];
    if (qcCards.length === 0 && !nothingReviewed) {
      throw new Error("QC pipeline returned empty qcCards");
    }

    const stage1Statements = Array.isArray(pipelineResult?.stage1?.statements)
      ? pipelineResult.stage1.statements
      : [];
    updateTraceMetadata(traceId, { statementCount: stage1Statements.length });
    const statements = qcCards.map((card, index) => {
      const statementText =
        (typeof card?.statement === "string" && card.statement) ||
        (typeof stage1Statements[index]?.text === "string" ? stage1Statements[index].text : "");
      return {
        id: String(card.index),
        text: statementText,
        qcCard: card,
        draftSpan:
          card?.draftSpan && typeof card.draftSpan === "object"
            ? card.draftSpan
            : (Number.isFinite(card?.charStart) && Number.isFinite(card?.charEnd)
                ? { startChar: card.charStart, endChar: card.charEnd }
                : null),
      };
    });

    const bannedWords = normalizeBannedWords(body?.bannedWords);
    const bannedWordHits = bannedWords.length > 0 ? getBannedWordHits(draftText, bannedWords) : [];
    // B45: deterministic AI-tool tracking URL scan (additive; no verdict/pipeline change)
    const provenanceFlags = scanDraftForAiProvenance(draftText);

    // R7.B46: Exact-string contract — sources[i].text === v3Sources[i].text (B40 string).
    // Alignment: sources index === sourceIndex === supportSpans.sourceRefId.
    // Inline full text ~20KB/longform PDF; large/many-source cases may later warrant
    // truncation or fetch-on-open — not built here.
    const sources = buildResponseSources(v3Sources);
    const excludedSources = buildExcludedSources(droppedForExclude);

    // Which serving configuration produced this run. Additive; not surfaced in
    // the main UI. Stage 2 verdicts can move with no code change, so the
    // fingerprint is recorded alongside the output it produced.
    const modelConfig = buildModelConfigRecord({ qcCards, ranAt: runStartedAt });
    await reportModelDrift({
      stage: "stage2",
      model: STAGE_MODELS["stage2-matching"].model,
      fingerprints: modelConfig.stage2Fingerprints,
    });

    return res.status(200).json({
      ok: true,
      statements,
      references: [],
      // R7.B46: aligned reviewed sources + separately listed excluded (empty-text) sources
      sources,
      excludedSources,
      meta: {
        pipelineVersion: useV4 ? "v4" : "v3",
        stagesComplete: pipelineResult?._stagesComplete ?? null,
        traceId,
        reviewOptions: pipelineResult?.reviewOptions ?? reviewOptions,
        modelConfig,
        ...(pipelineResult?.evidenceReviewSkipped === true ? { evidenceReviewSkipped: true } : {}),
        ...(nothingReviewed ? { nothingReviewed: true } : {}),
      },
      bannedWordHits,
      provenanceFlags,
    });
  } catch (err) {
    console.error("[QC_V3_HANDLER_ERROR]", err?.message || String(err));
    const safeInternalErrorPayload = {
      ok: false,
      statements: [],
      references: [],
      meta: {
        fatal: err?.message ? String(err.message).slice(0, 300) : "Internal error",
        fatalStage: "route_exception",
        extractionQuality: "failed",
        extractionQualityReasons: ["route_exception"],
      },
    };
    res.status(200).json(safeInternalErrorPayload);
    return;
  } finally {
    await flushObservability();
  }
}
