// api/analyse-statements.js
//
// Enhanced Statement Analysis:
// - Splits draft into atomic statements
// - Assigns reliability, category, implication
// - NEW: Assigns recommendedChange (type, rationale, suggestedText)
//   using Rewrite Style C: Aggressive clarity + precision
//
// No usage of tools, web search, or response_format.
// Uses chat.completions.create() with safe fallbacks.

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

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Safe defaults if analysis fails
const EMPTY_ANALYSIS = {
  ok: true,
  summary: {
    totalStatements: 0,
    byCategory: {
      factual: 0,
      subjective: 0,
      speculative: 0,
      uncertain: 0,
    },
  },
  statements: [],
};

// Style-guide + analysis guidance
const ANALYSIS_STYLE_GUIDE = `
You are an analytical assistant embedded in the Content Engine.

Your task:
1. Split the input draft into short, atomic statements.
2. For each statement, assign:
   - reliability (0–1)
   - category: "factual", "subjective", "speculative", or "uncertain"
   - implication: 2–3 sentences explaining:
       • why you assigned that reliability/category
       • how the statement should be positioned in investor materials
3. NEW: Provide recommendedChange for each statement.

=======================
REWRITE STYLE C (AGGRESSIVE CLARITY + PRECISION)
=======================
When proposing a suggested rewrite (recommendedChange.suggestedText):

- Preserve the factual meaning.
- Make the sentence clearer, tighter, more precise.
- Remove vague language, filler, and unnecessary qualifiers.
- Use clean, direct business English.
- Do NOT invent new facts or quantify anything not already present.
- If the existing wording is already optimal, return the same text.

=======================
RECOMMENDED CHANGE RULES
=======================
For each statement, assign:

recommendedChange.type:
- "none"        → if the statement is already clear, precise, and compliant.
- "clarify"     → if the meaning is unclear or overly wordy.
- "tighten"     → if the sentence can be made more concise while keeping full meaning.
- "soften"      → if the tone expresses undue certainty without evidence.
- "add_caveat"  → if the statement is factual but needs a risk/context qualifier.
- "remove"      → if the statement is too vague or inappropriate for investor use.

recommendedChange.rationale:
- 1–2 sentences explaining why this type was chosen.

recommendedChange.suggestedText:
- A rewritten version of ONLY THAT STATEMENT.
- Do NOT rewrite surrounding context.
- Do NOT add numbers or facts not in the original.

=======================
JSON FORMAT (STRICT)
=======================
Return ONLY a valid JSON object:

{
  "summary": {
    "totalStatements": number,
    "byCategory": {
      "factual": number,
      "subjective": number,
      "speculative": number,
      "uncertain": number
    }
  },
  "statements": [
    {
      "id": "s1",
      "text": "...",
      "reliability": 0.82,
      "category": "factual",
      "implication": "...",
      "recommendedChange": {
        "type": "tighten",
        "rationale": "...",
        "suggestedText": "..."
      }
    }
  ]
}

DO NOT wrap in markdown. DO NOT add commentary.
`;

// Build system prompt
function buildSystemPrompt() {
  return [
    ANALYSIS_STYLE_GUIDE,
    "Respond ONLY with JSON.",
  ].join("\n\n");
}

// Build user prompt
function buildUserPrompt({ draftText, maxStatements }) {
  const safeDraft = draftText || "";
  const limit =
    typeof maxStatements === "number" && maxStatements > 0
      ? maxStatements
      : 40;

  return `
You will analyse the following investor-facing draft text.

1. Extract up to ${limit} atomic statements.
2. For each, generate:
   - reliability (0–1)
   - category (factual / subjective / speculative / uncertain)
   - implication (2–3 sentences)
   - recommendedChange (see rules above)

INPUT DRAFT:
${safeDraft.trim()}

Remember:
- JSON only.
- No markdown.
- No preamble.
`;
}

// --- JSON Parsing Helper ------------------------------------------
function safeParseAnalysis(rawContent) {
  if (!rawContent || typeof rawContent !== "string") {
    return EMPTY_ANALYSIS;
  }

  let json = rawContent.trim();

  // Extract first {...} block if needed
  const match = json.match(/\{[\s\S]*\}/);
  if (match) json = match[0];

  try {
    const parsed = JSON.parse(json);

    const summary = parsed.summary || {};
    const byCategory = summary.byCategory || {};
    const statements = Array.isArray(parsed.statements)
      ? parsed.statements
      : [];

    return {
      ok: true,
      summary: {
        totalStatements: summary.totalStatements ?? statements.length,
        byCategory: {
          factual: byCategory.factual || 0,
          subjective: byCategory.subjective || 0,
          speculative: byCategory.speculative || 0,
          uncertain: byCategory.uncertain || 0,
        },
      },
      statements,
    };
  } catch (err) {
    console.error("JSON parse failed:", err);
    return EMPTY_ANALYSIS;
  }
}

// --- Handler -------------------------------------------------------
export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res
      .status(500)
      .json({ error: "Missing OPENAI_API_KEY environment variable" });
  }

  try {
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : req.body || {};

    const { draftText, modelId, maxStatements } = body;

    if (!draftText || typeof draftText !== "string") {
      return res.status(200).json(EMPTY_ANALYSIS);
    }

    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt({ draftText, maxStatements });

    const completion = await client.chat.completions.create({
      model: modelId || "gpt-4o-mini",
      temperature: 0,
      max_completion_tokens: 1800,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content || "";
    const analysis = safeParseAnalysis(raw);

    return res.status(200).json({
      ...analysis,
      model: completion.model || null,
      usage: completion.usage || null,
    });
  } catch (err) {
    console.error("Statement Analysis error:", err);

    return res.status(200).json({
      ...EMPTY_ANALYSIS,
      ok: false,
      error: "Failed to analyse statements",
    });
  }
}
