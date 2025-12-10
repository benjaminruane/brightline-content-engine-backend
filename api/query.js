// /api/query.js
//
// Ask AI endpoint.
// - Grounds answers in the current draft + attached sources.
// - Uses OpenAI "web_search" so answers can pull in fresh public info.
// - Returns a single `answer` string plus optional confidence metadata.
//
// NOTE: We intentionally DO NOT manually truncate the answer. If you ever
// want a shorter answer, change the prompting rather than slicing strings.

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

// Small helper so we don’t send huge blobs of text
function truncate(text, maxChars = 8000) {
  if (!text || typeof text !== "string") return "";
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars);
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

    const safeQuestion =
      typeof question === "string" ? question.trim() : "";

    if (!safeQuestion) {
      return res
        .status(400)
        .json({ error: "A question is required for Ask AI." });
    }

    const safeDraft = typeof draft === "string" ? draft.trim() : "";
    const safeSources = Array.isArray(sources) ? sources : [];

    // Build a compact “context block” with the draft + sources
    const pieces = [];

    if (safeDraft) {
      pieces.push(
        "CURRENT DRAFT TEXT (truncated if very long):\n" +
          truncate(safeDraft, 8000)
      );
    }

    if (safeSources.length > 0) {
      const sourceStrings = safeSources.map((s, idx) => {
        const label = s?.name || s?.url || `Source ${idx + 1}`;
        const urlPart = s?.url ? `\nURL: ${s.url}` : "";
        const textPart =
          typeof s?.text === "string"
            ? "\nTEXT (truncated):\n" + truncate(s.text, 4000)
            : "";
        return `Source ${idx + 1} – ${label}:${urlPart}${textPart}`;
      });

      pieces.push(sourceStrings.join("\n\n-----\n\n"));
    }

    const contextBlock =
      pieces.length > 0
        ? pieces.join("\n\n========================\n\n")
        : "No additional draft or sources were provided.";

    const resolvedModel =
      typeof model === "string" && model.trim().length > 0
        ? model.trim()
        : "gpt-5.1-mini";

    // SYSTEM MESSAGE
    const systemPrompt = [
      "You are an analytical assistant for a private-markets investment writer.",
      "",
      "Your job is to answer targeted questions about:",
      "- the CURRENT DRAFT text (if provided), and",
      "- any ATTACHED SOURCES (if provided), and",
      "- general market knowledge via web search.",
      "",
      "Important behaviour:",
      "- Always ground your answer first in the draft + sources where possible.",
      "- When you bring in external / web-search context, clearly distinguish it",
      "  from what is in the draft / sources.",
      "- Use concise, professional English.",
      "- Give complete answers; do NOT stop mid-sentence, mid-list, or mid-section.",
      "- Include inline citation markers like [1], [2] etc when referencing",
      "  specific external sources or URLs.",
      "",
      "Output format:",
      "- Answer the question fully and clearly.",
      "- You may use headings and bullet points.",
      "- Avoid meta-commentary about being an AI.",
    ].join("\n");

    // USER MESSAGE
    const userPrompt = [
      "USER QUESTION:",
      safeQuestion,
      "",
      "CONTEXT MATERIAL:",
      contextBlock,
      "",
      "TASK:",
      "- Use the context above as the primary grounding.",
      "- You MAY use web search to fetch relevant, up-to-date information.",
      "- Clearly distinguish between information from the draft/sources and",
      "  information that comes purely from web search or general knowledge.",
      "- Provide a complete answer; do not leave sections half-finished.",
    ].join("\n");

    // Use the Responses API with built-in web_search.
    const response = await client.responses.create({
      model: resolvedModel,
      tools: [{ type: "web_search" }],
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      // NOTE: we are intentionally *not* setting max_output_tokens here to
      // avoid accidental truncation of long, structured answers.
    });

    const answer =
      (response && response.output_text && response.output_text.trim()) || "";

    if (!answer) {
      console.error("Ask AI: model returned empty answer:", response);
      return res
        .status(500)
        .json({ error: "Model returned empty answer" });
    }

    // For now we don’t compute a fancy confidence score; keep the fields
    // so the frontend UI continues to work.
    const confidence = null;
    const confidenceReason = null;

    return res.status(200).json({
      answer,
      confidence,
      confidenceReason,
    });
  } catch (err) {
    console.error("Error in /api/query:", err);
    return res.status(500).json({
      error: "Failed to answer query",
      details: err?.response?.data || err?.message || String(err),
    });
  }
}
