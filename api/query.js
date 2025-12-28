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
    const q = typeof m.question === "string" ? m.question.trim() : "";
    const a = typeof m.answer === "string" ? m.answer.trim() : "";
    if (!q) continue;
    cleaned.push({ question: q, answer: a });
  }
  return cleaned;
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "Missing OPENAI_API_KEY environment variable" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

    const question = typeof body.question === "string" ? body.question.trim() : "";
    const title = typeof body.title === "string" ? body.title : "";
    const draftText = typeof body.draftText === "string" ? body.draftText : "";
    const modelId =
      typeof body.modelId === "string" && body.modelId.trim() ? body.modelId.trim() : "gpt-5.1";
    const history = normalizeHistory(body.history);

    if (!question) return res.status(400).json({ error: "Missing question" });

    const subject = deriveQueryFromAsk({ question, title, draftText });
    const search = await tavilySearch(subject);
    const webBlock = formatWebResultsForPrompt(search);

    // IMPORTANT: keep order stable so [1] maps to references[0], etc.
    const references = webResultsToReferences(search?.results || []).map((r, i) => ({
      ...r,
      idx: i + 1,
    }));

    const referencesForModel = references
      .slice(0, 8)
      .map((r) => `[${r.idx}] ${r.title} — ${r.url}`)
      .join("\n");

    const system = `
You are "Ask AI" inside Content Engine.

You MUST use the WEB RESULTS when making factual claims.

Citations (strict):
- Use ONLY these bracketed citations: [1], [2], [3] ... matching the numbered REFERENCES list.
- Put citations on the same sentence as the claim.
- If WEB RESULTS do not support a claim, say so plainly.

Formatting:
- Use readable markdown: short paragraphs, bullets where helpful.
- You MAY use **bold** for emphasis.

Return ONLY valid JSON:
{
  "answer": "string (may include markdown and citations like [1])",
  "confidence": number between 0 and 1,
  "confidenceReason": "short string or null"
}
`.trim();

    const user = `
SUBJECT:
${subject || "(unknown)"}

QUESTION:
${question}

OPTIONAL CONTEXT:
Title: ${title || "(none)"}

Draft (may be empty):
${draftText ? draftText.slice(0, 6000) : "(none)"}

WEB RESULTS:
${webBlock || "(no web results retrieved)"}

REFERENCES (use these exact citation numbers):
${referencesForModel || "(no references)"}
`.trim();

    const completion = await client.chat.completions.create({
      model: modelId,
      temperature: 0.2,
      max_completion_tokens: 900,
      messages: [
        { role: "system", content: system },
        ...(history.length
          ? [
              {
                role: "user",
                content:
                  "Recent Q&A context:\n" +
                  history
                    .map(
                      (h, i) =>
                        `Q${i + 1}: ${h.question}\nA${i + 1}: ${h.answer || "(none)"}`
                    )
                    .join("\n\n"),
              },
            ]
          : []),
        { role: "user", content: user },
      ],
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
      confidence,
      confidenceReason,
      references: references.slice(0, 8).map((r) => ({ title: r.title, url: r.url })), // order = [1..]
      meta: { webSearch: { enabled: true, used: Boolean(search?.ok) } },
    });
  } catch (err) {
    return res.status(500).json({ error: "Ask AI failed", details: err?.message || String(err) });
  }
}
