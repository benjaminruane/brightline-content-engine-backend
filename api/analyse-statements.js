// /api/analyse-statements.js
//
// Analyses a draft into atomic statements, assigns a reliability
// score (0–1) and category to each, and returns a summary object
// with richer 'implication' and a simple compliance lens.

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

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { text, model, publicSearch } = req.body || {};

    const draftText =
      typeof text === "string" && text.trim().length > 0
        ? text.trim()
        : "";

    if (!draftText) {
      return res
        .status(400)
        .json({ error: "Draft text is required for statement analysis." });
    }

    const resolvedModel =
      typeof model === "string" && model.trim().length > 0
        ? model.trim()
        : "gpt-4.1-mini";

    const systemPrompt = [
      "You are analysing an investment-related draft for factual reliability and compliance.",
      "",
      "Your task:",
      "- Break the text into a list of atomic statements (each expressing a single, self-contained claim).",
      "- For each statement, assign:",
      "  - reliability: a number between 0 and 1 (0 = very unreliable, 1 = highly reliable),",
      "  - category: e.g. 'Factual, data-backed', 'Forward-looking', 'Marketing-style',",
      "  - implication: 1–3 sentences explaining WHY the reliability score was chosen, and what the risk or implication is.",
      "  - compliance: a short tag such as 'OK', 'Needs review – forward-looking', 'Needs review – cherry-picking', or similar.",
      "",
      "Compliance lens:",
      "- Flag forward-looking or predictive statements, especially if they are specific or quantitative.",
      "- Flag statements that appear to cherry-pick positive information while ignoring material risks.",
      "- Flag statements that make absolute claims ('will', 'guaranteed') rather than balanced language.",
      "",
      "Important formatting requirements:",
      "- Respond ONLY with valid JSON.",
      "- Use the following structure:",
      "",
      "{",
      '  "statements": [',
      "    {",
      '      "id": "1",',
      '      "text": "…",',
      '      "reliability": 0.85,',
      '      "category": "Factual, data-backed",',
      '      "implication": "One to three sentences explaining why this is the score and what it implies.",',
      '      "compliance": "OK"',
      "    }",
      "  ]",
      "}",
      "",
      "- reliability MUST be a number between 0 and 1, not a percentage.",
      "- implication MUST be 1–3 sentences and should use explicit reasoning (e.g. 'because', 'due to', 'given that').",
      "- If there are no meaningful statements, return an empty array.",
    ].join("\n");

    const userPrompt = [
      "TEXT TO ANALYSE:",
      "",
      draftText,
    ].join("\n");

    const completion = await client.chat.completions.create({
      model: resolvedModel,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const rawContent =
      completion.choices?.[0]?.message?.content?.trim() || "";

    if (!rawContent) {
      console.error(
        "analyse-statements: model returned empty content:",
        completion
      );
      return res
        .status(500)
        .json({ error: "Model returned empty analysis content." });
    }

    let parsed;
    try {
      parsed = JSON.parse(rawContent);
    } catch (err) {
      console.error(
        "analyse-statements: failed to parse JSON from model:",
        rawContent,
        err
      );
      return res.status(500).json({
        error: "Model returned invalid JSON for statement analysis.",
        details: err.message || String(err),
      });
    }

    const statementsArray = Array.isArray(parsed.statements)
      ? parsed.statements
      : [];

    const statements = statementsArray.map((s, index) => {
      const id = String(s.id || index + 1);
      const text =
        typeof s.text === "string" && s.text.trim().length > 0
          ? s.text.trim()
          : "";
      let reliability = typeof s.reliability === "number" ? s.reliability : 0.5;
      if (reliability < 0) reliability = 0;
      if (reliability > 1) reliability = 1;
      const category =
        typeof s.category === "string" && s.category.trim().length > 0
          ? s.category.trim()
          : "Uncategorised";
      const implication =
        typeof s.implication === "string" && s.implication.trim().length > 0
          ? s.implication.trim()
          : "No detailed implication was provided.";
      const compliance =
        typeof s.compliance === "string" && s.compliance.trim().length > 0
          ? s.compliance.trim()
          : "OK";

      return {
        id,
        text,
        reliability,
        category,
        implication,
        compliance,
      };
    });

    const statementCount = statements.length;
    const averageReliability =
      statementCount === 0
        ? null
        : statements.reduce((sum, s) => sum + (s.reliability || 0), 0) /
          statementCount;

    return res.status(200).json({
      statements,
      summary: {
        statementCount,
        averageReliability,
      },
    });
  } catch (err) {
    console.error("Error in /api/analyse-statements:", err);
    return res.status(500).json({
      error: "Failed to analyse statements",
      details: err?.response?.data || err?.message || String(err),
    });
  }
}
