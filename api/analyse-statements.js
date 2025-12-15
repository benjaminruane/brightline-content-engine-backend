// api/analyse-statements.js
//
// Extracts atomic statements from a draft and assigns
// category + reliability score. Returns a rich payload
// the frontend can render.
//
// IMPORTANT: Uses max_completion_tokens (not max_tokens) for newer models.

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

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function safeJsonParse(text) {
  if (!text || typeof text !== "string") return null;

  // Try direct JSON
  try {
    return JSON.parse(text);
  } catch {
    // Try to extract first {...} block
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const slice = text.slice(start, end + 1);
      try {
        return JSON.parse(slice);
      } catch {
        return null;
      }
    }
    return null;
  }
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { draftText, modelId } = req.body || {};
    if (!draftText || typeof draftText !== "string") {
      return res.status(400).json({ error: "Missing or invalid draftText" });
    }

    const systemPrompt = `
You are an expert analyst and fact checker.

TASK:
1) Break the draft into ATOMIC statements (each one claim).
2) For each statement:
   - category: Fact | Estimate | Projection | Opinion | Assumption
   - score: reliability score from 0 to 1

Be conservative. If uncertain, lower the score.
Return STRICT JSON ONLY, matching the provided schema.
`.trim();

    const userPrompt = `
DRAFT:
"""
${draftText}
"""

Return JSON exactly:

{
  "statements": [
    { "id": "s1", "text": "...", "category": "Fact", "score": 0.85 }
  ],
  "summary": { "note": "optional short note" }
}
`.trim();

    const completion = await client.chat.completions.create({
      model: modelId || "gpt-4.1",
      temperature: 0.2,
      // ✅ FIX: use max_completion_tokens (not max_tokens)
      max_completion_tokens: 1200,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const raw = completion?.choices?.[0]?.message?.content || "";
    const parsed = safeJsonParse(raw);

    if (!parsed || typeof parsed !== "object") {
      return res.status(200).json({
        ok: false,
        statements: [],
        summary: { note: "Model returned invalid JSON for statement analysis." },
      });
    }

    const statements = Array.isArray(parsed.statements)
      ? parsed.statements.map((s, i) => ({
          id: typeof s?.id === "string" && s.id.trim() ? s.id.trim() : `s${i + 1}`,
          text: typeof s?.text === "string" ? s.text.trim() : "",
          category: typeof s?.category === "string" && s.category.trim() ? s.category.trim() : "Unknown",
          score:
            typeof s?.score === "number"
              ? Math.max(0, Math.min(1, s.score))
              : null,
        }))
      : [];

    const summary =
      parsed.summary && typeof parsed.summary === "object"
        ? parsed.summary
        : {};

    return res.status(200).json({
      ok: true,
      statements,
      summary: {
        note: typeof summary.note === "string" ? summary.note : null,
      },
    });
  } catch (err) {
    console.error("Statement analysis error:", err);
    return res.status(500).json({
      error: "Failed to analyse statements",
      details: err?.message || String(err),
    });
  }
}
