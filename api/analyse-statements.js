// api/analyse-statements.js
//
// A3.7.6: Thin CORS-safe wrapper for analyse-statements.
// Lazy-loads implementation to ensure CORS headers are always set,
// even if the implementation module fails to import or initialize.
// A3.8.100: Use createRequire to load CommonJS impl module

// A3.8.100: Import createRequire for ESM-safe CommonJS module loading
import { createRequire } from "module";
const require = createRequire(import.meta.url);

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

  // A3.8.100: Lazy-load implementation using createRequire (CommonJS) inside try/catch to ensure CORS + JSON on import failures
  try {
    const impl = require("./analyse-statements-impl.js");
    
    // A3.8.100: Handle both direct function export and default export pattern
    const handlerFn = (impl && typeof impl.default === "function") 
      ? impl.default 
      : impl;
    
    if (typeof handlerFn !== "function") {
      throw new Error("analyse-statements-impl export is not a function");
    }
    return await handlerFn(req, res);
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
