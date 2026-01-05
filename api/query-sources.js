// api/query-sources.js
//
// Sources Q&A endpoint.
// Uses provenance sources only (uploaded sources + webReferences from Generate/Rewrite).
// Does NOT perform fresh web search.

import OpenAI from "openai";
import { formatWebResultsForPrompt } from "../lib/web.js";

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
    // Accept provenance webReferences from request (from Generate/Rewrite for this version)
    const webReferences = Array.isArray(body.webReferences) ? body.webReferences : [];
    const modelId =
      typeof body.modelId === "string" && body.modelId.trim() ? body.modelId.trim() : "gpt-5.1";

    if (!question) return res.status(400).json({ error: "Missing question" });

    // Format web sources for prompt (using provenance webReferences)
    // Convert webReferences array to format expected by formatWebResultsForPrompt
    const webSearchResults = webReferences.map((ref) => ({
      title: ref?.title || "",
      url: ref?.url || "",
      content: ref?.snippet || ref?.content || "",
    }));

    const webSourcesText = webReferences.length > 0
      ? formatWebResultsForPrompt({ results: webSearchResults })
      : "";

    const system = `
You answer questions about a draft using the sources that were used to produce it.

Available sources:
- Uploaded sources: memos, emails, documents, or URLs provided by the user
- Web sources: web pages that were used when generating this draft version (if any)

Rules:
- Answer using ONLY the sources that were used for this draft version.
- For web sources, insert inline citations like [1], [2] at the exact supporting sentence.
- Citations must match the numbered web sources (e.g., [1] refers to the first web source).
- If no web sources were used for this draft, the answer should rely solely on uploaded sources.
- Keep responses concise and directly answer the question.
- Do NOT mention: "instructions", "system prompt", "WEB SOURCES section", "provided list", or any implementation details.
- Speak in product terms: "sources used for this draft version", "uploaded memo", "web sources (if any)".

Return ONLY valid JSON:
{
  "answer": "string (may include markdown with bracket citations [1], [2], etc. for web sources)",
  "confidence": number between 0 and 1,
  "confidenceReason": "string or null"
}
`.trim();

    // Build user prompt with context about web sources
    const hasWebSources = webReferences.length > 0;
    const webSourcesSection = hasWebSources
      ? webSourcesText
      : "No web sources were used for this draft version. The draft relied solely on the uploaded sources, or no web sources were relevant enough to cite.";

    const user = `
QUESTION:
${question}

DRAFT CONTEXT:
${draftText || "(none)"}

UPLOADED SOURCES (used for this draft):
${sources.length ? JSON.stringify(sources, null, 2) : "(none)"}

WEB SOURCES (used for this draft, if any):
${webSourcesSection}
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
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || "Query sources failed" });
  }
}
