// api/analyse-statements.js
//
// Extracts atomic statements from a draft, assigns
// category, reliability, explanation, and implication.
// Returns rich analysis suitable for UI rendering.

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
You are an expert financial analyst and fact checker.

TASK:
1. Break the draft into ATOMIC statements (each one claim).
2. For EACH statement:
   - category: Fact | Estimate | Projection | Opinion | Assumption
   - reliability: number between 0 and 1
   - explanation: why this reliability score is appropriate
   - implication: what this means for a reader / investor

Be conservative. If uncertain, lower reliability.
Return STRICT JSON only.
`;

    const userPrompt = `
DRAFT:
"""
${draftText}
"""

Respond in JSON with this exact structure:

{
  "statements": [
    {
      "id": "s1",
      "text": "...",
      "category": "Fact",
      "reliability": 0.85,
      "explanation": "...",
      "implication": "..."
    }
  ]
}
`;

    const completion = await client.chat.completions.create({
      model: modelId || "gpt-4.1",
      temperature: 0.2,
      max_tokens: 1200,
      messages: [
        { role: "system", content: systemPrompt.trim() },
        { role: "user", content: userPrompt.trim() },
      ],
    });

    const raw = completion?.choices?.[0]?.message?.content || "";
    let parsed;

    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.error("JSON parse failed:", raw);
      throw new Error("Model returned invalid JSON");
    }

    const statements = Array.isArray(parsed.statements)
      ? parsed.statements.map((s, i) => ({
          id: s.id || `s${i + 1}`,
          text: String(s.text || "").trim(),
          category: s.category || "Unknown",
          reliability:
            typeof s.reliability === "number"
              ? Math.max(0, Math.min(1, s.reliability))
              : null,
          explanation: s.explanation || "",
          implication: s.implication || "",
        }))
      : [];

    const validReliabilities = statements
      .map((s) => s.reliability)
      .filter((r) => typeof r === "number");

    const averageReliability =
      validReliabilities.length > 0
        ? validReliabilities.reduce((a, b) => a + b, 0) / validReliabilities.length
        : null;

    const categoryBreakdown = {};
    for (const s of statements) {
      categoryBreakdown[s.category] = (categoryBreakdown[s.category] || 0) + 1;
    }

    return res.status(200).json({
      statements,
      summary: {
        totalStatements: statements.length,
        averageReliability,
        categoryBreakdown,
      },
    });
  } catch (err) {
    console.error("Statement analysis error:", err);
    return res.status(500).json({
      error: "Failed to analyse statements",
      details: err.message,
    });
  }
}
