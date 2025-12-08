// /api/query.js
//
// Answers a follow-up question using the draft, sources,
// and (optionally) OpenAI Web Search.

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

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      question,
      draft,
      sources,
      model,
      publicSearch,
    } = req.body || {};

    if (!question || typeof question !== "string") {
      return res.status(400).json({ error: "Missing or invalid question" });
    }

    const safeDraft = typeof draft === "string" ? draft.slice(0, 12_000) : "";
    const safeSources = Array.isArray(sources) ? sources : [];

    const sourceSnippets = safeSources
      .slice(0, 3)
      .map((s, idx) => {
        const name = s.name || s.url || `Source ${idx + 1}`;
        const text =
          typeof s.text === "string" ? s.text.slice(0, 4000) : "";
        return `Source ${idx + 1} – ${name}:\n${text}`;
      })
      .join("\n\n");

    const context = [
      safeDraft
        ? `CURRENT DRAFT:\n${safeDraft}`
        : "CURRENT DRAFT:\n(Empty)",
      sourceSnippets
        ? `SOURCES:\n${sourceSnippets}`
        : "SOURCES:\n(None provided)",
    ].join("\n\n-----\n\n");

    // --------------------------
    // USE RESPONSES API INSTEAD
    // --------------------------
    const response = await client.responses.create({
      model: model || "gpt-4.1",
      max_output_tokens: 512,
      temperature: 0.2,

      tools: publicSearch ? [{ type: "web" }] : [],

      messages: [
        {
          role: "system",
          content:
            "You are an assistant helping to review and explain investment-related drafts.\n" +
            "- Ground your answer strictly in the provided draft and sources.\n" +
            "- If the user asks about 'the company', assume they mean the main company described in the draft.\n" +
            "- If a specific figure or fact is not present in the draft or sources, say so explicitly.\n" +
            "- If publicSearch is ON, you may also use web search results.\n" +
            "- Be concise and concrete."
        },
        {
          role: "user",
          content:
            `Here is the current draft and supporting sources:\n\n${context}\n\n` +
            `User question: ${question}`
        }
      ],
    });

    const answer = response.output_text?.trim?.() || "";

    if (!answer) {
      return res.status(500).json({ error: "Model returned empty answer" });
    }

    return res.status(200).json({
      answer,
      confidence: null,
      confidenceReason: null,
      model: response.model,
      createdAt: new Date().toISOString(),
      usedWeb: !!publicSearch,
    });

  } catch (err) {
    console.error("Error in /api/query:", err);
    return res.status(500).json({
      error: "Failed to process query",
      details: err.message || String(err),
    });
  }
}
