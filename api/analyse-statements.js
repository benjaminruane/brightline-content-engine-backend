// api/analyse-statements.js
//
// A3.7.6: Thin CORS-safe wrapper for analyse-statements.
// Lazy-loads implementation to ensure CORS headers are always set,
// even if the implementation module fails to import or initialize.
// A3.8.101: Use ESM dynamic import() to load ESM impl module

import { runPipelineV3 } from "../lib/qc/pipeline-v3/qc-pipeline-v3.mjs";

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin === "null" ? "*" : origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-brightline-diag");
}

const ROUTE = "analyse-statements";

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
  const USE_V3 = process.env.BRIGHTLINE_QC_V3 === "1";
  const rid = (req.headers && req.headers["x-brightline-rid"]) || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  req._brightlineRid = rid;
  console.log("[A3.14.5][HANDLER_ENTER]", { rid, route: ROUTE });
  console.log(USE_V3 ? "qc-handler: using v3 pipeline" : "qc-handler: using v2 pipeline (default)");

  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  if (USE_V3) {
    try {
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

      const v3 = await runPipelineV3(draftText, v3Sources, body?.options || {});
      const qcCards = Array.isArray(v3?.qcCards) ? v3.qcCards : [];
      if (qcCards.length === 0) {
        throw new Error("V3 pipeline returned empty qcCards");
      }

      const stage1Statements = Array.isArray(v3?.stage1?.statements) ? v3.stage1.statements : [];
      const statements = qcCards.map((card, index) => {
        const statementText =
          (typeof card?.statement === "string" && card.statement) ||
          (typeof stage1Statements[index]?.text === "string" ? stage1Statements[index].text : "");
        return {
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

      const draftForBannedWords = typeof body?.draftText === "string" ? body.draftText : "";
      const bannedWords = normalizeBannedWords(body?.bannedWords);
      const bannedWordHits = bannedWords.length > 0 ? getBannedWordHits(draftForBannedWords, bannedWords) : [];

      return res.status(200).json({
        ok: true,
        statements,
        references: [],
        meta: {
          pipelineVersion: "v3",
          stagesComplete: v3?._stagesComplete ?? null,
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
      return res.status(200).json(safeInternalErrorPayload);
    }
  }

  const implHref = "./analyse-statements-entry.js";
  console.log("[A3.9.35][WRAPPER_MARKER]", {
    rid,
    route: ROUTE,
    method: req.method,
    ts: new Date().toISOString(),
    selectionUsed: Boolean(req.body && req.body.selectionText),
  });

  try {
    const mod = await import(implHref);
    const implHandler = mod?.default;

    if (typeof implHandler !== "function") {
      throw new Error("analyse-statements-entry.js default export is not a function");
    }

    const payload = await implHandler(req, res);

    let safePayload = payload != null ? payload : {
      ok: false,
      statements: [],
      references: [],
      meta: { fatal: "Internal error", fatalStage: "route_exception", extractionQuality: "failed", extractionQualityReasons: ["internal_error"] },
    };
    const draftText = typeof req?.body?.draftText === "string" ? req.body.draftText : "";
    const bannedWords = normalizeBannedWords(req?.body?.bannedWords);
    const bannedWordHits = bannedWords.length > 0 ? getBannedWordHits(draftText, bannedWords) : [];
    safePayload = {
      ...safePayload,
      bannedWordHits,
    };
    // X1.2b: Reject PDF-as-inline with 400. X1.3: 422 when ENFORCE_INGESTION_GUARDS=1 and extraction ERROR
    const ingestionErrorCode = safePayload?.meta?.sourceIngestionError?.code;
    const guardStatusCode = safePayload?.meta?.extractionGuardStatusCode;
    let statusCode = 200;
    if (guardStatusCode === 422) statusCode = 422;
    else if (ingestionErrorCode === "PDF_INLINE_TEXT_NOT_ALLOWED") statusCode = 400;
    console.log("[A3.14.5][RES_SEND]", { rid, route: ROUTE, ok: safePayload?.ok, statements: safePayload?.statements?.length ?? null, statusCode });
    res.status(statusCode).json(safePayload);
    return;
  } catch (err) {
    setCorsHeaders(req, res);
    console.log("[A3.9.35][WRAPPER_IMPORT_FAIL]", { rid, name: err?.name, message: err?.message });
    console.error("[A3.8.137][ANALYSE_STATEMENTS_WRAPPER_FATAL]", err?.name, err?.message);

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
  }
}
