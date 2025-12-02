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

// --- Structured confidence scoring (Ask AI) -----------------------
// Derive a 0–1 confidence score from discrete labels instead of
// asking the model to guess a percentage.
function scoreQueryConfidence(meta) {
  let score = 0.7; // start moderately positive

  // Grounding – how tied to provided draft/sources the answer is
  if (
    meta.grounding_level === "strong_in_draft" ||
    meta.grounding_level === "strong_in_sources"
  ) {
    score += 0.15;
  } else if (meta.grounding_level === "mixed") {
    // no change
  } else if (meta.grounding_level === "weak") {
    score -= 0.15;
  }

  // Coverage – how directly the answer addresses the question
  if (meta.coverage === "direct") {
    score += 0.1;
  } else if (meta.coverage === "partial") {
    // no change
  } else if (meta.coverage === "indirect") {
    score -= 0.1;
  }

  // Hedging – tentativeness of language
  if (meta.hedging_level === "high") {
    score -= 0.15;
  } else if (meta.hedging_level === "medium") {
    score -= 0.05;
  }

  // Explicit contradictions or ambiguity in sources
  if (meta.contradiction_flag) {
    score -= 0.2;
  }

  // Clamp to [0, 1]
  score = Math.max(0, Math.min(1, score));
  return score;
}

// Turn the structured meta into a short English reason
function buildConfidenceReason(meta) {
  const parts = [];

  if (meta.grounding_level === "strong_in_draft") {
    parts.push("strongly grounded in the current draft");
  } else if (meta.grounding_level === "strong_in_sources") {
    parts.push("strongly grounded in attached sources");
  } else if (meta.grounding_level === "mixed") {
    parts.push("partly grounded in the draft and sources");
  } else if (meta.grounding_level === "weak") {
    parts.push("weakly grounded in the provided material");
  }

  if (meta.coverage === "direct") {
    parts.push("directly answers the question");
  } else if (meta.coverage === "partial") {
    parts.push("only partially addresses the question");
  } else if (meta.coverage === "indirect") {
    parts.push("addresses the topic only indirectly");
  }

  if (meta.hedging_level === "high") {
    parts.push("uses strongly tentative language");
  } else if (meta.hedging_level === "medium") {
    parts.push("includes some hedging");
  }

  if (meta.contradiction_flag) {
    parts.push("notes conflicting or ambiguous information in the sources");
  }

  if (!parts.length) {
    return "No clear confidence signals detected.";
  }

  let reason = parts[0];
  for (let i = 1; i < parts.length; i++) {
    if (i === parts.length - 1) {
      reason += " and " + parts[i];
    } else {
      reason += ", " + parts[i];
    }
  }
  return reason.charAt(0).toUpperCase() + reason.slice(1) + ".";
}

// Ask the model to classify grounding / coverage / hedging / contradictions
// and then compute confidence from that. Falls back to estimateConfidence
// if anything goes wrong (e.g. JSON parse error).
async function evaluateAnswerConfidence({
  question,
  context,
  answer,
  model,
  usedWeb,
  hasEntity,
}) {
  const trimmedQuestion =
    typeof question === "string" ? question.trim() : "";
  const trimmedContext =
    typeof context === "string" ? context.trim() : "";
  const trimmedAnswer =
    typeof answer === "string" ? answer.trim() : "";

  if (!trimmedAnswer) {
    const fallback = estimateConfidence({
      question: trimmedQuestion,
      usedWeb,
      hasEntity,
    });
    return {
      confidence: fallback.confidence,
      confidenceReason: fallback.reason,
      meta: null,
    };
  }

  const evalPrompt = `
You are evaluating the reliability of an AI answer to a user's question
about an investment-related draft and its sources.

QUESTION:
${trimmedQuestion}

CONTEXT (draft + sources, may be truncated):
${trimmedContext.slice(0, 4000)}

ANSWER:
${trimmedAnswer}

Based on the relationship between the QUESTION, CONTEXT, and ANSWER,
classify the following fields:

- grounding_level: one of:
  - "strong_in_draft" (answer is clearly grounded in the provided draft text)
  - "strong_in_sources" (answer is clearly grounded in attached sources)
  - "mixed" (parts grounded, parts inferred)
  - "weak" (little or no clear grounding in the provided material)

- coverage: one of:
  - "direct" (answer clearly and fully addresses the question)
  - "partial" (answer addresses some but not all key aspects)
  - "indirect" (answer is loosely related but does not directly answer)

- hedging_level: one of:
  - "low" (confident, factual tone, minimal hedging)
  - "medium" (some hedging like "may", "might", "likely")
  - "high" (frequent hedging or explicit uncertainty)

- contradiction_flag: true or false
  (true if the answer notes or implies conflicting/ambiguous information in the sources
   or if the answer conflicts with the context itself).

Return ONLY a valid JSON object with this shape:
{
  "grounding_level": "...",
  "coverage": "...",
  "hedging_level": "...",
  "contradiction_flag": true or false
}
`.trim();

  let evalText = "";
  try {
    const completion = await client.chat.completions.create({
      model: model || "gpt-4o-mini",
      temperature: 0,
      max_completion_tokens: 300,
      messages: [
        {
          role: "system",
          content:
            "You classify the reliability of answers. Always return strict JSON with the requested fields.",
        },
        {
          role: "user",
          content: evalPrompt,
        },
      ],
    });

    evalText =
      completion.choices?.[0]?.message?.content?.trim() || "{}";
  } catch (e) {
    // If the eval call itself fails, fall back to heuristic
    const fallback = estimateConfidence({
      question: trimmedQuestion,
      usedWeb,
      hasEntity,
    });
    return {
      confidence: fallback.confidence,
      confidenceReason: fallback.reason,
      meta: null,
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(evalText);
  } catch (e) {
    const fallback = estimateConfidence({
      question: trimmedQuestion,
      usedWeb,
      hasEntity,
    });
    return {
      confidence: fallback.confidence,
      confidenceReason: fallback.reason,
      meta: null,
    };
  }

  const meta = {
    grounding_level: parsed.grounding_level || "mixed",
    coverage: parsed.coverage || "partial",
    hedging_level: parsed.hedging_level || "medium",
    contradiction_flag: Boolean(parsed.contradiction_flag),
  };

  const confidence = scoreQueryConfidence(meta);
  const confidenceReason = buildConfidenceReason(meta);

  return {
    confidence,
    confidenceReason,
    meta,
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
    max_completion_tokens: 800,
    messages,
  });

  const answer =
    completion.choices?.[0]?.message?.content?.trim() ||
    "I was unable to generate an answer.";

  // 5) Structured confidence evaluation (with heuristic fallback)
  let confidence;
  let confidenceReason;

  try {
    const evalResult = await evaluateAnswerConfidence({
      question: trimmedQuestion,
      context: trimmedContext,
      answer,
      model,
      usedWeb: webUsed,
      hasEntity,
    });

    confidence = evalResult.confidence;
    confidenceReason = evalResult.confidenceReason;
    // If you later want to expose meta to the frontend, you can also
    // return evalResult.meta as part of the response.
  } catch (e) {
    console.error("evaluateAnswerConfidence failed, falling back:", e);
    const fallback = estimateConfidence({
      question: trimmedQuestion,
      usedWeb: webUsed,
      hasEntity,
    });
    confidence = fallback.confidence;
    confidenceReason = fallback.reason;
  }

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
