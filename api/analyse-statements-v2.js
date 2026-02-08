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

export default async function handler(req, res) {
  console.log("[A3.14.0][V2_ROUTE] route=analyse-statements-v2");

  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  // A3.14.0: Inject engine flag so impl uses V2 candidate extraction
  if (!req.body || typeof req.body !== "object") {
    req.body = {};
  }
  req.body.engine = "v2";

  const rid = (req.headers && req.headers["x-brightline-rid"]) || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  req._brightlineRid = rid;
  const implHref = "./analyse-statements-entry.js";

  try {
    const mod = await import(implHref);
    const implHandler = mod?.default;

    if (typeof implHandler !== "function") {
      throw new Error("analyse-statements-entry.js default export is not a function");
    }
    return await implHandler(req, res);
  } catch (err) {
    setCorsHeaders(req, res);
    console.error("[A3.8.137][ANALYSE_STATEMENTS_WRAPPER_FATAL]", err?.name, err?.message);
    return res.status(500).json({
      ok: false,
      error: "internal_error",
      message: err?.message ? String(err.message).slice(0, 300) : "Internal error",
    });
  }
}
