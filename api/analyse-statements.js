// api/analyse-statements.js
//
// A3.7.6: Thin CORS-safe wrapper for analyse-statements.
// Lazy-loads implementation to ensure CORS headers are always set,
// even if the implementation module fails to import or initialize.

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin === "null" ? "*" : origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
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
    console.error("[analyse-statements wrapper]", err?.name, err?.message);
    
    // Return JSON error response with CORS headers
    return res.status(500).json({
      ok: false,
      error: "internal_error",
      message: err?.message ? String(err.message).slice(0, 300) : "Internal error",
    });
  }
}
