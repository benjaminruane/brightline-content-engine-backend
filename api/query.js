// api/query.js
//
// AI Query endpoint
// - Always uses OpenAI web_search_preview for public-domain context
// - GET + mode=web-test: diagnostic mode, testable in browser
// - GET + mode=interpret-test: see how the backend interprets question+context
// - POST: main query handler, web-backed but falls back cleanly if web fails
// - Rich behaviour:
//     * Heuristically extracts entities (e.g. "Pinterest, Inc. (the \"Company\")")
//     * Interprets query context (entities, transaction, topics, etc.)
//     * Builds smarter web search queries using both heuristics + interpretation
//     * Works for generic questions (e.g. "Explain ARR")
//     * Returns an approximate confidence score for the answer (0–1) plus reason

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

  // Pattern 1: "Pinterest, Inc. (the "Company")"
  let m =
    text.match(
      /([A-Z][A-Za-z0-9&.,'()\- ]{2,100})\s*\(the ['"]Company['"]\)/
    ) ||
    text.match(
      /([A-Z][A-Za-z0-9&.,'()\- ]{2,100})\s*\(the ['"]Fund['"]\)/
    ) ||
    text.match(
      /([A-Z][A-Za-z0-9&.,'()\- ]{2,100})\s*\(the ['"]Asset['"]\)/
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

  // Pattern 3: fallback – first capitalised phrase before "(the \"Company\")" style definitions without quotes
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

// --- Helper: interpret rich query context -------------------------
async function interpretQueryContext({
  question,
  context,
  heuristicPrimary,
  model = "gpt-4o-mini",
}) {
  try {
    const trimmedQuestion =
      typeof question === "string" ? question.trim() : "";
    const trimmedContext =
      typeof context === "string" ? context.trim() : "";

    const heuristicHint = heuristicPrimary?.name
      ? `Heuristic primary entity hint from the internal text: "${heuristicPrimary.name}". Prefer this as the primary_entity.name if it is consistent with the question and context.`
      : "No heuristic primary entity hint is available.";

    const messages = [
      {
        role: "system",
        content: `
You are an assistant that interprets an investment-related question in the context
of an internal draft/source text.

Your job:
- Build a structured "query context" object capturing:
  - primary_entity: the main company/fund/asset (if any)
  - related_entities: other named entities that matter
  - transaction: the main transaction/deal/event being discussed (if any)
  - industry: short description of sector/industry (if identifiable)
  - country_or_region: main geography of relevance (if identifiable)
  - time_frame: natural language description of the time focus (e.g. "around the IPO", "current", "historical")
  - topics: list of 2–6 short topic labels (e.g. "ARR metric", "founding history", "IPO pricing")
  - question_type: one of:
      "factual_history", "definition_explanation", "metric_interpretation",
      "risk_analysis", "market_context", "strategic_implications", "other"

Heuristic hint:
${heuristicHint}

Rules:
- If the heuristic primary entity hint matches an entity in the context, use that as primary_entity.name with high confidence.
- If there is no obvious primary entity, set primary_entity.name to null.
- If there is no transaction, set transaction.description to null.
- For generic questions (like "Explain the ARR metric"), it's fine for many
  fields to be null or generic; still fill topics and question_type.
- ONLY rely on the given question and internal context; do not invent facts
  that are not implied there.

Respond ONLY with valid JSON in this schema:

{
  "primary_entity": {
    "name": string | null,
    "type": "company" | "fund" | "asset" | "index" | "other" | null,
    "confidence": number
  },
  "related_entities": [
    {
      "name": string,
      "type": string | null,
      "confidence": number
    }
  ],
  "transaction": {
    "description": string | null,
    "type": "ipo" | "mna" | "secondary" | "fundraise" | "exit" | "other" | null,
    "date_hint": string | null,
    "confidence": number
  },
  "industry": string | null,
  "country_or_region": string | null,
  "time_frame": string | null,
  "topics": string[],
  "question_type": string
}
        `.trim(),
      },
      {
        role: "user",
        content: `
User question:
----------------
${trimmedQuestion || "(none)"}

Internal draft/source context (may be truncated):
----------------
${trimmedContext.slice(0, 2000) || "(none)"}

Return ONLY the JSON object, no explanation.
        `.trim(),
      },
    ];

    const completion = await client.chat.completions.create({
      model,
      temperature: 0,
      max_tokens: 350,
      messages,
    });

    const raw =
      completion.choices?.[0]?.message?.content?.trim() || "{}";

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const cleaned = raw.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(cleaned);
    }

    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    return parsed;
  } catch (err) {
    console.error("Error in interpretQueryContext:", err);
    return {};
  }
}
// ------------------------------------------------------------------

// --- Helper: approximate confidence from answer -------------------
async function estimateAnswerConfidence({
  question,
  answer,
  webSummary,
  model = "gpt-4o-mini",
}) {
  try {
    const trimmedQuestion =
      typeof question === "string" ? question.trim() : "";
    const trimmedAnswer =
      typeof answer === "string" ? answer.trim() : "";
    const trimmedWeb =
      typeof webSummary === "string" ? webSummary.trim() : "";

    const messages = [
      {
        role: "system",
        content: `
You are an assistant that estimates how confident we should be in a given answer
to an investment-related question, using any provided public-domain summary.

Your job:
- Return ONLY a JSON object with:
  {
    "confidence": number,   // between 0 and 1
    "reason": string        // brief explanation (1–3 sentences)
  }

Guidance for confidence:
- 0.9–1.0: Answer is strongly supported by the public-domain context and is
           about well-established facts or definitions.
- 0.7–0.89: Answer appears reasonable and mostly aligned with context, but there
            may be some uncertainty or minor gaps.
- 0.4–0.69: Answer is partially supported or somewhat speculative.
- 0.0–0.39: Answer is weakly supported, contradicted by context, or highly speculative.

If no public-domain context is provided, base your judgement on how standard and
clear the answer appears and how likely it is to be factually correct.
        `.trim(),
      },
      {
        role: "user",
        content: `
Question:
----------------
${trimmedQuestion || "(none)"}

Answer:
----------------
${trimmedAnswer || "(none)"}

Public-domain summary (may be empty):
----------------
${trimmedWeb || "(none)"}

Return ONLY the JSON object, no explanation.
        `.trim(),
      },
    ];

    const completion = await client.chat.completions.create({
      model,
      temperature: 0,
      max_tokens: 200,
      messages,
    });

    const raw =
      completion.choices?.[0]?.message?.content?.trim() ||
      '{"confidence":0.5,"reason":"No information."}';

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const cleaned = raw.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(cleaned);
    }

    if (!parsed || typeof parsed !== "object") {
      return { confidence: null, reason: null };
    }

    const confidence =
      typeof parsed.confidence === "number"
        ? Math.max(0, Math.min(1, parsed.confidence))
        : null;

    const reason =
      typeof parsed.reason === "string" ? parsed.reason.trim() : null;

    return { confidence, reason };
  } catch (err) {
    console.error("Error in estimateAnswerConfidence:", err);
    return { confidence: null, reason: null };
  }
}
// ------------------------------------------------------------------

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  // Preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // --- GET diagnostic: raw web_search_preview ---------------------
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

  // --- GET diagnostic: interpretation only ------------------------
  if (req.method === "GET" && req.query?.mode === "interpret-test") {
    const question = req.query.question || "";
    const context = req.query.context || "";

    const heuristicPrimary = extractHeuristicPrimaryEntity(context);
    const interpretedContext = await interpretQueryContext({
      question,
      context,
      heuristicPrimary,
      model: "gpt-4o-mini",
    });

    return res.status(200).json({
      ok: true,
      mode: "interpret-test",
      heuristicPrimary,
      interpretedContext,
    });
  }
  // ----------------------------------------------------------------

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      question,
      // "context" should include the current draft text and/or source snippets.
      // e.g. company name, fund name, asset name, key facts, transaction description, etc.
      context,
      systemPrompt, // optional custom system prompt
      model = "gpt-4o-mini",
    } = req.body || {};

    if (!question || !question.trim()) {
      return res.status(400).json({
        ok: false,
        error: "Missing question",
      });
    }

    const trimmedQuestion = question.trim();
    const trimmedContext =
      typeof context === "string" ? context.trim() : "";

    // 1) Heuristic primary entity directly from context
    const heuristicPrimary = extractHeuristicPrimaryEntity(trimmedContext);

    // 2) Interpret query context (entities, transaction, topics, etc.)
    const interpretedContext = await interpretQueryContext({
      question: trimmedQuestion,
      context: trimmedContext,
      heuristicPrimary,
      model,
    });

    // Determine effective primary entity name (heuristic wins if present)
    let effectivePrimaryName = null;
    if (heuristicPrimary?.name) {
      effectivePrimaryName = heuristicPrimary.name;
    } else if (
      interpretedContext &&
      interpretedContext.primary_entity &&
      interpretedContext.primary_entity.name
    ) {
      effectivePrimaryName = interpretedContext.primary_entity.name;
    }

    // 3) Build a richer web-search query using interpreted context
    let webSummary = null;
    try {
      const ctx = interpretedContext || {};
      const tx = ctx.transaction || {};

      const parts = [];

      if (effectivePrimaryName) {
        parts.push(
          `Using current public information, answer the user's question about ${effectivePrimaryName}.`
        );
      } else {
        parts.push(
          "Using current public information, answer the following investment-related question."
        );
      }

      if (tx && tx.description) {
        parts.push(
          `The question is especially focused on this transaction or event: ${tx.description}.`
        );
      }

      if (ctx.industry) {
        parts.push(`Industry: ${ctx.industry}.`);
      }

      if (ctx.country_or_region) {
        parts.push(`Country/Region: ${ctx.country_or_region}.`);
      }

      if (ctx.time_frame) {
        parts.push(`Time frame: ${ctx.time_frame}.`);
      }

      if (Array.isArray(ctx.topics) && ctx.topics.length > 0) {
        parts.push(`Key topics: ${ctx.topics.join(", ")}.`);
      }

      parts.push("", "User question:", trimmedQuestion);

      if (effectivePrimaryName) {
        parts.push(
          "",
          `Primary entity inferred from internal context and heuristics: ${effectivePrimaryName}.`
        );
      }

      if (trimmedContext) {
        parts.push(
          "",
          "Internal draft and source context (may be truncated). Use this to confirm you are looking at the correct entities and to disambiguate pronouns like 'the company':",
          trimmedContext.slice(0, 2000)
        );
      }

      const webQuery = parts.join("\n");

      const { summary } = await runWebSearchPreview({ query: webQuery });
      webSummary = summary;
    } catch (e) {
      // Fail silently and fall back to no-web
      webSummary = null;
    }

    // 4) Build system prompt with strong instructions on using context
    const baseSystemPrompt =
      systemPrompt ||
      `
You are an AI assistant specialising in investment, private markets and related institutional topics.
Provide clear, concise answers suitable for professional investment audiences.
If you are uncertain, say so explicitly and avoid making up facts.

You will often receive:
- A structured "query context" describing entities, transactions, industry, geography and topics.
- Internal/project context that mentions specific companies, funds or assets.
- Public-domain context.
- Occasionally, there will be a strong heuristic hint for the primary entity.

When the user asks a question that uses vague references like "the company", "the fund", "the asset",
"the transaction", or pronouns like "it" or "they", you MUST:

1. First, infer what they mean from:
   - The heuristic primary entity (if present),
   - The interpreted query context,
   - The internal context, and
   - The public-domain context.

2. Only ask the user to clarify IF:
   - There are multiple equally plausible interpretations AND the question genuinely cannot be answered
     without knowing which one, OR
   - No relevant entity/transaction appears in the context at all.

3. When you infer the reference, answer directly.
   - You may briefly state which entity/transaction you assumed, e.g. "Assuming you are referring to Pinterest, Inc., ..."
   - Do NOT reflexively ask "which company?" if you can reasonably infer the answer from context.

Use any public-domain context you are given to ground the answer in up-to-date factual information.
If a fact cannot be established reliably, explain the limitation instead of guessing.

This endpoint may also receive general questions (e.g. "Explain the ARR metric").
In those cases, interpret the question generically and give a clear, self-contained explanation,
still grounded in public-domain context where helpful.
`.trim();

    // 5) Build message array, injecting interpreted context, web context and internal context
    const messages = [
      { role: "system", content: baseSystemPrompt },
      heuristicPrimary?.name
        ? {
            role: "system",
            content: `Heuristic primary entity extracted directly from the draft/source text: ${heuristicPrimary.name} (source: ${heuristicPrimary.source}). Treat this as the default meaning of "the company" / "the fund" / "the asset" unless the question clearly refers to something else.`,
          }
        : null,
      interpretedContext && Object.keys(interpretedContext).length > 0
        ? {
            role: "system",
            content: `Interpreted query context (from internal draft/sources and user question):\n\n${JSON.stringify(
              interpretedContext,
              null,
              2
            )}`,
          }
        : null,
      webSummary
        ? {
            role: "system",
            content: `Public domain context (for answering the user's question). Use this to ground your answer in recent information where appropriate:\n\n${webSummary}`,
          }
        : null,
      trimmedContext
        ? {
            role: "system",
            content: `Internal draft/source context from the user (not from the public web). Use this to identify relevant entities/transactions and interpret vague references:\n\n${trimmedContext}`,
          }
        : null,
      { role: "user", content: trimmedQuestion },
    ].filter(Boolean);

    // 6) Call OpenAI for the actual answer
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.2,
      max_tokens: 800,
      messages,
    });

    const answer =
      completion.choices?.[0]?.message?.content?.trim() ||
      "I was unable to generate an answer.";

    // 7) Estimate confidence in the answer (secondary call, but guarded)
    let confidence = null;
    let confidenceReason = null;
    try {
      const confResult = await estimateAnswerConfidence({
        question: trimmedQuestion,
        answer,
        webSummary,
        model,
      });
      confidence = confResult.confidence;
      confidenceReason = confResult.reason;
    } catch (e) {
      confidence = null;
      confidenceReason = null;
    }

    return res.status(200).json({
      ok: true,
      question: trimmedQuestion,
      answer,
      webUsed: Boolean(webSummary),
      webSummary,
      interpretedContext,
      heuristicPrimary,
      confidence,       // 0–1 (you can multiply by 100 in the UI)
      confidenceReason, // short explanation
    });
  } catch (err) {
    console.error("Error in /api/query:", err);
    return res.status(500).json({
      ok: false,
      error: err.message || String(err),
    });
  }
}
