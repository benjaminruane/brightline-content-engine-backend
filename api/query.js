// api/query.js
//
// Ask AI endpoint — concise answers + confidence metadata.
// Uses chat.completions.create() and returns stable JSON shape.

import OpenAI from "openai";

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

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = req.body || {};

    const question = typeof body.question === "string" ? body.question.trim() : "";
    const draftText = typeof body.draftText === "string" ? body.draftText : "";
    const sourcesText = typeof body.sourcesText === "string" ? body.sourcesText : "";
    const askMode = typeof body.askMode === "string" ? body.askMode : "auto";

    if (!question) {
      return res.status(400).json({ error: "Missing question" });
    }

    const system = [
      "You are Content Engine's Ask AI assistant.",
      "",
      "Output rules:",
      "- Write a single cohesive answer. Do NOT split into 'from sources' vs 'from web'.",
      "- Be concise: prefer 5–10 sentences or bullets where helpful.",
      "- If the question cannot be answered from the provided draft/sources, say what is missing and ask 1–2 clarifying questions.",
      "- Never fabricate citations or page numbers. If you cite sources, do it generally (e.g., 'in the provided sources').",
      "",
      "Return JSON only with this schema:",
      "{",
      '  "answer": string,',
      '  "confidence": number,                // 0.0 to 1.0',
      '  "confidenceReason": string,          // short reason',
      '  "references": Array<{ "title": string, "url": string, "snippet": string }>',
      "}",
      "",
      "The references array may be empty if none are available.",
    ].join("\n");

    const modeHint =
      askMode === "draft_about"
        ? "Treat the question as being about the specific subject/entity described in the draft."
        : askMode === "general"
          ? "Treat the question as general research / macro / industry context, but still prefer the provided draft and sources if relevant."
          : "Auto: decide based on the question.";

    const user = [
      `Mode hint: ${modeHint}`,
      "",
      "QUESTION:",
      question,
      "",
      "DRAFT (may be empty):",
      draftText ? draftText : "(no draft provided)",
      "",
      "SOURCES (may be empty):",
      sourcesText ? sourcesText : "(no sources provided)",
    ].join("\n");

    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.2,
      max_tokens: 700,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    const raw = completion?.choices?.[0]?.message?.content || "";
    const parsed = safeJsonParse(raw);

    // If the model didn't return JSON, fall back gracefully.
    if (!parsed || typeof parsed.answer !== "string") {
      return res.status(200).json({
        answer: raw || "No answer returned.",
        meta: {
          confidence: null,
          confidenceReason: null,
          references: [],
        },
      });
    }

    const confidence =
      typeof parsed.confidence === "number"
        ? Math.max(0, Math.min(1, parsed.confidence))
        : null;

    const references = Array.isArray(parsed.references)
      ? parsed.references
          .filter((r) => r && typeof r === "object")
          .map((r) => ({
            title: typeof r.title === "string" ? r.title : "",
            url: typeof r.url === "string" ? r.url : "",
            snippet: typeof r.snippet === "string" ? r.snippet : "",
          }))
      : [];

    return res.status(200).json({
      answer: parsed.answer,
      meta: {
        confidence,
        confidenceReason:
          typeof parsed.confidenceReason === "string" ? parsed.confidenceReason : null,
        references,
      },
    });
  } catch (err) {
    return res.status(500).json({
      error: "Failed to process query",
      details: err?.message || String(err),
    });
  }
}
