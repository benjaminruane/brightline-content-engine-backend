// /api/query.js
//
// Answers focused questions about the current draft + sources,
// using OpenAI Responses API with web search.
//
// Returns a simple JSON payload the frontend can render safely.

import OpenAI from "openai";

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

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  try {
    const { question, draft, sources, model, publicSearch } = req.body || {};

    if (!question || typeof question !== "string" || !question.trim()) {
      return res
        .status(400)
        .json({ error: "A non-empty question is required." });
    }

    const safeDraft = typeof draft === "string" ? draft.trim() : "";
    const safeSources = Array.isArray(sources) ? sources : [];

    const resolvedModel =
      typeof model === "string" && model.trim().length > 0
        ? model.trim()
        : "gpt-4.1-mini";

    const sourceChunks = safeSources.map((s, idx) => {
      const label = s.name || s.url || `Source ${idx + 1}`;
      const text =
        typeof s.text === "string" ? truncateText(s.text, 6000) : "";
      return `Source ${idx + 1} – ${label}:\n${text}`;
    });

    const sourcesBlock =
      sourceChunks.length > 0
        ? sourceChunks.join("\n\n-----\n\n")
        : "(No explicit source documents were provided.)";

    const systemPrompt =
      "You are an assistant that answers focused questions about a draft investment text.\n" +
      "- Use the provided draft and sources as primary grounding.\n" +
      "- Where needed, you may use web search for up-to-date factual checks.\n" +
      "- If the answer is uncertain or speculative, say so explicitly.\n" +
      "- Do not re-draft the whole document; answer the question directly.\n" +
      "- Be concise and concrete.\n\n" +
      "- Citation style for web results:\n" +
      "  - When you rely on a specific web page, indicate it inline as a numbered footnote like (1), (2), etc.\n" +
      "  - At the end of your answer, add a 'Sources:' section.\n" +
      "  - Under 'Sources:', list each source on its own line as '1. Page Title (URL)'.\n" +
      "  - Use the human-readable page title, not the raw URL, as the link text.";

    const userPromptParts = [];

    userPromptParts.push("QUESTION:\n" + question.trim());

    if (safeDraft) {
      userPromptParts.push("CURRENT DRAFT (EXCERPT):\n" + truncateText(safeDraft, 8000));
    }

    userPromptParts.push("ATTACHED SOURCES (EXCERPTED):\n" + sourcesBlock);

    userPromptParts.push(
      [
        "TASK:",
        "- Answer the question using the draft + sources as primary context.",
        "- If web search adds materially better or newer information, include it.",
        "- Be precise about what is clearly supported vs. judgement / interpretation.",
      ].join("\n")
    );

    const userPrompt = userPromptParts.join("\n\n");

    const tools = publicSearch
      ? [
          {
            type: "web_search",
          },
        ]
      : [];

    const response = await client.responses.create({
      model: resolvedModel,
      input: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
      tools,
      max_output_tokens: 800,
    });

    const { answer, confidence, confidenceReason } = extractAnswer(response);

    return res.status(200).json({
      answer,
      confidence,
      confidenceReason,
    });
  } catch (err) {
    console.error("Error in /api/query:", err);
    return res.status(500).json({
      error: "Failed to process query",
      details: err?.response?.data || err?.message || String(err),
    });
  }
}

// --- Helpers -------------------------------------------------------------

function truncateText(text, maxChars) {
  if (!text || typeof text !== "string") return "";
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars);
}

function extractAnswer(response) {
  try {
    const output = response.output || response;
    let text = "";

    if (Array.isArray(output) && output.length > 0) {
      for (const item of output) {
        if (item.type === "message" && item.content) {
          const segment = item.content
            .map((part) => part.text || "")
            .join("");
          text += segment;
        }
      }
    } else if (response.output_text) {
      text = String(response.output_text);
    }

    const answer = (text || "").trim();

    const meta = response.metadata || {};
    const confidence =
      typeof meta.confidence === "number" ? meta.confidence : null;
    const confidenceReason =
      typeof meta.confidence_reason === "string"
        ? meta.confidence_reason
        : null;

    return {
      answer,
      confidence,
      confidenceReason,
    };
  } catch (e) {
    console.error("Failed to extract answer from Responses payload:", e);
    return {
      answer: "Sorry, I couldn't extract a valid answer from the model output.",
      confidence: null,
      confidenceReason: null,
    };
  }
}
