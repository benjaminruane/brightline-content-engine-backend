// api/analyse-statements.js
//
// Analyses a draft into atomic statements, assigns a reliability
// score (0–1) and category to each, and returns a summary object
// with safe defaults.
//
// Now always uses OpenAI web_search_preview as additional context
// for the analysis, but falls back cleanly if web retrieval fails.

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

// --- Inline helper: call web_search_preview via Responses API -----
async function runWebSearchPreview({ query, model = "gpt-4.1" }) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY in environment.");
  }

  const userQuery =
    typeof query === "string" && query.trim().length > 0
      ? query.trim()
      : "Given an investment commentary draft, identify reliability issues and potential weak spots using current public-domain information.";

  const apiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      tools: [{ type: "web_search_preview" }],
      tool_choice: { type: "web_search_preview" },
      input: userQuery,
    }),
  });

  const payload = await apiResponse.json();

  if (!apiResponse.ok) {
    const message =
      payload?.error?.message ||
      `OpenAI API error (status ${apiResponse.status})`;

    const err = new Error(message);
    err.status = apiResponse.status;
    err.data = payload;
    throw err;
  }

  // Extract assistant text
  let summary = null;

  if (Array.isArray(payload.output)) {
    const messageItem = payload.output.find((item) => item.type === "message");

    if (messageItem && Array.isArray(messageItem.content)) {
      const textBlock = messageItem.content.find(
        (part) => part.type === "output_text"
      );

      if (textBlock && typeof textBlock.text === "string") {
        summary = textBlock.text;
      }
    }
  }

  return {
    summary,
    raw: payload,
  };
}
// ------------------------------------------------------------------

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  // Preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // --- GET diagnostic mode for web_search_preview -----------------
  if (req.method === "GET" && req.query?.mode === "web-test") {
    try {
      const q = req.query.q;

      const { summary, raw } = await runWebSearchPreview({
        query:
          typeof q === "string" && q.trim().length > 0
            ? q.trim()
            : "Given an investment commentary draft, identify reliability and potential weak spots.",
      });

      return res.status(200).json({
        ok: true,
        mode: "web-test",
        summary,
        raw,
      });
    } catch (err) {
      return res.status(err.status || 500).json({
        ok: false,
        mode: "web-test",
        error: err.message || "Failed to call web_search_preview.",
        data: err.data || null,
      });
    }
  }
  // ----------------------------------------------------------------

  // Everything else requires POST as usual
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

    // 1) Get public-domain context for this draft text
    let webSummary = null;
    try {
      const webQueryParts = [
        "Using current public information, help assess the reliability and factual grounding of the following investment-related draft.",
        "",
        `Scenario: ${scenario}`,
        `Version type: ${versionType}`,
        "",
        "Draft excerpt (may be truncated):",
        text.slice(0, 2000), // avoid sending a huge blob
      ];

      const webQuery = webQueryParts.join("\n");

      const { summary } = await runWebSearchPreview({ query: webQuery });
      webSummary = summary;
    } catch (e) {
      // Fail silently and fall back to no-web analysis
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
- Use any public-domain context you are given to better judge factual reliability
  and to distinguish between well-supported and weakly-supported claims.
- If the public-domain context suggests that a statement conflicts with widely
  reported facts, reflect that in the reliability score and implication.
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

Text to analyse:
--------------------
${text}
--------------------

Return JSON following the schema exactly. Do not include any extra keys or text.
`.trim();

    // Build messages, injecting web context if available
    const messages = [
      { role: "system", content: systemPrompt },
      webSummary
        ? {
            role: "system",
            content: `Public domain context (for assessing reliability of the statements). Use this to inform reliability scores and implications, but still base your structure on the provided draft:\n\n${webSummary}`,
          }
        : null,
      { role: "user", content: userPrompt },
    ].filter(Boolean);

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 800,
      messages,
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
      webUsed: Boolean(webSummary),
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
