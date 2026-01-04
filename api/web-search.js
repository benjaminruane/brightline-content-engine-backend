// api/web-search.js
//
// Lightweight web search endpoint using Tavily.
// This is a generic helper the rest of the backend can call,
// and it's also handy for debugging from the frontend later.

import { tavilySearch } from "../lib/web.js";

// --- CORS helper --------------------------------------------------
function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";

  res.setHeader("Access-Control-Allow-Origin", origin === "null" ? "*" : origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
// ------------------------------------------------------------------

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const query = typeof body.query === "string" ? body.query.trim() : "";
    const maxResults =
      typeof body.maxResults === "number" && body.maxResults > 0 ? body.maxResults : 4;

    if (!query) return res.status(400).json({ ok: false, error: "Missing query" });

    const result = await tavilySearch({ query, maxResults });
    return res.status(200).json(result);
  } catch (err) {
    console.error("/api/web-search error:", err);
    return res.status(500).json({
      ok: false,
      error: "Failed to perform web search",
      details: err?.message || String(err),
    });
  }
}
