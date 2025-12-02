// api/analyse-statements.js
//
// Analyses a draft into atomic statements, assigns a reliability
// score (0–1) and category to each, and returns a summary object
// with safe defaults. Now enhanced with OpenAI web_search_preview
// as additional public-domain context (always on).

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

// Helper to always return a well-formed empty result
function emptyResult(extra = {}) {
  return {
    statements: [],
    summary: {
      totalStatements: 0,
      lowReliabilityCount: 0,
      averageReliability: null,
      reliabilityBand: "unknown",
      ...extra,
    },
  };
}

function buildSummary(statements) {
  if (!Array.isArray(statements) || statements.length === 0) {
    return emptyResult().summary;
  }

  let total = statements.length;
  let sum = 0;
  let counted = 0;
  let lowCount = 0;

  statements.forEach((st) => {
    if (typeof st.reliability === "number") {
      sum += st.reliability;
      counted += 1;
      // Flag as low reliability if below 0.75 (75%)
      if (st.reliability < 0.75) {
        lowCount += 1;
      }
    }
  });

  const average = counted > 0 ? sum / counted : null;

  let band = "unknown";
  if (average != null) {
    // Map to UI colours:
    // - >= 0.90 (90%+)  => green / "high"
    // - 0.75–0.89       => yellow / "medium"
    // - < 0.75          => red / "low"
    if (average >= 0.9) band = "high";
    else if (average >= 0.75) band = "medium";
    else band = "low";
  }

  return {
    totalStatements: total,
    lowReliabilityCount: lowCount,
    averageReliability: average,
    reliabilityBand: band,
  };
}

// --- Web search helper using Responses API ------------------------
async function getWebSummaryForText(text) {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  const truncated = (text || "").slice(0, 4000);

  const webQuery = [
    "Using current public information, provide concise factual and contextual information",
    "that could help assess the reliability, plausibility, and potential weak spots of",
    "the following investment-related commentary. Focus on:",
    "- whether key factual claims are broadly consistent with public sources,",
    "- where there may be uncertainty, speculation, or outdated assumptions,",
    "- any major external factors that could materially affect the statements.",
    "",
    "Commentary (may be truncated):",
    "--------------------",
    truncated,
    "--------------------",
  ].join("\n");

  const resp = await client.responses.create({
    model: "gpt-4.1",
    tools: [{ type: "web_search_preview" }],
    tool_choice: { type: "web_search_preview" },
    input: webQuery,
  });

  let summary = null;

  if (Array.isArray(resp.output)) {
    const messageItem = resp.output.find((item) => item.type === "message");
    if (messageItem && Array.isArray(messageItem.content)) {
      const textBlock = messageItem.content.find(
        (part) => part.type === "output_text"
      );
      if (textBlock && typeof textBlock.text === "string") {
        summary = textBlock.text;
      }
    }
  }

  return summary;
}
// ------------------------------------------------------------------

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  // Preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Simple ping for browser testing
  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      message: "analyse-statements endpoint is reachable.",
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { text, scenario = "default", versionType = "complete" } =
      req.body || {};

    if (!text || !text.trim()) {
      return res
        .status(400)
        .json({ error: "Missing text", ...emptyResult() });
    }

    // NEW: try to get public-domain context. If it fails, we quietly ignore.
    let webSummary = null;
    try {
      webSummary = await getWebSummaryForText(text);
    } catch (e) {
      console.error("web_search_preview in analyse-statements failed:", e);
      webSummary = null;
    }

    const systemPrompt = `
You are an assistant that analyses investment-related commentary.

Your task:
- Break the text into atomic statements (short, self-contained claims).
- For each statement, assign:
  - "reliability": a number between 0 and 1 (1 = fully reliable based on typical sources).
  - "category": one of:
      - "source-based factual"
      - "plausible factual"
      - "interpretive / analytical"
      - "speculative / forward-looking".
  - "implication": a short explanation of what this reliability level means for how the text should be treated (e.g. well supported, should be softened, needs verification, may be misleading).

Rules:
- Focus on substantive claims, not trivial fragments.
- If a statement mixes fact and speculation, classify as "speculative / forward-looking".
- Use any public-domain context provided to you to better judge plausibility and potential weak spots,
  but do NOT quote URLs or external sources in the output.
- Respond ONLY with valid JSON, with no commentary.

JSON schema:

{
  "statements": [
    {
      "id": string,
      "text": string,
      "reliability": number between 0 and 1,
      "category": string,
      "implication": string
    }
  ]
}
`.trim();

    const userPrompt = `
Context:
- Scenario: ${scenario}
- Version type: ${versionType}

${
  webSummary
    ? `Public-domain context that may help you assess reliability:\n\n${webSummary}\n\n`
    : ""
}Text to analyse:
--------------------
${text}
--------------------

Return JSON following the schema exactly. Do not include any extra keys or text.
`.trim();

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      max_completion_tokens: 800,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    let raw =
      completion.choices?.[0]?.message?.content?.trim() || '{"statements":[]}';

    // Try to parse directly; if it fails, strip ```json fences and retry.
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const cleaned = raw.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(cleaned);
    }

    const statements = Array.isArray(parsed.statements)
      ? parsed.statements
      : [];

    const summary = buildSummary(statements);

    return res.status(200).json({
      statements,
      summary,
    });
  } catch (err) {
    console.error("Error in /api/analyse-statements:", err);
    // Return safe, well-formed empty result with error info
    return res.status(200).json(
      emptyResult({
        error: err.message || String(err),
      })
    );
  }
}
