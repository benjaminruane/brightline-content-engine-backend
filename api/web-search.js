// api/web-search.js
//
// Lightweight web search endpoint using Tavily.
// This is a generic helper the rest of the backend can call,
// and it's also handy for debugging from the frontend later.

const TAVILY_API_URL = "https://api.tavily.com/search";

// --- CORS helper --------------------------------------------------
function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";

  res.setHeader(
    "Access-Control-Allow-Origin",
    origin === "null" ? "*" : origin
  );
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
// ------------------------------------------------------------------

async function callTavilySearch(query, maxResults = 4) {
  if (!process.env.TAVILY_API_KEY) {
    throw new Error("Missing TAVILY_API_KEY environment variable");
  }

  const payload = {
    api_key: process.env.TAVILY_API_KEY,
    query,
    max_results: maxResults,
    search_depth: "basic", // fast + cheap
    include_answer: false,
    include_raw_content: false,
    include_images: false,
  };

  const res = await fetch(TAVILY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Tavily HTTP ${res.status}: ${text || "Unknown error from Tavily"}`
    );
  }

  const data = await res.json();

  const results = Array.isArray(data.results)
    ? data.results.map((r, index) => ({
        id: index + 1,
        title: r.title || `Result ${index + 1}`,
        url: r.url || "",
        snippet: r.content || r.snippet || "",
      }))
    : [];

  return {
    ok: true,
    query,
    results,
    raw: data,
  };
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

    const { query, maxResults } = body;

    if (!query || typeof query !== "string") {
      return res
        .status(400)
        .json({ error: "Missing or invalid 'query' in request body" });
    }

    const result = await callTavilySearch(query, maxResults || 4);
    return res.status(200).json(result);
  } catch (err) {
    console.error("/api/web-search error:", err);
    const message =
      err && typeof err === "object" && "message" in err
        ? err.message
        : "Unknown error";
    return res.status(500).json({
      ok: false,
      error: "Failed to perform web search",
      details: message,
    });
  }
}
