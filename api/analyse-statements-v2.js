// api/analyse-statements-v2.js
//
// A3.14.0: V2 route for Statement Engine — draft/full-text analysis.
// Explicitly gated: passes engine: "v2" into impl; parity response shape with /api/analyse-statements.

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin === "null" ? "*" : origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-brightline-diag");
}

const ROUTE = "analyse-statements-v2";

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
  console.log("[A3.14.0][V2_ROUTE] route=analyse-statements-v2");

  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  if (!req.body || typeof req.body !== "object") {
    req.body = {};
  }
  req.body.engine = "v2";

  const implHref = "./analyse-statements-entry.js";

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
    let failureReason = safePayload?.meta?.zeroStatementReason ?? safePayload?.meta?.fatal ?? null;
    const statementsCount = safePayload?.statements?.length ?? 0;
    console.log("REVIEW_RUNTIME_QC_CONTRACT", JSON.stringify({
      ok: safePayload?.ok ?? false,
      statementsCount,
      qcCardsCount: statementsCount,
      failureReason: failureReason ?? (safePayload?.ok === false ? (safePayload?.meta?.zeroStatementReason || safePayload?.meta?.fatal || "unknown") : null),
    }));
    // X1.2b: Reject PDF-as-inline with 400 so clients get a clear contract violation
    const ingestionErrorCode = safePayload?.meta?.sourceIngestionError?.code;
    // X1.3: Optional 422 when ENFORCE_INGESTION_GUARDS=1 and extraction overallStatus=ERROR
    const guardStatusCode = safePayload?.meta?.extractionGuardStatusCode;
    let statusCode = 200;
    if (guardStatusCode === 422) statusCode = 422;
    else if (ingestionErrorCode === "PDF_INLINE_TEXT_NOT_ALLOWED") statusCode = 400;
    console.log("[A3.14.5][RES_SEND]", { rid, route: ROUTE, ok: safePayload?.ok, statements: statementsCount, statusCode });
    res.status(statusCode).json(safePayload);
    return;
  } catch (err) {
    setCorsHeaders(req, res);
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
