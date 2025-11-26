// api/web-test.js
//
// Diagnostic endpoint to safely test OpenAI web search in isolation.
// Does NOT affect any production routes.

import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const { query = "" } = req.body || {};
    if (!query.trim()) {
      return res.status(400).json({ error: "Missing query" });
    }

    const systemPrompt = `
You are a retrieval assistant.

Use ONLY web search tools that are available to you.

Return JSON of the form:
{
  "results": [
    { "title": "", "url": "", "snippet": "", "domain": "" }
  ]
}

Snippets must be short plain text. Only include public sources.
`.trim();

    const userPrompt = `
Query: "${query}"

Return ONLY JSON.
`.trim();

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools: [{ type: "web_search_preview" }],
      max_output_tokens: 600,
    });

    let raw =
      response.output_text ||
      (Array.isArray(response.output) &&
        response.output[0]?.content?.[0]?.text) ||
      "";

    if (typeof raw !== "string") {
      return res.status(500).json({
        error: "Unexpected model output",
        raw: response,
      });
    }

    // Attempt to parse JSON
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const cleaned = raw.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(cleaned);
    }

    // Validate structure
    if (!Array.isArray(parsed.results)) {
      return res.status(500).json({
        error: "Model did not return results array",
        raw,
      });
    }

    // Normalise domains
    const final = parsed.results.map((r) => ({
      title: r.title || "",
      url: r.url || "",
      snippet: r.snippet || "",
      domain: extractDomain(r.url),
    }));

    return res.status(200).json({ results: final });
  } catch (err) {
    console.error("web-test error:", err);
    return res.status(500).json({
      error: err.message || String(err),
    });
  }
}

function extractDomain(url = "") {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}
