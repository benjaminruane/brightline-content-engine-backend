// api/analyse-statements-v2.js
//
// A3.14.0: V2 route for Statement Engine — draft/full-text analysis.
// Explicitly gated: passes engine: "v2" into impl; parity response shape with /api/analyse-statements.

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin === "null" ? "*" : origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

const ROUTE = "analyse-statements-v2";

export default async function handler(req, res) {
  const rid = (req.headers && req.headers["x-brightline-rid"]) || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  req._brightlineRid = rid;
  console.log("[A3.14.2][HANDLER_ENTER]", { rid, route: ROUTE });
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

    if (res.headersSent) {
      console.log("[A3.14.2][RES_ALREADY_SENT]", { rid, route: ROUTE });
      return;
    }
    console.log("[A3.14.2][RES_SEND_START]", { rid, route: ROUTE, headersSent: res.headersSent });
    res.status(200).json(payload != null ? payload : { ok: false, error: "internal_error", statements: [], references: [] });
    console.log("[A3.14.2][RES_SEND_END]", { rid, route: ROUTE, headersSent: res.headersSent });
    return;
  } catch (err) {
    setCorsHeaders(req, res);
    console.error("[A3.8.137][ANALYSE_STATEMENTS_WRAPPER_FATAL]", err?.name, err?.message);

    if (res.headersSent) {
      console.log("[A3.14.2][RES_ALREADY_SENT]", { rid, route: ROUTE });
      return;
    }
    return res.status(500).json({
      ok: false,
      error: "internal_error",
      meta: { fatalStage: "route_exception" },
      message: err?.message ? String(err.message).slice(0, 300) : "Internal error",
    });
  }
}
