// api/query.js
//
// AI Query endpoint
// - Always uses OpenAI web_search_preview for public-domain context
// - GET + mode=web-test: diagnostic mode, testable in browser
// - POST: main query handler, web-backed but falls back cleanly if web fails

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

// --- Inline helper: call web_search_preview via Responses API -----
async function runWebSearchPreview({ query, model = "gpt-4.1" }) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY in environment.");
  }

  const userQuery =
    typeof query === "string" && query.trim().length > 0
      ? query.trim()
      : "Using current public information, answer the user's question about investments, private markets, or related topics.";

  const apiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      tools: [{ type: "web_search_preview" }],
      tool_choice: { type: "web_search_preview" },
      input: userQuery,
    }),
  });

  const payload = await apiResponse.json();

  if (!apiResponse.ok) {
    const message =
      payload?.error?.message ||
      `OpenAI API error (status ${apiResponse.status})`;

    const err = new Error(message);
    err.status = apiResponse.status;
    err.data = payload;
    throw err;
  }

  // Extract assistant text
  let summary = null;

  if (Array.isArray(payload.output)) {
    const messageItem = payload.output.find((item) => item.type === "message");

    if (messageItem && Array.isArray(messageItem.content)) {
      const textBlock = messageItem.content.find(
        (part) => part.type === "output_text"
      );

      if (textBlock && typeof textBlock.text === "string") {
        summary = textBlock.text;
      }
    }
  }

  return {
    summary,
    raw: payload,
  };
}
// ------------------------------------------------------------------

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  // Preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // --- GET diagnostic mode: test web_search_preview in browser ----
  if (req.method === "GET" && req.query?.mode === "web-test") {
    try {
      const q = req.query.q;

      const { summary, raw } = await runWebSearchPreview({
        query:
          typeof q === "string" && q.trim().length > 0
            ? q.trim()
            : "Recent developments and trends in private markets and private equity.",
      });

      return res.status(200).json({
        ok: true,
        mode: "web-test",
        summary,
        raw,
      });
    } catch (err) {
      return res.status(err.status || 500).json({
        ok: false,
        mode: "web-test",
        error: err.message || "Failed to call web_search_preview.",
        data: err.data || null,
      });
    }
  }
  // ----------------------------------------------------------------

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      question,
      context,        // optional extra context (e.g. project info)
      systemPrompt,   // optional custom system prompt
      model = "gpt-4o-mini",
    } = req.body || {};

    if (!question || !question.trim()) {
      return res.status(400).json({
        ok: false,
        error: "Missing question",
      });
    }

    // 1) Try to get public-domain context for the question
    let webSummary = null;
    try {
      const { summary } = await runWebSearchPreview({ query: question });
      webSummary = summary;
    } catch (e) {
      // Fail silently and fall back to no-web
      webSummary = null;
    }

    // 2) Build system prompt
    const baseSystemPrompt =
      systemPrompt ||
      `
You are an AI assistant specialising in investment, private markets and related institutional topics.
Provide clear, concise answers suitable for professional investment audiences.
If you are uncertain, say so explicitly and avoid making up facts.
`;

    // 3) Build message array, injecting web context if present
    const messages = [
      { role: "system", content: baseSystemPrompt },
      webSummary
        ? {
            role: "system",
            content: `Public domain context (for answering the user's question). Use this to ground your answer in recent information where appropriate:\n\n${webSummary}`,
          }
        : null,
      context
        ? {
            role: "system",
            content: `Additional internal/project context from the user (not from the public web):\n\n${context}`,
          }
        : null,
      { role: "user", content: question },
    ].filter(Boolean);

    // 4) Call OpenAI for the actual answer
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.2,
      max_tokens: 800,
      messages,
    });

    const answer =
      completion.choices?.[0]?.message?.content?.trim() ||
      "I was unable to generate an answer.";

    return res.status(200).json({
      ok: true,
      question,
      answer,
      webUsed: Boolean(webSummary),
      webSummary, // useful for debugging / later UI
    });
  } catch (err) {
    console.error("Error in /api/query:", err);
    return res.status(500).json({
      ok: false,
      error: err.message || String(err),
    });
  }
}
