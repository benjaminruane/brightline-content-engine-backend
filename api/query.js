// api/query.js
//
// Ask AI endpoint for Content Engine.
// Now includes optional Tavily web search context (always on if TAVILY_API_KEY is set).
// Uses OpenAI chat.completions.create() with no tools or experimental APIs.

import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Tavily configuration
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

// Shared style-guide instructions reused by multiple endpoints.
const STYLE_GUIDE_INSTRUCTIONS = `
You are part of an internal writing tool called "Content Engine".
Follow this style guide in all answers:

- Currency:
  - Use "USD" followed by a space and a number with standard English thousand separators.
    Example: USD 1,500,000 (not USD1.5m, USD1,500,000 or US$1.5m).
- Years:
  - Do NOT insert thousand separators into years: 2025, 1999.
- Quotation marks:
  - Prefer straight double quotes "like this" for titles, terms, and citations.
  - Use single quotes only for quotes-within-quotes.
- Tone:
  - Clear, concise, neutral, professional.
`;

/**
 * Build the system prompt for Ask AI.
 */
function buildSystemPrompt() {
  return [
    `You are the "Ask AI" assistant embedded in the Content Engine application.`,
    `You answer targeted questions about a draft document, its style guide, and (where provided) web search results.`,
    `If the user question is unclear or cannot be answered from the provided context, say so briefly instead of inventing details.`,
    `If you draw on the WEB SEARCH RESULTS, you must treat them as external context and avoid overstating certainty.`,
    STYLE_GUIDE_INSTRUCTIONS,
  ].join("\n\n");
}

/**
 * Build the user prompt passed to the model.
 */
function buildUserPrompt({ question, draftText, styleGuide, webResults }) {
  const safeQuestion = question || "";
  const safeDraft = draftText || "";
  const safeStyle = styleGuide || "";

  const lines = [];

  lines.push("QUESTION:");
  lines.push(safeQuestion.trim() || "[no question provided]");
  lines.push("");

  lines.push("DRAFT OUTPUT (may be empty):");
  lines.push(safeDraft.trim() || "[no draft text provided]");
  lines.push("");

  lines.push("STYLE GUIDE (project-specific rules, may be empty):");
  lines.push(safeStyle.trim() || "[no additional style guide]");
  lines.push("");

  if (webResults && Array.isArray(webResults) && webResults.length > 0) {
    lines.push("WEB SEARCH RESULTS (for additional context):");
    lines.push(
      "You may refer to these results in your reasoning, but do not assume they are exhaustive or perfectly accurate."
    );
    lines.push(
      "When you rely on a specific result, refer to it in your answer using a footnote-style marker like [1], [2], etc., matching the numbering below."
    );
    lines.push("");

    webResults.forEach((r, idx) => {
      const n = idx + 1;
      lines.push(
        `[${n}] ${r.title || "Untitled"} — ${r.snippet || ""} (${r.url || ""})`
      );
    });

    lines.push("");
  }

  lines.push("INSTRUCTIONS:");
  lines.push(
    "Answer the QUESTION as helpfully as possible based on the DRAFT OUTPUT, STYLE GUIDE, and any WEB SEARCH RESULTS provided."
  );
  lines.push(
    "If something is not specified in the draft or web results, do NOT invent specific numbers, dates, valuations, or party names."
  );
  lines.push(
    "Where you rely on web results, use the [1], [2] markers so the UI can link back to the sources."
  );
  lines.push(
    "Keep your answer concise, structured, and suitable for an institutional investor audience."
  );

  return lines.join("\n");
}

/**
 * Call Tavily to get web search results for the Ask AI query.
 * If anything fails, we log and return null (Ask AI still works without search).
 */
async function fetchWebResultsForQuestion(question, draftText) {
  if (!process.env.TAVILY_API_KEY) {
    return null;
  }

  const trimmedQuestion = (question || "").trim();
  const trimmedDraft = (draftText || "").trim();

  // Simple combined query: focus on the question, with a hint of draft context.
  const combinedQuery = trimmedDraft
    ? `${trimmedQuestion} (context: ${trimmedDraft.slice(0, 300)})`
    : trimmedQuestion;

  const payload = {
    api_key: process.env.TAVILY_API_KEY,
    query: combinedQuery || trimmedQuestion || "investment markets context",
    max_results: 4,
    search_depth: "basic",
    include_answer: false,
    include_raw_content: false,
    include_images: false,
  };

  try {
    const res = await fetch(TAVILY_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(
        "Tavily web search non-OK:",
        res.status,
        text || "<no body>"
      );
      return null;
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

    if (results.length === 0) {
      return null;
    }

    return results;
  } catch (err) {
    console.error("Tavily web search error:", err);
    return null;
  }
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res
      .status(500)
      .json({ error: "Missing OPENAI_API_KEY environment variable" });
  }

  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

    const {
      question,
      draftText,
      styleGuide,
      modelId,
      temperature,
      maxTokens,
      // publicSearch is effectively "always on" now if TAVILY_API_KEY exists.
      publicSearch,
    } = body;

    if (!question || typeof question !== "string") {
      return res
        .status(400)
        .json({ error: "Missing or invalid 'question' in request body" });
    }

    // Fetch web results (if available). We default to "on" when a Tavily key exists.
    const webResults =
      process.env.TAVILY_API_KEY && publicSearch === false
        ? null
        : await fetchWebResultsForQuestion(question, draftText);

    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt({
      question,
      draftText,
      styleGuide,
      webResults,
    });

    // Translate old maxTokens value (if provided) into max_completion_tokens.
    const maxCompletionTokens =
      typeof maxTokens === "number" && maxTokens > 0 ? maxTokens : 512;

    const completion = await client.chat.completions.create({
      model: modelId || "gpt-4o-mini",
      temperature: typeof temperature === "number" ? temperature : 0.3,
      max_completion_tokens: maxCompletionTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const message = completion.choices?.[0]?.message;
    const answer = (message?.content || "").trim();

    return res.status(200).json({
      ok: true,
      question,
      answer,
      model: completion.model || null,
      references: webResults || [],
      usage: {
        promptTokens: completion.usage?.prompt_tokens ?? null,
        completionTokens: completion.usage?.completion_tokens ?? null,
        totalTokens: completion.usage?.total_tokens ?? null,
      },
    });
  } catch (err) {
    console.error("Ask AI /api/query error:", err);
    const message =
      err && typeof err === "object" && "message" in err
        ? err.message
        : "Unknown error";
    return res.status(500).json({
      error: "Failed to process query",
      details: message,
    });
  }
}
