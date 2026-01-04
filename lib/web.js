// lib/web.js
//
// Shared web-search utilities for Content Engine.
// IMPORTANT: This file is intentionally OUTSIDE /api.
// Only real route handlers should live in /api on Vercel.

function assertFetchAvailable() {
  if (typeof fetch !== "function") {
    throw new Error(
      "Global fetch() is not available. Ensure Node is 18+ (Vercel should be)."
    );
  }
}

// -----------------------------
// Tavily: low-level call
// -----------------------------
export async function tavilySearch({ query, maxResults = 6 }) {
  if (!process.env.TAVILY_API_KEY) {
    throw new Error("Server is missing TAVILY_API_KEY");
  }
  if (!query || !String(query).trim()) return { ok: true, query, results: [] };

  assertFetchAvailable();

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
    },
    body: JSON.stringify({
      query,
      max_results: maxResults,
      include_answer: false,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Tavily search failed: ${res.status} ${text}`);
  }

  const data = await res.json().catch(() => null);
  return { ok: true, query, ...(data || {}) };
}

// -----------------------------
// Prompt formatting helpers
// -----------------------------
export function formatWebResultsForPrompt(resultsObj) {
  const results = resultsObj?.results || [];
  if (!Array.isArray(results) || results.length === 0) return "";

  return results
    .slice(0, 8)
    .map((r, idx) => {
      const title = r?.title ? String(r.title) : "Untitled";
      const url = r?.url ? String(r.url) : "";
      const content = r?.content ? String(r.content) : "";
      const snippet = content.length > 500 ? content.slice(0, 500) + "…" : content;
      return `[${idx + 1}] ${title}\n${url}\n${snippet}`.trim();
    })
    .join("\n\n");
}

export function webResultsToReferences(results) {
  if (!Array.isArray(results)) return [];
  return results.slice(0, 8).map((r, idx) => ({
    id: idx + 1,
    title: r?.title || "",
    url: r?.url || "",
  }));
}

// -----------------------------
// Query derivation for Generate/Rewrite/Review
// -----------------------------
export function deriveQueryFromDraft(text = "") {
  const t = String(text || "").trim();
  if (!t) return "";
  return t.length > 200 ? t.slice(0, 200) : t;
}

// -----------------------------
// Ask AI (Enquire) helpers
// -----------------------------
function inferEntityFromDraft(draftText = "") {
  if (!draftText) return "";

  const patterns = [
    /([A-Z][A-Za-z0-9&.-]{2,})['’]s\b/,
    /([A-Z][A-Za-z0-9&.-]{2,})\s+(is|provides|offers|was|has)\b/,
  ];

  for (const pattern of patterns) {
    const match = draftText.match(pattern);
    if (match && match[1]) return match[1];
  }
  return "";
}

export function deriveQueryFromAsk({ question, title, draftText }) {
  if (!question) return "";

  if (title && title.trim()) return `${question} ${title}`.trim();

  const inferredEntity = inferEntityFromDraft(draftText);
  if (inferredEntity) return `${inferredEntity} ${question}`.trim();

  return String(question).trim();
}

export async function runWebSearch({ query, maxResults = 6 }) {
  return tavilySearch({ query, maxResults });
}
