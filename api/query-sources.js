// api/query-sources.js
//
// Sources Q&A endpoint.
// Uses user-provided SOURCES text strictly
// OR (when source texts are missing/thin) in the SOURCES USED list.

import OpenAI from "openai";

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin === "null" ? "*" : origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

const client = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!client) {
    return res.status(500).json({
      ok: false,
      error: "Server is missing OPENAI_API_KEY",
    });
  }

  try {
    const body = typeof req.body === "string" ? safeJsonParse(req.body) : req.body || {};
    const question = typeof body.question === "string" ? body.question.trim() : "";
    const sources = Array.isArray(body.sources) ? body.sources : [];
    const draftText = typeof body.draftText === "string" ? body.draftText : "";
    const modelId =
      typeof body.modelId === "string" && body.modelId.trim() ? body.modelId.trim() : "gpt-5.1";

    if (!question) return res.status(400).json({ error: "Missing question" });

    const system = `
You answer questions grounded strictly in the provided sources.

Rules:
- Only use the provided SOURCES.
- If you cannot answer from the sources, say so clearly.
- Return ONLY valid JSON:
{
  "answer": "string (may include markdown)",
  "confidence": number between 0 and 1,
  "confidenceReason": "string or null"
}
`.trim();

    const user = `
QUESTION:
${question}

DRAFT CONTEXT (may be empty):
${draftText || "(none)"}

SOURCES:
${sources.length ? JSON.stringify(sources, null, 2) : "(none)"}
`.trim();

    const completion = await client.chat.completions.create({
      model: modelId,
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    const raw = completion?.choices?.[0]?.message?.content || "";
    const parsed = safeJsonParse(raw) || {};

    const answer =
      typeof parsed.answer === "string" && parsed.answer.trim() ? parsed.answer.trim() : "";
    const confidence =
      typeof parsed.confidence === "number" && Number.isFinite(parsed.confidence)
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0.5;
    const confidenceReason =
      typeof parsed.confidenceReason === "string" && parsed.confidenceReason.trim()
        ? parsed.confidenceReason.trim()
        : null;

    return res.status(200).json({
      ok: true,
      answer,
      confidence,
      confidenceReason,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "Query sources failed",
      details: err?.message || String(err),
    });
  }
}
