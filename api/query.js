// api/query.js
//
// AI Query endpoint
// - Always uses OpenAI web_search_preview for public-domain context
// - GET + mode=web-test: diagnostic mode, testable in browser
// - POST: main query handler, web-backed but falls back cleanly if web fails
// - Rich behaviour:
//     * Interprets query context: entities, transaction, industry, geography, topics
//     * Builds smarter web search queries from that interpretation
//     * Anchors answers on interpreted context (for things like "the company")
//     * Works fine for generic questions (e.g. "Explain ARR")
//     * Returns an approximate confidence score for the answer (0–1)

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

// --- Helper: interpret rich query context -------------------------
async function interpretQueryContext({
  question,
  context,
  model = "gpt-4o-mini",
}) {
  try {
    const trimmedQuestion =
      typeof question === "string" ? question.trim() : "";
    const trimmedContext =
      typeof context === "string" ? context.trim() : "";

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

Rules:
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
      completion.choices?.[0]?.message?.content?.trim() || '{"confidence":0.5,"reason":"No information."}';

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

  // --- GET diagnostic mode: test web_search_preview in browser ----
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

    // 1) Interpret query context (entities, transaction, topics, etc.)
    const interpretedContext = await interpretQueryContext({
      question: trimmedQuestion,
      context: trimmedContext,
      model,
    });

    // 2) Build a richer web-search query using interpreted context
    let webSummary = null;
    try {
      const ctx = interpretedContext || {};
      const primary = ctx.primary_entity || {};
      const tx = ctx.transaction || {};

      const parts = [];

      if (primary && primary.name) {
        parts.push(
          `Using current public information, answer the user's question about ${primary.name}.`
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

      if (primary && primary.name) {
        parts.push(
          "",
          `Primary entity inferred from internal context: ${primary.name}.`
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

    // 3) Build system prompt with strong instructions on using interpreted context
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

When the user asks a question that uses vague references like "the company", "the fund", "the asset",
"the transaction", or pronouns like "it" or "they", you MUST:

1. First, infer what they mean from:
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

    // 4) Build message array, injecting interpreted context, web context and internal context
    const messages = [
      { role: "system", content: baseSystemPrompt },
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

    // 5) Call OpenAI for the actual answer
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.2,
      max_tokens: 800,
      messages,
    });

    const answer =
      completion.choices?.[0]?.message?.content?.trim() ||
      "I was unable to generate an answer.";

    // 6) Estimate confidence in the answer (secondary call)
    const { confidence, reason: confidenceReason } =
      await estimateAnswerConfidence({
        question: trimmedQuestion,
        answer,
        webSummary,
        model,
      });

    return res.status(200).json({
      ok: true,
      question: trimmedQuestion,
      answer,
      webUsed: Boolean(webSummary),
      webSummary,
      interpretedContext,
      confidence,           // 0–1
      confidenceReason,     // brief explanation
    });
  } catch (err) {
    console.error("Error in /api/query:", err);
    return res.status(500).json({
      ok: false,
      error: err.message || String(err),
    });
  }
}
