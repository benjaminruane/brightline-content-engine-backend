// api/query.js
//
// AI Query endpoint
// - Always uses OpenAI web_search_preview for public-domain context
// - GET + mode=web-test: raw web_search_preview diagnostic
// - GET + mode=entity-test: show heuristic entity detection
// - GET + mode=demo: run full query pipeline via query params (browser-only testing)
// - POST: main query handler used by the app
//
// Behaviour:
// - Heuristically extracts a primary entity (e.g. "Pinterest, Inc. (the \"Company\")") from context
// - If an entity is found, explicitly injects that entity name into the question sent to the model
//   e.g. "For Pinterest, Inc., when was the company founded..."
// - Works for generic questions (e.g. "Explain the ARR metric") when no entity is found
// - Returns a heuristic confidence score and explanation

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

// --- Inline helper: call web_search_preview via Responses API -----
async function runWebSearchPreview({ query, model = "gpt-4.1" }) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY in environment.");
  }

  const userQuery =
    typeof query === "string" && query.trim().length > 0
      ? query.trim()
      : "Using current public information, answer the user's question about investments, private markets, or related topics.";

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

// --- Heuristic: extract a likely primary entity from raw context ---
function extractHeuristicPrimaryEntity(context) {
  if (!context || typeof context !== "string") return null;
  const text = context;

  // Pattern 1: "Pinterest, Inc. (the "Company")" or "(the "Fund")" / "(the "Asset")"
  let m =
    text.match(
      /([A-Z][A-Za-z0-9&.,'()\- ]{2,100})\s*\(the ['"]Company['"]\)/,
    ) ||
    text.match(
      /([A-Z][A-Za-z0-9&.,'()\- ]{2,100})\s*\(the ['"]Fund['"]\)/,
    ) ||
    text.match(
      /([A-Z][A-Za-z0-9&.,'()\- ]{2,100})\s*\(the ['"]Asset['"]\)/,
    );

  if (m && m[1]) {
    return {
      name: m[1].trim(),
      source: "alias_pattern",
    };
  }

  // Pattern 2: Legal suffixes (Inc., Ltd, Limited, plc, AG, SA)
  m = text.match(
    /([A-Z][A-Za-z0-9&,'\- ]{1,80}\s(?:Inc\.|Incorporated|Ltd\.|Limited|plc|AG|S\.?A\.?))/,
  );
  if (m && m[1]) {
    return {
      name: m[1].trim(),
      source: "legal_suffix",
    };
  }

  // Pattern 3: fallback – first capitalised phrase with "(Company)"
  m = text.match(
    /([A-Z][A-Za-z0-9&.,'()\- ]{2,100})\s*\(Company\)/,
  );
  if (m && m[1]) {
    return {
      name: m[1].trim(),
      source: "company_parentheses",
    };
  }

  return null;
}
// ------------------------------------------------------------------

// --- Helper: heuristic confidence score ---------------------------
// Simple, transparent heuristic so it's robust:
// - Base 0.5
// - +0.2 if we used web_search
// - +0.15 if we locked onto an entity from context
// - +0.1 if the question looks like a definition/explanation ("explain", "what is", "define")
// Clamp to [0, 0.98] to leave headroom.
function estimateConfidence({ question, usedWeb, hasEntity }) {
  let confidence = 0.5;
  const reasons = [];

  if (usedWeb) {
    confidence += 0.2;
    reasons.push("Grounded in public web search.");
  }

  if (hasEntity) {
    confidence += 0.15;
    reasons.push(
      "Linked the question to a specific entity extracted from the draft/context.",
    );
  }

  if (question && /(?:explain|what is|define|definition)/i.test(question)) {
    confidence += 0.1;
    reasons.push("Question is a standard definitional or explanatory type.");
  }

  confidence = Math.max(0, Math.min(0.98, confidence));

  if (reasons.length === 0) {
    reasons.push(
      "Heuristic estimate based on question type, web usage and available context.",
    );
  }

  return {
    confidence,
    reason: reasons.join(" "),
  };
}
// ------------------------------------------------------------------

// --- Core query runner (used by POST and GET demo) ----------------
async function runQueryPipeline({
  question,
  context,
  systemPrompt,
  model = "gpt-4o-mini",
}) {
  const trimmedQuestion =
    typeof question === "string" ? question.trim() : "";
  const trimmedContext =
    typeof context === "string" ? context.trim() : "";

  if (!trimmedQuestion) {
    throw new Error("Missing question");
  }

  // 1) Heuristic primary entity directly from context
  const heuristicPrimary = extractHeuristicPrimaryEntity(trimmedContext);
  const hasEntity = Boolean(heuristicPrimary && heuristicPrimary.name);

  // Build an explicit question for the model if we have an entity
  const questionForModel = hasEntity
    ? `For ${heuristicPrimary.name}, ${trimmedQuestion}`
    : trimmedQuestion;

  // 2) Build a web-search query (anchored on entity if present)
  let webSummary = null;
  let webUsed = false;

  try {
    let webQuery;

    if (hasEntity) {
      webQuery = [
        `Using current public information, answer the following question strictly about ${heuristicPrimary.name}.`,
        "",
        "IMPORTANT:",
        `- Treat "${heuristicPrimary.name}" as the only relevant company/fund/asset.`,
        "- If search results mention other companies with similar profiles, ignore them.",
        "",
        "User question (entity already specified):",
        questionForModel,
        "",
        "Internal draft/source context (may be truncated):",
        trimmedContext.slice(0, 2000) || "(none)",
      ].join("\n");
    } else {
      webQuery = [
        "Using current public information, answer the following investment-related question.",
        "",
        "User question:",
        trimmedQuestion,
        "",
        "Internal context (may be truncated):",
        trimmedContext.slice(0, 2000) || "(none)",
      ].join("\n");
    }

    const { summary } = await runWebSearchPreview({ query: webQuery });
    webSummary = summary || null;
    webUsed = true;
  } catch (e) {
    // Fall back silently if web_search fails
    webSummary = null;
    webUsed = false;
  }

  // 3) System prompt: strongly enforce entity lock-in if we have one
  const baseSystemPrompt =
    systemPrompt ||
    `
You are an AI assistant specialising in investment, private markets and related institutional topics.
Provide clear, concise answers suitable for professional investment audiences.
If you are uncertain, say so explicitly and avoid making up facts.

You will receive:
- A user question (which may already explicitly mention a company/entity),
- Optional internal draft/source context,
- Optional public-domain context.

If there is a specific entity identified in the system messages (e.g. "Pinterest, Inc."),
you MUST:
- Treat that entity as the one referred to by vague phrases like "the company", "the fund", or "the asset".
- Answer ONLY about that entity.
- If you cannot find reliable information about that entity, state that limitation explicitly
  instead of substituting a different company.

This endpoint may also receive general questions (e.g. "Explain the ARR metric").
In those cases, interpret the question generically and give a clear, self-contained explanation,
still grounded in public-domain context where helpful.
`.trim();

  const messages = [
    { role: "system", content: baseSystemPrompt },
    hasEntity
      ? {
          role: "system",
          content: `Primary entity extracted from the draft/source text: ${heuristicPrimary.name} (source: ${heuristicPrimary.source}).\n\nWhen the user refers to "the company", "the fund" or similar, you MUST treat this as referring to ${heuristicPrimary.name} and not any other entity. Do NOT substitute another company, even if the web context mentions other firms.`,
        }
      : null,
    webSummary
      ? {
          role: "system",
          content: `Public-domain context that may help answer the question:\n\n${webSummary}`,
        }
      : null,
    trimmedContext
      ? {
          role: "system",
          content: `Internal draft/source context from the user (not from the public web):\n\n${trimmedContext}`,
        }
      : null,
    {
      role: "user",
      content: questionForModel,
    },
  ].filter(Boolean);

  // 4) Call OpenAI for the answer
  const completion = await client.chat.completions.create({
    model,
    temperature: 0.2,
    max_tokens: 800,
    messages,
  });

  const answer =
    completion.choices?.[0]?.message?.content?.trim() ||
    "I was unable to generate an answer.";

  // 5) Heuristic confidence
  const { confidence, reason: confidenceReason } = estimateConfidence({
    question: trimmedQuestion,
    usedWeb: webUsed,
    hasEntity,
  });

  return {
    question: trimmedQuestion,
    answer,
    webUsed,
    webSummary,
    heuristicPrimary,
    effectiveQuestion: questionForModel,
    confidence,
    confidenceReason,
  };
}
// ------------------------------------------------------------------

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  // Preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // --- GET: raw web_search diagnostic -----------------------------
  if (req.method === "GET" && req.query?.mode === "web-test") {
    try {
      const q = req.query.q;

      const { summary, raw } = await runWebSearchPreview({
        query:
          typeof q === "string" && q.trim().length > 0
            ? q.trim()
            : "Recent developments and trends in private markets and private equity.",
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

  // --- GET: entity-test (heuristic only) --------------------------
  if (req.method === "GET" && req.query?.mode === "entity-test") {
    const context = req.query.context || "";
    const heuristicPrimary = extractHeuristicPrimaryEntity(context);
    return res.status(200).json({
      ok: true,
      mode: "entity-test",
      heuristicPrimary,
    });
  }

  // --- GET: demo – full pipeline via query params -----------------
  if (req.method === "GET" && req.query?.mode === "demo") {
    try {
      const question = req.query.question || "";
      const context = req.query.context || "";

      const result = await runQueryPipeline({
        question,
        context,
        systemPrompt: undefined,
        model: "gpt-4o-mini",
      });

      return res.status(200).json({
        ok: true,
        mode: "demo",
        ...result,
      });
    } catch (err) {
      return res.status(400).json({
        ok: false,
        mode: "demo",
        error: err.message || String(err),
      });
    }
  }
  // ----------------------------------------------------------------

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // --- POST: main app behaviour -----------------------------------
  try {
    const {
      question,
      context,
      systemPrompt,
      model = "gpt-4o-mini",
    } = req.body || {};

    const result = await runQueryPipeline({
      question,
      context,
      systemPrompt,
      model,
    });

    return res.status(200).json({
      ok: true,
      ...result,
    });
  } catch (err) {
    console.error("Error in /api/query:", err);
    return res.status(500).json({
      ok: false,
      error: err.message || String(err),
    });
  }
}
