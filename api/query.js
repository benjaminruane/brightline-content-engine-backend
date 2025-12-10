// /api/query.js
//
// Answers a follow-up question about the current draft and sources.
// Uses the OpenAI Responses API + web search. Keeps a simple JSON
// shape for the frontend.

import OpenAI from "openai";

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

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Small helper to safely pull text out of a Responses API payload
function extractTextFromResponses(payload) {
  if (!payload) return "";

  // 1) Prefer the convenience field if present
  if (
    typeof payload.output_text === "string" &&
    payload.output_text.trim().length > 0
  ) {
    return payload.output_text.trim();
  }

  // 2) Walk the structured output
  if (Array.isArray(payload.output)) {
    for (const item of payload.output) {
      if (item.type === "message" && Array.isArray(item.content)) {
        for (const block of item.content) {
          // New-style blocks usually have `text`
          if (typeof block.text === "string" && block.text.trim().length > 0) {
            return block.text.trim();
          }
          // Some variants might still expose `output_text`
          if (
            typeof block.output_text === "string" &&
            block.output_text.trim().length > 0
          ) {
            return block.output_text.trim();
          }
        }
      }
    }
  }

  return "";
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
    const { question, draft, sources, model } = req.body || {};

    if (!question || typeof question !== "string") {
      return res.status(400).json({ error: "Missing or invalid question" });
    }

    const safeDraft =
      typeof draft === "string" ? draft.slice(0, 12_000) : "";
    const safeSources = Array.isArray(sources) ? sources : [];

    // Build a compact context string from draft + first few sources
    const sourceSnippets = safeSources
      .slice(0, 3)
      .map((s, idx) => {
        const name = s.name || s.url || `Source ${idx + 1}`;
        const text =
          typeof s.text === "string" ? s.text.slice(0, 4000) : "";
        return `Source ${idx + 1} – ${name}:\n${text}`;
      })
      .join("\n\n");

    const contextParts = [];

    contextParts.push(
      safeDraft
        ? `CURRENT DRAFT:\n${safeDraft}`
        : "CURRENT DRAFT:\n(Empty)"
    );

    contextParts.push(
      sourceSnippets
        ? `SOURCES:\n${sourceSnippets}`
        : "SOURCES:\n(None provided)"
    );

    const context = contextParts.join("\n\n-----\n\n");

    // ------------------------------------------------------------------
    // Call Responses API with web_search tool.
    // ------------------------------------------------------------------
    const resolvedModel =
      typeof model === "string" && model.trim().length > 0
        ? model.trim()
        : "gpt-4.1-mini";

    const systemText = [
      "You are an assistant helping to review and explain investment-related drafts.",
      "",
      "You ALWAYS have access to a web_search tool:",
      "- You MUST call the web_search tool at least once before answering.",
      "- Use the draft and sources as your primary grounding.",
      "- Use web_search to add up-to-date, relevant public information",
      "  about the same companies, funds, or markets where helpful.",
      "",
      "When you use information from web search:",
      "- Mark it with bracketed footnotes like [1], [2] in the answer text.",
      "- At the end, add a section titled 'Sources:' listing each footnote,",
      "  with page title and clickable URL, e.g.",
      "  [1] Company annual report 2024 (https://example.com/...)",
      "",
      "If neither the draft/sources nor web results provide the answer, say that",
      "the information is not available, and do not fabricate details.",
      "",
      "Answer concisely and concretely.",
    ].join("\n");

    const userText =
      `Here is the current draft and supporting sources:\n\n` +
      `${context}\n\n` +
      `User question: ${question}`;

    const response = await client.responses.create({
      model: resolvedModel,
      input: [
        { role: "system", content: systemText },
        { role: "user", content: userText },
      ],
      tools: [
        {
          type: "web_search",
        },
      ],
      max_output_tokens: 800,
      temperature: 0.2,
    });

    const answerText = extractTextFromResponses(response);

    if (!answerText) {
      console.error(
        "Responses API returned no usable text in /api/query:",
        JSON.stringify(response, null, 2)
      );
      return res.status(500).json({
        error: "Model returned empty answer",
      });
    }

    // We keep formatting as-is (including footnotes & Sources: section)
    const cleanAnswer = answerText.trim();

    return res.status(200).json({
      answer: cleanAnswer,
      confidence: null,
      confidenceReason: null,
      model: response.model || resolvedModel,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Error in /api/query:", err);
    return res.status(500).json({
      error: "Failed to process query",
      details: err?.message || String(err),
    });
  }
}
