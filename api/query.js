// api/query.js
//
// Ask AI endpoint for Content Engine.
// Uses OpenAI chat.completions.create() with no tools or web-search integration.

import OpenAI from "openai";

// --- CORS helper --------------------------------------------------
function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";

  res.setHeader("Access-Control-Allow-Origin", origin === "null" ? "*" : origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
// ------------------------------------------------------------------

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Shared style-guide instructions reused by multiple endpoints.
const STYLE_GUIDE_INSTRUCTIONS = `
You are part of an internal writing tool called "Content Engine".
Follow this style guide in all answers:

- Currency:
  - Use "USD" followed by a non-breaking space and a number with standard English thousand separators.
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
    `You answer targeted questions about a draft document and its sources.`,
    `If the user question is unclear or cannot be answered from the provided context, say so briefly instead of inventing details.`,
    STYLE_GUIDE_INSTRUCTIONS,
  ].join("\n\n");
}

/**
 * Build the user prompt passed to the model.
 */
function buildUserPrompt({ question, draftText, styleGuide }) {
  const safeQuestion = question || "";
  const safeDraft = draftText || "";
  const safeStyle = styleGuide || "";

  return [
    `QUESTION:`,
    safeQuestion.trim(),
    "",
    `DRAFT OUTPUT (may be empty):`,
    safeDraft.trim() || "[no draft text provided]",
    "",
    `STYLE GUIDE (project-specific rules, may be empty):`,
    safeStyle.trim() || "[no additional style guide]",
    "",
    `INSTRUCTIONS:`,
    `Answer the QUESTION as helpfully as possible based on the DRAFT OUTPUT and STYLE GUIDE.`,
    `If something is not specified in the context, do NOT assume numbers, dates, valuations or parties.`,
    `If you need to speculate, clearly signal that it is an assumption.`,
  ].join("\n");
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
    // Vercel / Node can supply body already parsed or as a JSON string.
    const body =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

    const {
      question,
      draftText,
      styleGuide,
      modelId,
      temperature,
      maxTokens,
      // We deliberately ignore any publicSearch / webSearch flags for now.
    } = body;

    if (!question || typeof question !== "string") {
      return res.status(400).json({ error: "Missing or invalid 'question' in request body" });
    }

    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt({ question, draftText, styleGuide });

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
