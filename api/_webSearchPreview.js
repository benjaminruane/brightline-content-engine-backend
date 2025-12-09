// _webSearchPreview.js
//
// Convenience helper for experimenting with the Responses API + web_search.
// Not currently used in the main flows, but kept around for debugging / POCs.

import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Run a simple web search using the Responses API and return
// a structured list of results (title, url, snippet) plus the raw payload.
export async function runWebSearchPreview(query) {
  if (!query || typeof query !== "string") {
    throw new Error("Query must be a non-empty string");
  }

  const model = "gpt-4.1-mini";

  const body = {
    model,
    tools: [
      {
        type: "web_search", // 🔄 modern tool name
      },
    ],
    tool_choice: {
      type: "web_search",
    },
    // For a simple one-off call we can pass a plain string input
    input: query.trim(),
    max_output_tokens: 256,
    temperature: 0.1,
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.error("runWebSearchPreview /v1/responses error:", errorText);
    throw new Error(
      `Responses API error: HTTP ${response.status}${
        errorText ? ` – ${errorText}` : ""
      }`
    );
  }

  const payload = await response.json();

  const snippets = [];

  if (Array.isArray(payload.output)) {
    for (const item of payload.output) {
      if (
        item.type === "tool_output" &&
        item.tool_name === "web_search" &&
        item.output &&
        Array.isArray(item.output.results)
      ) {
        for (const r of item.output.results) {
          snippets.push({
            title: r.title,
            url: r.url,
            snippet: r.content,
          });
        }
      }
    }
  }

  return {
    raw: payload,
    snippets,
  };
}
