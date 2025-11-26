// /api/web-test.js
//
// Browser-testable diagnostic endpoint for OpenAI web_search_preview.
// - Uses only GET + query params
// - Returns JSON
// - Does NOT depend on the OpenAI Node SDK (uses fetch directly)
// - Does NOT touch any existing routes

// --- CORS helper (local to this file only) -------------------------------
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

  const { mode, q, model } = req.query;

  // Lightweight "ping" that doesn't call OpenAI at all
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

  const modelName =
    typeof model === "string" && model.trim().length > 0
      ? model.trim()
      : "gpt-4.1"; // model that supports web_search_preview

  try {
    // Call the Responses API directly via fetch (no SDK)
    const apiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: modelName,
        tools: [{ type: "web_search_preview" }],
        tool_choice: { type: "web_search_preview" },
        input: userQuery,
      }),
    });

    const payload = await apiResponse.json();

    if (!apiResponse.ok) {
      // Surface OpenAI error clearly in JSON
      const message =
        payload?.error?.message ||
        `OpenAI API error (status ${apiResponse.status})`;

      res.setHeader("Content-Type", "application/json");
      return res.status(apiResponse.status).json({
        ok: false,
        error: "Failed to call OpenAI with web_search_preview.",
        details: {
          message,
          status: apiResponse.status,
          data: payload,
        },
      });
    }

    // Try to extract a human-readable text summary
    let summary = null;

    if (payload.output_text) {
      summary = payload.output_text;
    } else if (Array.isArray(payload.output) && payload.output.length > 0) {
      const first = payload.output[0];
      const content =
        first &&
        first.content &&
        Array.isArray(first.content) &&
        first.content[0];
      const text = content && content.text && content.text.value;
      summary = text || null;
    }

    // Extract any search-related items for debugging/inspection
    const webSearchItems = Array.isArray(payload.output)
      ? payload.output.filter(
          (item) =>
            item.type === "web_search_call" ||
            item.type === "web_search_result" ||
            item.role === "tool"
        )
      : [];

    res.setHeader("Content-Type", "application/json");
    return res.status(200).json({
      ok: true,
      query: userQuery,
      model: modelName,
      tool: "web_search_preview",
      summary,
      webSearchItems,
      // Full raw payload so you can inspect structure in the browser
      raw: payload,
    });
  } catch (err) {
    const safeError = {
      message: err?.message || "Unknown error",
      name: err?.name || "Error",
      status: err?.status || null,
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
