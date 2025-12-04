// /api/query.js
//
// Answers a follow-up question about the current draft and sources,
// grounded in those inputs as much as possible.

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
      publicSearch, // not used yet, but kept for future web tools
    } = req.body || {};

    if (!question || typeof question !== "string") {
      return res.status(400).json({ error: "Missing or invalid question" });
    }

    const safeDraft =
      typeof draft === "string" ? draft.slice(0, 12_000) : "";
    const safeSources = Array.isArray(sources) ? sources : [];

    // Build a compact context string
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

    const completion = await client.chat.completions.create({
      model: model || "gpt-4o-mini",
      max_completion_tokens: 512,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are an assistant helping to review and explain investment-related drafts.\n" +
            "- Ground your answer strictly in the provided draft and sources.\n" +
            '- If the user asks about "the company", assume they mean the main company described in the draft.\n' +
            "- If a specific figure or fact is not present in the draft or sources, say so explicitly.\n" +
            "- If they ask whether something is public information, look for that item in the draft/sources and answer about THAT item, not generic disclosure rules.\n" +
            "- Be concise and concrete.",
        },
        {
          role: "user",
          content:
            `Here is the current draft and supporting sources:\n\n${context}\n\n` +
            `User question: ${question}`,
        },
      ],
    });

    const answer = completion?.choices?.[0]?.message?.content?.trim() || "";

    if (!answer) {
      return res.status(500).json({
        error: "Model returned empty answer",
      });
    }

    return res.status(200).json({
      answer,
      confidence: null,
      confidenceReason: null,
      model: completion.model,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Error in /api/query:", err);
    return res.status(500).json({
      error: "Failed to process query",
      details: err.message || String(err),
    });
  }
}
