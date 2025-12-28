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

    const askMode =
      (typeof body.modeOverride === "string" && body.modeOverride.trim()) ||
      (typeof body.askMode === "string" && body.askMode.trim()) ||
      "answer";

    if (!question) return res.status(400).json({ error: "Missing question" });

    const subject = deriveQueryFromAsk({ question, title, draftText });
    const search = await tavilySearch(subject);
    const webBlock = formatWebResultsForPrompt(search);
    const references = webResultsToReferences(search?.results || []);

    const system = `
You are "Ask AI" inside Content Engine.

You MUST use the WEB RESULTS when making factual claims.

Citations:
- When you use a web result, cite it inline using bracketed numbers like [1], [2], etc.
- The numbers MUST correspond to the "id" field in the REFERENCES array provided to you.
- If you cannot find support in WEB RESULTS, say so plainly and do not invent.

Answer depth:
– Narrow: 2–4 sentences.
– Analytical/ambiguous: concise bullets or 4–10 sentences with reasoning + caveats.
– No filler.

Return ONLY valid JSON with this exact shape:
{
  "answer": "string (may include inline citations like [1])",
  "confidence": number between 0 and 1,
  "confidenceReason": "short string"
}
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

REFERENCES (for citation IDs):
${JSON.stringify(
  references.map((r) => ({ id: r.id, title: r.title, url: r.url })),
  null,
  2
)}
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
                  history.map((h, i) => `Q${i + 1}: ${h.question}\nA${i + 1}: ${h.answer || "(none)"}`).join("\n\n"),
              },
            ]
          : []),
        { role: "user", content: user },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content || "";
    const parsed = safeJsonParse(raw) || {};

    const answer = typeof parsed.answer === "string" && parsed.answer.trim() ? parsed.answer.trim() : "";
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
      references, // structured objects with title/url/id
      meta: {
        webSearch: { enabled: true, used: Boolean(search?.ok) },
      },
    });
  } catch (err) {
    return res.status(500).json({ error: "Ask AI failed", details: err?.message || String(err) });
  }
}
