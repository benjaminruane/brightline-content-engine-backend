// api/analyse-statements.js
//
// Statement Analysis.
// Behaviour: ALWAYS uses web search (independent of the draft toggle).

import OpenAI from "openai";
import {
  tavilySearch,
  formatWebResultsForPrompt,
  webResultsToReferences,
  deriveQueryFromDraft,
} from "./_web.js";

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin === "null" ? "*" : origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function clamp01(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "Missing OPENAI_API_KEY environment variable" });
  }

  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

    const draftText = typeof body.draftText === "string" ? body.draftText : "";
    const modelId =
      typeof body.modelId === "string" && body.modelId.trim()
        ? body.modelId.trim()
        : "gpt-4o-mini";

    if (!draftText.trim()) return res.status(400).json({ error: "Missing or invalid draftText" });

    // Always-on web retrieval
    const searchQuery = deriveQueryFromDraft(draftText);
    const search = await tavilySearch({ query: searchQuery, maxResults: 6 });
    const webBlock = search.ok ? formatWebResultsForPrompt(search.results) : "";
    const references = search.ok ? webResultsToReferences(search.results) : [];

    const systemPrompt = `
You are an expert analyst and fact-checker.

Turn the draft into atomic statements. For each statement:
- category
- reliability score 0..1
- explanation (never "-" or empty)
- implication (never "-" or empty)

Use the WEB RESULTS to corroborate or challenge statements where possible.
If web results are insufficient, say so.

Return ONLY valid JSON:
{
  "statements": [
    { "id": number, "text": string, "category": string, "score": number, "explanation": string, "implication": string }
  ],
  "summary": { "note": string|null }
}
`.trim();

    const userPrompt = `
DRAFT:
${draftText}

WEB RESULTS:
${webBlock || "(no web results retrieved)"}
`.trim();

    const completion = await client.chat.completions.create({
      model: modelId,
      temperature: 0.2,
      max_completion_tokens: 1800,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    });

    const raw = completion.choices?.[0]?.message?.content || "";
    const parsed = safeJsonParse(raw) || {};

    const statements = Array.isArray(parsed.statements)
      ? parsed.statements.map((s, idx) => {
          const id = typeof s?.id === "number" ? s.id : idx + 1;
          const text = typeof s?.text === "string" ? s.text.trim() : "";
          const category = typeof s?.category === "string" && s.category.trim() ? s.category.trim() : "Other";
          const score = clamp01(typeof s?.score === "number" ? s.score : 0);

          let explanation = typeof s?.explanation === "string" ? s.explanation.trim() : "";
          let implication = typeof s?.implication === "string" ? s.implication.trim() : "";

          if (!explanation || explanation === "-" || explanation === "—") {
            explanation = "Insufficient information to justify a stronger assessment; treat this claim cautiously.";
          }
          if (!implication || implication === "-" || implication === "—") {
            implication = "Add supporting sources, clarify specifics, or rephrase/remove the claim if it cannot be supported.";
          }

          return { id, text, category, score, explanation, implication };
        })
      : [];

    return res.status(200).json({
      ok: true,
      statements,
      summary: { note: typeof parsed?.summary?.note === "string" ? parsed.summary.note : null },
      meta: {
        webSearch: {
          enabled: true,
          used: Boolean(search.ok && references.length),
          provider: "tavily",
          query: searchQuery,
          resultsCount: references.length,
          error: search.ok ? null : search.error || "Web search failed",
          note: "Statement Analysis always uses web search (independent of the draft toggle).",
        },
        references,
        model: completion.model || modelId,
      },
    });
  } catch (err) {
    return res.status(500).json({
      error: "Failed to analyse statements",
      details: err?.message || String(err),
    });
  }
}
