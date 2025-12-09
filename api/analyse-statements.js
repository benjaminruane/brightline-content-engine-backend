// /api/analyse-statements.js
//
// Analyses a draft into atomic statements, assigns a reliability
// score (0–1) and category to each, and returns a summary object
// with safe defaults.

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

// Small helper to cap how much text we send to the model
function truncateText(text, maxChars = 8000) {
  if (!text || typeof text !== "string") return "";
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars);
}

// --- Web search helper ---------------------------------------------
// Uses the Responses API + web_search tool to get a short public summary
// that can enrich statement analysis, but does NOT change your draft text.
// --------------------------------------------------------------------
async function getWebSummaryForText(text) {
  const query = text.slice(0, 300);

  const body = {
    model: "gpt-4.1-mini",
    tools: [
      {
        type: "web_search", // 🔄 modern tool name
      },
    ],
    tool_choice: {
      type: "web_search",
    },
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text:
              "Use web search to provide a short, factual summary of this content " +
              "and any clearly related, up-to-date information that would help a " +
              "compliance- or risk-focused reviewer:\n\n" +
              query,
          },
        ],
      },
    ],
    max_output_tokens: 256,
    temperature: 0.1,
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.error("web_search in analyse-statements failed:", errorText);
    return null;
  }

  const payload = await response.json();

  // Try helper field if present
  if (typeof payload.output_text === "string") {
    return payload.output_text.trim();
  }

  // Fallback: walk structured output
  if (Array.isArray(payload.output)) {
    for (const item of payload.output) {
      if (item.type === "message" && Array.isArray(item.content)) {
        for (const block of item.content) {
          if (block.type === "output_text" && block.text?.length) {
            return block.text.trim();
          }
        }
      }
    }
  }

  return null;
}

// --- Core scoring --------------------------------------------------
// Very simple heuristics as a baseline. Backend can be made smarter later.
// --------------------------------------------------------------------
function scoreStatement(text) {
  if (!text || typeof text !== "string") {
    return {
      reliability: 0.6,
      category: "unclear",
      reasons: ["No text provided."],
      complianceFlags: [],
    };
  }

  const len = text.length;
  const hasPercent = /%/.test(text);
  const hasForecastWords = /\b(expect|forecast|project|anticipate|target)\b/i.test(
    text
  );
  const hasHypeWords = /\b(best-in-class|world-class|unique|game-changing)\b/i.test(
    text
  );

  let reliability = 0.85;
  const reasons = [];
  const complianceFlags = [];

  if (len < 40) {
    reliability -= 0.1;
    reasons.push("Very short statement; limited context.");
  } else if (len > 500) {
    reliability -= 0.05;
    reasons.push("Very long statement; risk of multiple claims mixed together.");
  }

  if (hasPercent) {
    reasons.push("Contains specific numerical or percentage claims.");
  }

  if (hasForecastWords) {
    reliability -= 0.15;
    reasons.push("Includes forward-looking or predictive language.");
    complianceFlags.push("forward_looking");
  }

  if (hasHypeWords) {
    reliability -= 0.1;
    reasons.push("Marketing-style or promotional language detected.");
    complianceFlags.push("promotional_tone");
  }

  reliability = Math.max(0.3, Math.min(0.98, reliability));

  let category = "neutral";
  if (reliability >= 0.9) category = "strongly_supported";
  else if (reliability >= 0.75) category = "supported";
  else if (reliability >= 0.6) category = "uncertain";
  else category = "weak_or_speculative";

  return {
    reliability,
    category,
    reasons,
    complianceFlags,
  };
}

// -------------------------------------------------------------------
// Split text into "statements" – simple heuristic based on punctuation
// -------------------------------------------------------------------
function splitIntoStatements(text) {
  if (!text || typeof text !== "string") return [];

  const chunks = text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  return chunks.map((s, idx) => ({
    id: `stmt_${idx + 1}`,
    text: s,
  }));
}

// -------------------------------------------------------------------
// Handler
// -------------------------------------------------------------------
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

    const safeText = truncateText(
      typeof text === "string" ? text : "",
      16_000
    );

    if (!safeText.trim()) {
      return res.status(400).json({
        error: "No draft text provided for analysis.",
      });
    }

    const statements = splitIntoStatements(safeText);

    if (statements.length === 0) {
      return res.status(200).json({
        statements: [],
        summary: {
          averageReliability: null,
          categories: {},
          complianceFlags: [],
          notes: ["No clearly separable statements were detected."],
          modelUsed: model || "gpt-4.1-mini",
          usedWebSearch: false,
        },
      });
    }

    // Baseline scores
    const scoredStatements = statements.map((stmt) => {
      const base = scoreStatement(stmt.text);
      return {
        id: stmt.id,
        text: stmt.text,
        reliability: base.reliability,
        category: base.category,
        reasons: base.reasons,
        complianceFlags: base.complianceFlags,
        webContext: null,
      };
    });

    let webSummary = null;
    let usedWebSearch = false;

    if (publicSearch) {
      try {
        webSummary = await getWebSummaryForText(safeText);
        usedWebSearch = !!webSummary;

        if (webSummary) {
          scoredStatements[0].webContext = webSummary;
        }
      } catch (err) {
        console.error("web_search in analyse-statements errored:", err);
      }
    }

    // Aggregate summary
    const categoriesCount = {};
    let reliabilitySum = 0;

    for (const stmt of scoredStatements) {
      reliabilitySum += stmt.reliability;
      categoriesCount[stmt.category] =
        (categoriesCount[stmt.category] || 0) + 1;
    }

    const avgReliability = reliabilitySum / scoredStatements.length;

    const summary = {
      averageReliability: avgReliability,
      categories: categoriesCount,
      complianceFlags: Array.from(
        new Set(scoredStatements.flatMap((s) => s.complianceFlags))
      ),
      notes: [
        "Heuristic reliability scores – use as a guide, not as absolute truth.",
        publicSearch && usedWebSearch
          ? "Web search was used to provide additional context for at least one statement."
          : "Web search was not used or did not return useful context.",
      ],
      modelUsed: model || "gpt-4.1-mini",
      usedWebSearch,
    };

    return res.status(200).json({
      statements: scoredStatements,
      summary,
    });
  } catch (err) {
    console.error("Error in /api/analyse-statements:", err);
    return res.status(500).json({
      error: "Failed to analyse statements",
      details: err?.response?.data || err?.message || String(err),
    });
  }
}
