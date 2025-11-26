// /api/web-test.js
//
// Simple, browser-testable diagnostic endpoint for OpenAI web_search_preview.
// - Only uses GET
// - Accepts query parameters
// - Returns JSON you can see directly in the browser
// - Does NOT touch any existing routes or shared helpers

import OpenAI from "openai";

// --- CORS helper (copied so we don't risk touching other files) ----------
function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";

  res.setHeader(
    "Access-Control-Allow-Origin",
    origin === "null" ? "*" : origin
  );
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
// ------------------------------------------------------------------------

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  // Handle CORS preflight (just in case)
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Enforce GET-only for this diagnostic route
  if (req.method !== "GET") {
    res.setHeader("Content-Type", "application/json");
    return res.status(405).json({
      ok: false,
      error: "Method not allowed. Use GET with query parameters.",
    });
  }

  // Quick "ping" mode that doesn't hit OpenAI at all
  const { mode, q, model } = req.query;

  if (mode === "ping") {
    res.setHeader("Content-Type", "application/json");
    return res.status(200).json({
      ok: true,
      mode: "ping",
      message: "web-test endpoint is reachable.",
      env: {
        hasApiKey: Boolean(process.env.OPENAI_API_KEY || false),
        nodeEnv: process.env.NODE_ENV || "unknown",
      },
    });
  }

  if (!process.env.OPENAI_API_KEY) {
    res.setHeader("Content-Type", "application/json");
    return res.status(500).json({
      ok: false,
      error: "Missing OPENAI_API_KEY in environment.",
      suggestion:
        "Set OPENAI_API_KEY in your Vercel environment variables and redeploy.",
    });
  }

  // Default test query and model, overridable via query params
  const userQuery =
    typeof q === "string" && q.trim().length > 0
      ? q.trim()
      : "Test web search: recent positive news in technology, 2 short bullet points.";

  const modelName = typeof model === "string" && model.trim().length > 0
    ? model.trim()
    : "gpt-4.1"; // model known to support web_search_preview

  try {
    const response = await client.responses.create({
      model: modelName,
      tools: [{ type: "web_search_preview" }],
      // Force it to actually use web search so we can verify the tool path:
      tool_choice: { type: "web_search_preview" },
      input: userQuery,
    });

    // Try to extract a human-readable text summary, but also return raw
    let outputText = null;
    if (response.output_text) {
      // Newer SDK convenience field
      outputText = response.output_text;
    } else if (Array.isArray(response.output) && response.output.length > 0) {
      // Fallback: try to navigate the raw structure
      const first = response.output[0];
      const content =
        first &&
        first.content &&
        Array.isArray(first.content) &&
        first.content[0];
      const text = content && content.text && content.text.value;
      outputText = text || null;
    }

    // Extract any web_search related items (for debugging)
    const webSearchItems = Array.isArray(response.output)
      ? response.output.filter(
          (item) => item.type === "web_search_call" || item.type === "web_search_result"
        )
      : [];

    res.setHeader("Content-Type", "application/json");
    return res.status(200).json({
      ok: true,
      query: userQuery,
      model: modelName,
      tool: "web_search_preview",
      summary: outputText,
      // Useful for inspecting structure purely via browser:
      webSearchItems,
      // Keep raw but warn it's verbose
      raw: response,
    });
  } catch (err) {
    // Make the error shape visible since you can't see server console
    const safeError = {
      message: err?.message || "Unknown error",
      name: err?.name || "Error",
      // Vercel / OpenAI often tuck useful info inside these:
      status: err?.status || err?.statusCode || null,
      data: err?.response?.data || null,
    };

    res.setHeader("Content-Type", "application/json");
    return res.status(500).json({
      ok: false,
      error: "Failed to call OpenAI with web_search_preview.",
      details: safeError,
    });
  }
}
