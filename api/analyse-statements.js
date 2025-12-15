// api/analyse-statements.js
//
// Extracts atomic statements from a draft and assigns
// category + reliability score (0..1), plus rich fields:
// - explanation (why this score)
// - implication (what it means / what to do with it)
//
// IMPORTANT: Uses max_completion_tokens (not max_tokens).

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

  try {
    return JSON.parse(text);
  } catch {
    // Try to extract the first {...} block
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

function clamp01(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return Math.max(0, Math.min(1, n));
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
You are an expert analyst and fact-checker.

GOAL:
Turn the draft into atomic statements and assess reliability conservatively.

OUTPUT RULES:
- Return STRICT JSON ONLY (no markdown, no backticks).
- Use the schema exactly.
- Each statement must be ATOMIC: one claim per row.
- category must be one of: Fact | Estimate | Projection | Opinion | Assumption
- score must be 0..1 (confidence/reliability of the claim as written)
- explanation must be a short, specific reason for the score (1 sentence)
- implication must be a short, actionable interpretation (1 sentence), e.g.
  "Treat as assumption; confirm with source" or "Likely accurate; safe to include"

The draft may include plausible but unverifiable claims; penalise those.
If a claim depends on missing context or external data, reduce score.
`.trim();

    const userPrompt = `
DRAFT:
"""
${draftText}
"""

Return JSON exactly in this shape:

{
  "statements": [
    {
      "id": "s1",
      "text": "…",
      "category": "Fact",
      "score": 0.85,
      "explanation": "…",
      "implication": "…"
    }
  ],
  "summary": {
    "note": "1–2 sentences. Be specific: describe which claim-types scored higher/lower and why, based on your extracted statements."
  }
}
`.trim();

    const completion = await client.chat.completions.create({
      model: modelId || "gpt-4.1",
      temperature: 0.2,
      // ✅ FIX for newer models
      max_completion_tokens: 1600,
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
      ? parsed.statements.map((s, i) => {
          const id =
            typeof s?.id === "string" && s.id.trim() ? s.id.trim() : `s${i + 1}`;
          const text = typeof s?.text === "string" ? s.text.trim() : "";
          const category =
            typeof s?.category === "string" && s.category.trim()
              ? s.category.trim()
              : "Unknown";

          const score = clamp01(s?.score);

          const explanation =
            typeof s?.explanation === "string" ? s.explanation.trim() : "";
          const implication =
            typeof s?.implication === "string" ? s.implication.trim() : "";

          return { id, text, category, score, explanation, implication };
        })
      : [];

    const summary =
      parsed.summary && typeof parsed.summary === "object" ? parsed.summary : {};

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
