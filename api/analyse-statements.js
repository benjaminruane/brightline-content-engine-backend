// api/analyse-statements.js
//
// A3.7.6: Thin CORS-safe wrapper for analyse-statements.
// Lazy-loads implementation to ensure CORS headers are always set,
// even if the implementation module fails to import or initialize.
// A3.8.101: Use ESM dynamic import() to load ESM impl module

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin === "null" ? "*" : origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

const ROUTE = "analyse-statements";

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

    const safePayload = payload != null ? payload : {
      ok: false,
      statements: [],
      references: [],
      meta: { fatal: "Internal error", fatalStage: "route_exception", extractionQuality: "failed", extractionQualityReasons: ["internal_error"] },
    };
    console.log("[A3.14.5][RES_SEND]", { rid, route: ROUTE, ok: safePayload?.ok, statements: safePayload?.statements?.length ?? null });
    res.status(200).json(safePayload);
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
