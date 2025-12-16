// api/query.js
//
// Ask AI endpoint.
// IMPORTANT BEHAVIOUR:
// - Always uses public web search to enrich answers (independent of any UI toggle).
// - Returns a backward-compatible JSON shape for the frontend.
//
// Response shape (stable):
// {
//   ok: true,
//   answer: string,
//   confidence: number|null,
//   confidenceReason: string|null,
//   references: [{ id, title, url }] (may be []),
//   meta: { ... }
// }

import OpenAI from "openai";
import {
  tavilySearch,
  formatWebResultsForPrompt,
  webResultsToReferences,
  deriveQueryFromAsk,
} from "./_web.js";

// --- CORS helper --------------------------------------------------
function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin === "null" ? "*" : origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
// ------------------------------------------------------------------

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function clamp01(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  const cleaned = [];
  for (const m of history.slice(-12)) {
    if (!m || typeof m !== "object") continue;
    const role = m.role === "user" || m.role === "assistant" ? m.role : null;
    const content = typeof m.content === "string" ? m.content : "";
    if (!role || !content.trim()) continue;
    cleaned.push({ role, content: content.trim() });
  }
  return cleaned;
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  if (!process.env.OPENAI_API_KEY) {
    return res
      .status(500)
      .json({ error: "Missing OPENAI_API_KEY environment variable" });
  }

  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

    const question = typeof body.question === "string" ? body.question.trim() : "";
    const title = typeof body.title === "string" ? body.title : "";
    const draftText = typeof body.draftText === "string" ? body.draftText : "";
    const modelId =
      typeof body.modelId === "string" && body.modelId.trim()
        ? body.modelId.trim()
        : "gpt-4o-mini";
    const history = normalizeHistory(body.history);

    // Backwards/forwards compatibility: frontend uses "modeOverride"; older code used "askMode".
    const askMode =
      (typeof body.modeOverride === "string" && body.modeOverride.trim()) ||
      (typeof body.askMode === "string" && body.askMode.trim()) ||
      "answer";

    if (!question) return res.status(400).json({ error: "Missing question" });

    // --- Always-on web search (Ask AI) ------------------------------------
    const searchQuery = deriveQueryFromAsk({ question, title, draftText });
    const search = await tavilySearch({ query: searchQuery, maxResults: 5 });

    const webBlock = search.ok ? formatWebResultsForPrompt(search.results) : "";
    const references = search.ok ? webResultsToReferences(search.results) : [];

    const system = `
You are "Ask AI" inside an internal tool called Content Engine.

You MUST answer using the provided web results when they are relevant.
If the web results are thin, say so, and answer cautiously.

Style:
- Be concise, direct, and helpful.
- Prefer bullet points for multi-part answers.
- Use standard English commas for numbers (e.g., USD 164,000).
- Do not use thousand separators for years (write 2025, not 2,025).

Output:
Return ONLY valid JSON with this schema:
{
  "answer": string,
  "confidence": number,            // 0..1
  "confidenceReason": string|null  // short explanation
}

If you reference web results in the answer, cite them inline as [1], [2], etc
matching the result numbers we provided.
`.trim();

    const user = `
QUESTION:
${question}

MODE:
${askMode}

OPTIONAL CONTEXT:
Title: ${title || "(none)"}

Draft (may be empty):
${draftText ? draftText.slice(0, 6000) : "(none)"}

WEB RESULTS:
${webBlock || "(no web results retrieved)"}
`.trim();

    const completion = await client.chat.completions.create({
      model: modelId,
      temperature: 0.2,
      max_tokens: 900,
      messages: [{ role: "system", content: system }, ...history, { role: "user", content: user }],
      response_format: { type: "json_object" },
    });

    const raw = completion.choices?.[0]?.message?.content || "";
    const parsed = safeJsonParse(raw) || {};

    const answer =
      typeof parsed.answer === "string" && parsed.answer.trim()
        ? parsed.answer.trim()
        : "";
    const confidence = clamp01(parsed.confidence);
    const confidenceReason =
      typeof parsed.confidenceReason === "string" && parsed.confidenceReason.trim()
        ? parsed.confidenceReason.trim()
        : null;

    return res.status(200).json({
      ok: true,
      answer,

      // Backward-compatible top-level fields (frontend reads these)
      confidence,
      confidenceReason,
      references,

      meta: {
        webSearch: {
          enabled: true,
          used: Boolean(search.ok && references.length),
          provider: "tavily",
          query: searchQuery,
          resultsCount: references.length,
          error: search.ok ? null : search.error || "Web search failed",
          note: "Ask AI always uses web search (independent of the draft toggle).",
        },
        model: completion.model || modelId,
        usage: {
          promptTokens: completion.usage?.prompt_tokens ?? null,
          completionTokens: completion.usage?.completion_tokens ?? null,
          totalTokens: completion.usage?.total_tokens ?? null,
        },
      },
    });
  } catch (err) {
    return res.status(500).json({
      error: "Failed to process query",
      details: err?.message || String(err),
    });
  }
}
