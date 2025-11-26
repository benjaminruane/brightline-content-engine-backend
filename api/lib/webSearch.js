// api/lib/webSearch.js
//
// Safe web search helper for Brightline Content Engine.
//
// Uses OpenAI's Responses API with the built-in web_search_preview tool.
// IMPORTANT: This helper only ever sees high-level metadata (company,
// sector, geography, deal type). It must NEVER receive raw document text.

import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function webSearch({
  company,
  sector,
  geography,
  dealType,
  maxResults = 4,
}) {
  try {
    // Build a conservative, high-level query string.
    const parts = [];

    if (company && typeof company === "string") {
      parts.push(company.trim().slice(0, 80));
    }
    if (sector && typeof sector === "string") {
      parts.push(sector.trim().slice(0, 80));
    }
    if (geography && typeof geography === "string") {
      parts.push(geography.trim().slice(0, 80));
    }
    if (dealType && typeof dealType === "string") {
      parts.push(dealType.trim().slice(0, 80));
    }

    const query = parts.join(" ").trim();

    // If we have nothing sensible to search for, bail out.
    if (!query) {
      return [];
    }

    const systemPrompt = `
You are a retrieval assistant with access to web search tools.

Given a short query about an investment-related topic, you MUST:
- Use web search tools (already available to you) to look up current public information.
- Return a JSON object with a "results" array.
- Each result must include: "title", "url", "snippet", "domain".

Rules:
- Only include public, non-sensitive sources.
- Prefer primary sources (company sites, filings, trusted news) over random blogs.
- Snippets should be 1–3 sentences of plain text.
- Domain should be extracted from the URL (e.g. "ft.com", "sec.gov").
- Respond with JSON ONLY. No explanation, no prose, no markdown fences.
`.trim();

    const userPrompt = `
Query: "${query}"

Return JSON of the form:
{
  "results": [
    {
      "title": "…",
      "url": "https://…",
      "snippet": "…",
      "domain": "example.com"
    }
  ]
}
`.trim();

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      // Allow the model to actually hit the web.
      tools: [{ type: "web_search_preview" }],
      max_output_tokens: 800,
    });

    // Try to extract the assistant's JSON text.
    let raw =
      response.output_text ||
      (Array.isArray(response.output) &&
        response.output[0] &&
        Array.isArray(response.output[0].content) &&
        response.output[0].content[0] &&
        response.output[0].content[0].text) ||
      "";

    if (!raw || typeof raw !== "string") {
      return [];
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Strip common ```json fences if present.
      const cleaned = raw.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(cleaned);
    }

    const results = Array.isArray(parsed.results) ? parsed.results : [];

    return results.slice(0, maxResults).map((r) => {
      const url = (r.url || "").toString();
      return {
        title: (r.title || "").toString(),
        url,
        snippet: (r.snippet || "").toString(),
        domain: r.domain || safeDomain(url),
        origin: "web",
      };
    });
  } catch (err) {
    console.error("[webSearch] error:", err);
    // Fail closed: no web results rather than breaking callers.
    return [];
  }
}

function safeDomain(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}
