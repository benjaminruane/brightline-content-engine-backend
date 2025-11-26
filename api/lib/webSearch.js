// api/lib/webSearch.js

import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Safe web search wrapper.
 * Accepts only high-level metadata (company, sector, geography, deal type).
 * NEVER send uploaded-document text here.
 */
export async function webSearch({ company, sector, geography, dealType, maxResults = 4 }) {
  try {
    // Build a minimal, safe query
    const qParts = [];
    if (company) qParts.push(company);
    if (sector) qParts.push(sector);
    if (geography) qParts.push(geography);
    if (dealType) qParts.push(dealType);

    const query = qParts.join(" ").trim();
    if (!query) return [];

    // Use OpenAI's built-in web search tool
    const response = await client.responses.create({
      model: "gpt-4.1-mini",    // light, cheap model is fine for retrieval
      input: [
        {
          role: "system",
          content:
            "Perform a factual public web search. Return ONLY raw search results. No summaries.",
        },
        { role: "user", content: `Search the public domain for: "${query}"` },
      ],
      tools: [{ type: "web_search_preview" }],
      max_output_tokens: 300,
    });

    // The search results appear as tool calls in response.output[n].content
    const toolCalls = (response?.output ?? [])
      .flatMap((o) => o?.content ?? [])
      .filter((c) => c?.type === "web_search_result");

    const results = toolCalls
      .flatMap((c) => c.results || [])
      .slice(0, maxResults)
      .map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.snippet || "",
        domain: safeDomain(r.url),
        origin: "web",
      }));

    return results;
  } catch (err) {
    console.error("webSearch failed", err);
    return [];
  }
}

function safeDomain(url = "") {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return "unknown";
  }
}
