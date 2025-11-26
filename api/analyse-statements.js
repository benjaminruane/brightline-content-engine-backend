// api/analyse-statements.js
//
// Analyses a draft into atomic statements, assigns a reliability
// score (0–1) and category to each, and returns a summary object
// with safe defaults.

import OpenAI from "openai";
import { webSearch } from "./lib/webSearch";

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

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  // Preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      text,
      scenario = "default",
      versionType = "complete",
      sources = [],
      company,
      sector,
      geography,
      dealType,
    } = req.body || {};

    if (!text || !text.trim()) {
      return res
        .status(400)
        .json({ error: "Missing text", ...emptyResult() });
    }

    // --- 1. Fetch public web evidence (safe, high-level) -----------
    const webResults = await webSearch({
      company,
      sector,
      geography,
      dealType,
      maxResults: 6,
    });

    // Prepare evidence summaries (internal + web)
    const internalEvidenceSummary = Array.isArray(sources) && sources.length
      ? sources
          .slice(0, 6)
          .map((s, idx) => {
            const label =
              s.name ||
              s.url ||
              s.kind ||
              `Source ${idx + 1}`;
            const textVal = (s.text || "").toString();
            const snippet = textVal.slice(0, 800);
            return `Internal ${idx + 1} – ${label}:\n${snippet}`;
          })
          .join("\n\n")
      : "No internal sources provided.";

    const webEvidenceSummary = webResults.length
      ? webResults
          .slice(0, 6)
          .map((w, idx) => {
            const label = w.title || w.domain || w.url || `Web ${idx + 1}`;
            const snippet = (w.snippet || "").slice(0, 800);
            const domain = w.domain || "unknown";
            return `Web ${idx + 1} – ${label} (domain: ${domain}):\n${snippet}`;
          })
          .join("\n\n")
      : "No public web search results available.";

    const systemPrompt = `
You are an assistant that analyses investment-related commentary.

Your task:
- Break the text into atomic statements (short, self-contained claims).
- For each statement, assign:
  - "reliability": a number between 0 and 1 (1 = fully reliable based on available evidence).
  - "category": one of:
      - "source-based factual"
      - "plausible factual"
      - "interpretive / analytical"
      - "speculative / forward-looking".
  - "implication": a short explanation of what this reliability level means for how the text should be treated
    (e.g. well supported, should be softened, needs verification, may be misleading).

Evidence you may use:
1. **Internal sources** (private; do not assume they are public).
2. **Public web sources** (search snippets with titles, domains, and short excerpts).

Rules:
- Prefer internal sources when internal and public evidence conflict.
- NEVER claim that private internal information is public unless it clearly appears in public web evidence.
- If a statement mixes fact and speculation, classify as "speculative / forward-looking".
- If evidence is insufficient, assign lower reliability and explain.
- Focus on substantive claims, not trivial fragments.
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

Evidence (internal sources):
${internalEvidenceSummary}

Evidence (public web sources):
${webEvidenceSummary}

Text to analyse:
--------------------
${text}
--------------------

Return JSON following the schema exactly. Do not include any extra keys or text.
`.trim();

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 800,
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
      webSources: webResults,
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
