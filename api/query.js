// /api/query.js
//
// Answers a follow-up question about the current draft and sources.
// Uses Chat Completions. There is NO live web search here:
// - Primary grounding: draft + attached sources
// - Secondary: model's general background knowledge
//
// JSON response shape is kept stable for the frontend.

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
    const { question, draft, sources, model, publicSearch } = req.body || {};

    if (!question || typeof question !== "string") {
      return res.status(400).json({ error: "Missing or invalid question" });
    }

    // ------------------------------------------------------------------
    // Build safe context from draft + sources
    // ------------------------------------------------------------------
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
        ? `SOURCES (EXCERPTED):\n${sourceSnippets}`
        : "SOURCES:\n(None provided)"
    );

    // Optional note about publicSearch flag – for now it just tells the model
    // it may bring in background knowledge more freely.
    const searchFlag = !!publicSearch;
    if (searchFlag) {
      contextParts.push(
        "NOTE: The user has enabled publicSearch. You MAY use general background knowledge from your training to provide context, but you still do NOT have live web access or real-time data."
      );
    }

    const context = contextParts.join("\n\n-----\n\n");

    // ------------------------------------------------------------------
    // Call Chat Completions
    // ------------------------------------------------------------------

    const resolvedModel =
      typeof model === "string" && model.trim().length > 0
        ? model.trim()
        : "gpt-4.1-mini";

    const systemPrompt = [
      "You are an assistant helping to review and explain investment-related drafts.",
      "",
      "You have access to:",
      "- The CURRENT DRAFT text.",
      "- A small set of SOURCES supplied by the user (e.g. URLs, files, raw text).",
      "",
      "Your behaviour:",
      "- Use the draft and sources as your PRIMARY grounding.",
      "- You MAY use your own general background knowledge from training to:",
      "  - Explain concepts (e.g. what 'first lien' means),",
      "  - Provide high-level market or industry context,",
      "  - Suggest framing or drafting improvements.",
      "- You do NOT have live web or real-time data access.",
      "",
      "If the user asks for:",
      "- A specific, up-to-date figure (e.g. current share price) or fact that is NOT in the draft or sources:",
      "  - Say clearly that you do not have live data and cannot confirm the exact current value.",
      "- Something that contradicts the sources:",
      "  - Prioritise the sources and explain the discrepancy.",
      "",
      "Citations and clarity:",
      "- When your answer relies on a specific statement in the provided sources, mention this explicitly (e.g. 'According to Source 1…').",
      "- If something is based mainly on your general knowledge, say so.",
      "",
      "Style:",
      "- Be concise, concrete, and professional.",
      "- Prefer short paragraphs and clear structure.",
    ].join("\n");

    const userPrompt = [
      "Here is the current draft and supporting sources:",
      "",
      context,
      "",
      "User question:",
      question,
    ].join("\n\n");

    const completion = await client.chat.completions.create({
      model: resolvedModel,
      temperature: 0.2,
      max_completion_tokens: 512,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const answerText =
      completion.choices?.[0]?.message?.content?.trim() || "";

    if (!answerText) {
      console.error("Chat completion returned no answer:", completion);
      return res.status(500).json({
        error: "Model returned empty answer",
      });
    }

    // Optional: strip simple markdown for a cleaner UI, if desired
    const cleanAnswer = answerText
      .replace(/\*\*(.*?)\*\*/g, "$1") // **bold**
      .replace(/\*(.*?)\*/g, "$1") // *italic*
      .trim();

    return res.status(200).json({
      answer: cleanAnswer,
      confidence: null,
      confidenceReason: null,
      model: completion.model || resolvedModel,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Error in /api/query:", err);
    return res.status(500).json({
      error: "Failed to process query",
      details: err?.response?.data || err?.message || String(err),
    });
  }
}
