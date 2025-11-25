// api/analyse-statements.js

import OpenAI from "openai";

// --- CORS helper --------------------------------------------------
function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";

  res.setHeader(
    "Access-Control-Allow-Origin",
    origin === "null" ? "*" : origin
  );
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
// ------------------------------------------------------------------

export default async function handler(req, res) {
  // Set CORS headers on every request
  setCorsHeaders(req, res);

  // Handle preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { text, scenario = "default", versionType = "complete" } = req.body || {};

  if (!text || !text.trim()) {
    return res.status(400).json({ error: "Missing text" });
  }

  try {
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const systemPrompt = `
You are an assistant that analyses investment-related written content.

Your task is to:
1. Break the text into discrete statements (short sentences or clauses that express one main idea).
2. For each statement, assess its reliability on a 0–1 scale.
3. Classify each statement into one of the following categories:
   - "Factual – clearly source-based"
   - "Factual – plausible but not clearly sourced"
   - "Interpretive / subjective"
   - "Speculative / forward-looking"
4. Return ONLY valid JSON that matches this TypeScript-like shape:

{
  "statements": [
    {
      "id": number,
      "text": string,
      "reliability": number,   // between 0 and 1
      "category": string,      // one of the four categories above
      "flags": string[]        // optional notes, can be empty
    }
  ]
}

Do not explain your reasoning outside the JSON. If you are unsure, make a best-effort judgement.
`;

    const userPrompt = `
Context:
- Scenario: ${scenario}
- Version type: ${versionType}

Text to analyse:
----------------
${text}
----------------

Return ONLY the JSON object, no extra text.
`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 800,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content?.trim() || "{}";

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const cleaned = raw.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(cleaned);
    }

    const statements = Array.isArray(parsed.statements)
      ? parsed.statements.map((st, index) => ({
          id: typeof st.id === "number" ? st.id : index + 1,
          text: typeof st.text === "string" ? st.text : "",
          reliability:
            typeof st.reliability === "number"
              ? Math.min(1, Math.max(0, st.reliability))
              : null,
          category: typeof st.category === "string" ? st.category : "",
          flags: Array.isArray(st.flags)
            ? st.flags.map((f) => String(f))
            : [],
        }))
      : [];

    return res.status(200).json({
      statements,
    });
  } catch (err) {
    console.error("Error in /api/analyse-statements:", err);
    return res.status(500).json({
      error: "Internal server error",
      detail: err.message || String(err),
    });
  }
}
