// /api/analyse-statements.js
//
// Analyses a draft into atomic statements, gives each a reliability band,
// and always uses web search to cross-check. Returns:
//   {
//     statements: [{ id, text, reliability, band, implication }],
//     summary,
//     references: [{ url, title }]
//   }

import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { text, model } = req.body || {};

    const safeText = typeof text === "string" ? text.trim() : "";

    if (!safeText) {
      return res.status(400).json({
        error: "Draft text is required for statement analysis.",
      });
    }

    const resolvedModel =
      typeof model === "string" && model.trim()
        ? model.trim()
        : "gpt-4.1-mini";

    const systemPrompt = [
      "You are a reliability analyst for investment write-ups.",
      "",
      "You must:",
      "1) Split the draft into short, atomic statements (1 key idea each).",
      "2) For each statement, assign a reliability score 0–1.",
      "3) Put the statement into a band:",
      "   - 'green'   : well grounded and consistent with mainstream evidence.",
      "   - 'yellow'  : plausible but partly speculative or incomplete.",
      "   - 'red'     : clearly speculative, contradicted, or misleading.",
      "4) Briefly explain WHY in an 'implication' string (e.g.",
      "   'speculative because...' or 'contradicted by newer data...').",
      "",
      "Use web search to validate numbers, dates and named facts.",
      "However, when good data is not available, you may keep 'yellow'",
      "with a cautious implication.",
    ].join("\n");

    const userPrompt = [
      "DRAFT TEXT TO ANALYSE:",
      safeText,
      "",
      "TASK:",
      "- Return a JSON object with this exact shape:",
      "",
      "{",
      '  "statements": [',
      '    { "id": 1, "text": "...", "reliability": 0.0-1.0, "band": "green|yellow|red", "implication": "..." },',
      "    ...",
      "  ],",
      '  "summary": "Very short summary of key reliability concerns.",',
      '  "notes": "Optional longer notes for the author."',
      "}",
      "",
      "- Make 8–25 statements depending on draft length.",
      "- Prefer shorter statements (1–2 lines each).",
      "- Use web search to validate where helpful.",
    ].join("\n");

    const response = await client.responses.create({
      model: resolvedModel,
      input: userPrompt,
      tools: [
        {
          type: "web_search",
          web_search: {
            max_results: 4,
          },
        },
      ],
      max_output_tokens: 900,
      response_format: { type: "json_object" },
    });

    const firstOutput = response.output?.[0];
    let jsonText = "";

    if (
      firstOutput &&
      firstOutput.content &&
      firstOutput.content[0]?.type === "output_text"
    ) {
      jsonText = firstOutput.content[0].text?.value || "";
    }

    if (!jsonText.trim()) {
      console.error(
        "analyse-statements: empty JSON output from Responses API",
        response
      );
      return res
        .status(500)
        .json({ error: "Model returned empty analysis." });
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (err) {
      console.error("Failed to parse JSON from analysis:", err, jsonText);
      return res.status(500).json({
        error: "Failed to parse analysis JSON.",
      });
    }

    const statements = Array.isArray(parsed.statements)
      ? parsed.statements
      : [];

    // Normalise / fill IDs + bands
    const normalised = statements.map((s, idx) => {
      const id =
        typeof s.id === "number" && Number.isFinite(s.id)
          ? s.id
          : idx + 1;
      const reliability =
        typeof s.reliability === "number" &&
        s.reliability >= 0 &&
        s.reliability <= 1
          ? s.reliability
          : 0.7;

      let band = "yellow";
      if (reliability >= 0.9) band = "green";
      else if (reliability < 0.75) band = "red";

      return {
        id,
        text: s.text || "",
        reliability,
        band: s.band || band,
        implication: s.implication || "",
      };
    });

    // Extract web references (URLs + titles) from annotations
    const referencesMap = new Map();
    const annotations =
      firstOutput?.content?.[0]?.text?.annotations || [];

    for (const ann of annotations) {
      const url = ann?.url;
      const title = ann?.title || ann?.site_name;
      if (url) {
        const key = url;
        if (!referencesMap.has(key)) {
          referencesMap.set(key, {
            url,
            title: title || url,
          });
        }
      }
    }

    const references = Array.from(referencesMap.values());

    return res.status(200).json({
      statements: normalised,
      summary: parsed.summary || "",
      notes: parsed.notes || "",
      references,
    });
  } catch (err) {
    console.error("Error in /api/analyse-statements:", err);
    return res.status(500).json({
      error: "Failed to analyse statements",
      details: err?.response?.data || err?.message || String(err),
    });
  }
}
