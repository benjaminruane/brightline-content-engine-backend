// api/query-sources.js
//
// Sources Q&A endpoint.

import OpenAI from "openai";
import { deriveQueryFromAsk, runWebSearch, formatWebResultsForPrompt } from "../lib/web.js";

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin === "null" ? "*" : origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function clamp01(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) return 0.5;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ ok: false, error: "Server is missing OPENAI_API_KEY" });
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    const body = typeof req.body === "string" ? safeJsonParse(req.body) : req.body || {};
    const question = typeof body.question === "string" ? body.question.trim() : "";
    const draftText = typeof body.draftText === "string" ? body.draftText : "";
    const sources = Array.isArray(body.sources) ? body.sources : [];
    const modelId =
      typeof body.modelId === "string" && body.modelId.trim() ? body.modelId.trim() : "gpt-5.1";

    if (!question) return res.status(400).json({ error: "Missing question" });

    // ----- Web search (ALWAYS ON for Sources Used Q&A)
    const initialQuery = deriveQueryFromAsk({
      question,
      title: "",
      draftText,
    });

    let webSearchResults = [];
    let webReferences = [];
    let queryUsed = initialQuery;

    try {
      const search = await runWebSearch({
        query: initialQuery,
        maxResults: 6,
      });
      webSearchResults = Array.isArray(search?.results) ? search.results : [];
      queryUsed = search?.query || initialQuery;

      // Format web references with numbering [1], [2], etc.
      webReferences = webSearchResults.map((r, i) => ({
        id: i + 1,
        title: r?.title || "",
        url: r?.url || "",
        snippet: r?.content ? (r.content.length > 300 ? r.content.slice(0, 300) + "…" : r.content) : "",
      }));
    } catch (webErr) {
      console.error("Web search error in query-sources:", webErr);
      // Continue without web results - don't fail the request
      webSearchResults = [];
      webReferences = [];
    }

    // Format web sources for prompt
    const webSourcesText = webReferences.length > 0
      ? formatWebResultsForPrompt({ results: webSearchResults })
      : "";

    const system = `
You answer questions using BOTH the provided uploaded sources AND web sources.

Rules:
- Use BOTH uploaded sources and web sources to answer.
- Insert inline citations like [1], [2], etc. for web sources at the exact supporting sentence.
- Web source citations must match the numbered web sources provided (e.g., [1] refers to the first web source).
- If you cannot answer from the available sources, say so clearly.

Return ONLY valid JSON:
{
  "answer": "string (may include markdown with bracket citations [1], [2], etc. for web sources)",
  "confidence": number between 0 and 1,
  "confidenceReason": "string or null"
}
`.trim();

    const user = `
QUESTION:
${question}

DRAFT CONTEXT (may be empty):
${draftText || "(none)"}

UPLOADED SOURCES:
${sources.length ? JSON.stringify(sources, null, 2) : "(none)"}

WEB SOURCES:
${webSourcesText || "(none - no web sources found for this question)"}
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
      webReferences: webReferences.length > 0 ? webReferences : [],
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || "Query sources failed" });
  }
}
