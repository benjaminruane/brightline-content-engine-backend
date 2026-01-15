// api/analyse-selected-statements.js
//
// A3.8.11: Selection mode endpoint for analyse-statements.
// Thin CORS-safe wrapper that calls the same implementation but with selectionMode=true semantics.

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin === "null" ? "*" : origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  console.log("[A3.8.11][START] analyse-selected-statements invoked");

  // A3.7.6: Set CORS headers immediately, before any logic
  setCorsHeaders(req, res);

  // A3.7.6: Handle OPTIONS preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // A3.7.6: Reject non-POST methods
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  // A3.8.11: Ensure selectionText is present (selection mode requirement)
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (!body || !body.selectionText || typeof body.selectionText !== "string" || body.selectionText.trim().length < 3) {
      return res.status(400).json({
        ok: false,
        error: "selection_required",
        message: "selectionText is required and must be at least 3 characters",
      });
    }
  } catch (parseErr) {
    return res.status(400).json({
      ok: false,
      error: "invalid_json",
      message: "Request body must be valid JSON",
    });
  }

  // A3.7.6: Lazy-load implementation inside try/catch to ensure CORS + JSON on import failures
  try {
    const mod = await import("./analyse-statements-impl.js");
    const impl = mod?.default;
    if (typeof impl !== "function") {
      throw new Error("analyse-statements-impl missing default export");
    }
    return await impl(req, res);
  } catch (err) {
    // A3.7.6: Set CORS headers defensively (safe to repeat)
    setCorsHeaders(req, res);
    
    // Log error concisely
    console.error("[analyse-selected-statements wrapper]", err?.name, err?.message);
    
    // Return JSON error response with CORS headers
    return res.status(500).json({
      ok: false,
      error: "internal_error",
      message: err?.message ? String(err.message).slice(0, 300) : "Internal error",
    });
  }
}
