import { webSearch } from "./lib/webSearch";

import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// --- CORS helper -----------------------------------------
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

// --- Body normaliser (matches your other routes) ---------
function normaliseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

export default async function handler(req, res) {
  // Apply CORS headers
  setCorsHeaders(req, res);

  // Preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = normaliseBody(req);
    const {
  question,
  draftText,
  scenario,
  versionType,
  sources = [],
  company,
  sector,
  geography,
  dealType,
} = body || {};


    if (!question || !draftText) {
      return res.status(400).json({
        error: "Both 'question' and 'draftText' are required",
      });
    }

    const sourceSummaries = Array.isArray(sources)
      ? sources
          .slice(0, 6)
          .map((s, idx) => {
            const label =
              s.name ||
              s.url ||
              s.kind ||
              `Source ${idx + 1}`;
            const text = (s.text || "").toString();
            const snippet = text.slice(0, 1200); // keep prompt bounded
            return `Source ${idx + 1} – ${label}:\n${snippet}`;
          })
          .join("\n\n")
      : "No structured sources were provided.";

const systemPrompt = `
You are an analysis assistant responding to user questions using TWO categories of evidence:

1. **Internal sources**
   - Uploaded documents (PDF, DOCX, TXT)
   - URL-extracted text
   - Manual source text
   These are private and MUST NEVER be sent to external services.
   You may use them freely to answer the user's question.

2. **Public web sources**
   - Retrieved via safe, high-level search queries that reveal no confidential text.
   - Each item includes: { title, url, domain, snippet }.
   - You may rely on these for context, factual checks, and enrichment.
   - You may reference the domain (e.g., "according to ft.com") when helpful.

**Rules:**
- Never reveal private internal-source text verbatim unless the user explicitly asks for a quote.
- Never imply that internal documents were found on the public web.
- If internal and public evidence conflict, prefer internal but note the discrepancy.
- If something cannot be confirmed, state uncertainty rather than guessing.

Below is your combined evidence set (internal + public web), merged for your use:

${JSON.stringify(allSources, null, 2)}

Provide a short, direct answer to the user's question in 1–3 concise paragraphs.
`.trim();


    const userPrompt = `
Scenario: ${scenario || "n/a"}
Version type: ${versionType || "n/a"}

DRAFT TEXT:
${draftText}

SOURCES:
${sourceSummaries}

USER QUESTION:
${question}
`.trim();

    const modelId = process.env.OPENAI_MODEL_ID || "gpt-4.1-mini";

    let answerText = "";

    // Always perform web search for AI Query
const webResults = await webSearch({
  company,
  sector,
  geography,
  dealType,
  maxResults: 4,
});

// Merge as separate "public web sources"
const allSources = [
  ...sources,
  ...webResults.map((w) => ({
    ...w,
    kind: "web",
  })),
];


    // Prefer Responses API if available
    if (client.responses && typeof client.responses.create === "function") {
      const response = await client.responses.create({
        model: modelId,
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_output_tokens: 800,
      });

      // Try to extract text in a resilient way
      if (typeof response.output_text === "string") {
        answerText = response.output_text;
      } else if (
        Array.isArray(response.output) &&
        response.output[0] &&
        Array.isArray(response.output[0].content) &&
        response.output[0].content[0] &&
        typeof response.output[0].content[0].text === "string"
      ) {
        answerText = response.output[0].content[0].text;
      } else {
        answerText = JSON.stringify(response, null, 2);
      }
    }
    // Fallback to Chat Completions API
    else if (
      client.chat &&
      client.chat.completions &&
      typeof client.chat.completions.create === "function"
    ) {
      const completion = await client.chat.completions.create({
        model: modelId,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 800,
      });

      answerText =
        completion.choices?.[0]?.message?.content ||
        JSON.stringify(completion, null, 2);
    } else {
      throw new Error(
        "OpenAI client does not expose 'responses.create' or 'chat.completions.create'"
      );
    }

    return res.status(200).json({ answer: answerText });
  } catch (err) {
    console.error("Error in /api/query:", err);
    return res.status(500).json({
      error: "Failed to process query",
      details: err && err.message ? err.message : String(err),
    });
  }
}
