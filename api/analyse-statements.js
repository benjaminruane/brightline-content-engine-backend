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

export default async function handler(req, res) {
  console.log("[A3.8.6][START] analyse-statements invoked");

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

  // A3.8.101: Lazy-load implementation using ESM dynamic import() inside try/catch to ensure CORS + JSON on import failures
  // A3.8.130: Import via entry wrapper to avoid Vercel bundling issues with huge impl module
  try {
    const mod = await import("./analyse-statements-entry.js");
    const implHandler = mod?.default;
    
    if (typeof implHandler !== "function") {
      throw new Error("analyse-statements-entry.js default export is not a function");
    }
    return await implHandler(req, res);
  } catch (err) {
    // A3.7.6: Set CORS headers defensively (safe to repeat)
    setCorsHeaders(req, res);
    
    // A3.8.135: Log error concisely
    console.error("[A3.8.135][ANALYSE_STATEMENTS_WRAPPER_FATAL]", err?.name, err?.message);
    
    // Return JSON error response with CORS headers
    return res.status(500).json({
      ok: false,
      error: "internal_error",
      message: err?.message ? String(err.message).slice(0, 300) : "Internal error",
    });
  }
}
