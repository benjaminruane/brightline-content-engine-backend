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
    const v3Sources = candidateSources
      .map((source, index) => {
        const text = typeof source?.text === "string" ? source.text : "";
        if (!text.trim()) return null;
        const label =
          (typeof source?.label === "string" && source.label.trim()) ||
          (typeof source?.name === "string" && source.name.trim()) ||
          (typeof source?.title === "string" && source.title.trim()) ||
          `Source ${index + 1}`;
        return { text, label };
      })
      .filter(Boolean);
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
    const pipelineOptions = {
      ...(body?.options || {}),
      traceId,
      requiredVersion,
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
    const qcCards = Array.isArray(pipelineResult?.qcCards) ? pipelineResult.qcCards : [];
    if (qcCards.length === 0) {
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

    return res.status(200).json({
      ok: true,
      statements,
      references: [],
      meta: {
        pipelineVersion: useV4 ? "v4" : "v3",
        stagesComplete: pipelineResult?._stagesComplete ?? null,
        traceId,
      },
      bannedWordHits,
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
