// api/query.js
//
// Ask AI endpoint.
// Behaviour: ALWAYS uses web search (independent of the draft toggle).

import OpenAI from "openai";
import {
  tavilySearch,
  formatWebResultsForPrompt,
  webResultsToReferences,
  deriveQueryFromAsk,
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
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return Math.max(0, Math.min(1, n));
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  const cleaned = [];
  for (const m of history.slice(-12)) {
    if (!m || typeof m !== "object") continue;
    const role = m.role === "user" || m.role === "assistant" ? m.role : null;
    const content = typeof m.content === "string" ? m.content.trim() : "";
    if (!role || !content) continue;
    cleaned.push({ role, content });
  }
  return cleaned;
}

function inferSubject({ title, draftText }) {
  const t = typeof title === "string" ? title.trim() : "";
  if (t) return t;

  const d = typeof draftText === "string" ? draftText.trim() : "";
  if (!d) return "";

  // First non-empty line is usually the “subject” in your drafts.
  const firstLine = d.split(/\r?\n/).find((x) => x.trim())?.trim() || "";
  return firstLine.slice(0, 140);
}

function hasAmbiguousCompanyRef(question) {
  const q = typeof question === "string" ? question.toLowerCase() : "";
  return (
    q.includes("the company") ||
    q.includes("the business") ||
    q.includes("the issuer") ||
    q.includes("the firm")
  );
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

    const question = typeof body.question === "string" ? body.question.trim() : "";
    const title = typeof body.title === "string" ? body.title : "";
    const draftText = typeof body.draftText === "string" ? body.draftText : "";
    const modelId =
      typeof body.modelId === "string" && body.modelId.trim()
        ? body.modelId.trim()
        : "gpt-4o-mini";
    const history = normalizeHistory(body.history);

    const askMode =
      (typeof body.modeOverride === "string" && body.modeOverride.trim()) ||
      (typeof body.askMode === "string" && body.askMode.trim()) ||
      "answer";

    if (!question) return res.status(400).json({ error: "Missing question" });

    const subject = inferSubject({ title, draftText });

    // Always-on web retrieval
    let searchQuery = deriveQueryFromAsk({ question, title, draftText });

    // If the question uses ambiguous references like "the company", pin it to the subject.
    if (hasAmbiguousCompanyRef(question) && subject) {
      searchQuery = `${subject} ${question}`.slice(0, 420);
    }

    const search = await tavilySearch({ query: searchQuery, maxResults: 5 });
    const webBlock = search.ok ? formatWebResultsForPrompt(search.results) : "";
    const references = search.ok ? webResultsToReferences(search.results) : [];

    const system = `
You are "Ask AI" inside Content Engine.

Always use the WEB RESULTS when relevant. If results are thin, say so.

CRITICAL CONTEXT LINKAGE:
If the user question uses phrases like "the company", "the business", "the issuer", or "the firm",
interpret that as referring to the primary SUBJECT of the draft/title (provided below), unless the user explicitly specifies a different entity.

Answer at the appropriate depth:
– If the question is narrow, answer in 2–4 sentences.
– If it’s analytical or ambiguous, answer in 4–10 sentences or concise bullets, and include reasoning + caveats.
– Avoid filler.

Return ONLY valid JSON:
{
  "answer": string,
  "confidence": number,            // 0..1
  "confidenceReason": string|null
}

If you use web results, you MUST cite them inline as [1], [2], etc.
When web results are available and relevant, include at least one citation.
When you make factual claims that are supported by web results, include citations on the same sentence.

`.trim();

    const user = `
SUBJECT:
${subject || "(unknown)"}

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
      max_completion_tokens: 900,
      messages: [{ role: "system", content: system }, ...history, { role: "user", content: user }],
      response_format: { type: "json_object" },
    });

    const raw = completion.choices?.[0]?.message?.content || "";
    const parsed = safeJsonParse(raw) || {};

    const answer =
      typeof parsed.answer === "string" && parsed.answer.trim() ? parsed.answer.trim() : "";
    const confidence = clamp01(parsed.confidence);
    const confidenceReason =
      typeof parsed.confidenceReason === "string" && parsed.confidenceReason.trim()
        ? parsed.confidenceReason.trim()
        : null;

    return res.status(200).json({
      ok: true,
      answer,

      // Backward compatible top-level fields (frontend reads these)
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
      },
    });
  } catch (err) {
    return res.status(500).json({
      error: "Failed to process query",
      details: err?.message || String(err),
    });
  }
}
