// api/_web.js

import fetch from "node-fetch";

/**
 * Very lightweight entity inference from draft text.
 * We intentionally keep this conservative to avoid hallucination.
 *
 * Strategy:
 * - Look for capitalised words followed by possessive or descriptive phrases
 * - Prefer the first plausible company-like token
 */
function inferEntityFromDraft(draftText = "") {
  if (!draftText) return "";

  // Common pattern: "Shopify’s", "Stripe is", "Airbnb provides", etc.
  const patterns = [
    /([A-Z][A-Za-z0-9&.-]{2,})['’]s\b/,
    /([A-Z][A-Za-z0-9&.-]{2,})\s+(is|provides|offers|was|has)\b/,
  ];

  for (const pattern of patterns) {
    const match = draftText.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return "";
}

/**
 * Derive a Tavily query for Ask AI.
 */
export function deriveQueryFromAsk({ question, title, draftText }) {
  if (!question) return "";

  // Case 1: title exists → original behaviour
  if (title && title.trim()) {
    return `${question} ${title}`.trim();
  }

  // Case 2: infer entity from draft text
  const inferredEntity = inferEntityFromDraft(draftText);
  if (inferredEntity) {
    return `${inferredEntity} ${question}`.trim();
  }

  // Fallback: question only (last resort)
  return question.trim();
}

/**
 * Run Tavily web search.
 */
export async function runWebSearch({ query, maxResults = 6, apiKey }) {
  if (!query) return { results: [] };

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query,
      max_results: maxResults,
      include_answer: false,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Tavily search failed: ${res.status} ${text}`);
  }

  return res.json();
}
