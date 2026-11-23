import { withCors } from "../lib/http/with-cors.mjs";
// api/web-search.js
//
// Lightweight web search endpoint using Tavily.
// This is a generic helper the rest of the backend can call,
// and it's also handy for debugging from the frontend later.

import { applyCors } from "../lib/http/frontend-origins.mjs";
import { rememberAccount, requireAccount } from "../lib/auth/require-account.mjs";
import { tavilySearch } from "../lib/web.js";

// --- CORS helper --------------------------------------------------
// ------------------------------------------------------------------

async function handler(req, res) {
  if (applyCors(req, res, { methods: "GET,POST,OPTIONS" })) return;
  const account = await requireAccount(req, res);
  if (!account) return;
  rememberAccount(account);
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

export default withCors(handler, {});
