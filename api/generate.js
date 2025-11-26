// api/generate.js
//
// Generates one or more outputs (transaction text, investor letter, etc.)
// from the provided source text and notes.
// - Always uses internal sources as the primary basis.
// - If publicSearch === true, uses OpenAI web_search_preview to pull in
//   light background context and injects it into the prompt.
// - Response shape matches the existing frontend expectations:
//   { outputs: [{ outputType, text, score, metrics }], publicSources: [] }

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

// --- Inline helper: web_search_preview ----------------------------
async function runWebSearchPreview({ query, model = "gpt-4.1" }) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY in environment.");
  }

  const userQuery =
    typeof query === "string" && query.trim().length > 0
      ? query.trim()
      : "Using current public information, provide concise background context on a private-markets investment transaction.";

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

  return { summary, raw: payload };
}
// ------------------------------------------------------------------

function describeOutputType(outputType) {
  switch (outputType) {
    case "transaction_text":
      return "Concise transaction description suitable for investment reports and internal notes.";
    case "investment_note":
      return "Investor letter style commentary explaining the investment, thesis, and outlook in clear professional prose.";
    case "press_release":
      return "Public-facing press release suitable for distribution to media and external stakeholders.";
    case "linkedin_post":
      return "Professional but approachable LinkedIn post summarising the transaction for a broad audience.";
    default:
      return "Professional investment-related written output.";
  }
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      title,
      notes,
      text,
      selectedTypes,
      scenario = "default",
      versionType = "complete",
      modelId = "gpt-4o-mini",
      temperature = 0.3,
      maxTokens = 2048,
      publicSearch = false,
      maxWords,
    } = req.body || {};

    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Missing text" });
    }

    const types = Array.isArray(selectedTypes) && selectedTypes.length
      ? selectedTypes
      : ["transaction_text"];

    // Optional public web context (behind the toggle)
    let webSummary = null;
    if (publicSearch) {
      try {
        const truncated = text.slice(0, 2000);
        const webQuery = [
          "Using current public information, provide concise factual background",
          "that could help inform a professional investment write-up for the following event.",
          "",
          title ? `Title / headline: ${title}` : "",
          "",
          "Internal description (may be truncated):",
          "--------------------",
          truncated,
          "--------------------",
        ].join("\n");

        const { summary } = await runWebSearchPreview({
          query: webQuery,
          model: "gpt-4.1",
        });
        webSummary = summary || null;
      } catch (e) {
        console.error("web_search_preview in generate failed:", e);
        webSummary = null;
      }
    }

    const baseSystem = `
You are an AI assistant that drafts professional investment-related content
for private-markets transactions and funds.

You will receive:
- An internal description of the event and its context,
- Optional writer's notes,
- A requested output format (transaction text, investor letter, press release, or LinkedIn post),
- Optional public-domain context (when available).

Guidelines:
- Write in clear, professional, concise prose suitable for institutional investors.
- Do NOT invent specific deal terms, numbers, or counterparties that are not supported by the internal text.
- Where public-domain context is provided, you may use it to refine the narrative,
  but avoid quoting URLs or mentioning specific media sources.
- If you are uncertain about a fact, keep the wording high-level instead of guessing.

You should produce a single piece of text per request (no JSON, no commentary).
`.trim();

    const internalContext = `
Scenario: ${scenario}
Version type: ${versionType}
${title ? `Proposed title / headline: ${title}\n` : ""}${
      notes ? `Writer notes / constraints:\n${notes}\n\n` : ""
    }Internal source material:
--------------------
${text}
--------------------
`.trim();

    const publicContext = webSummary
      ? `Public-domain context (for background only, do not cite sources directly):\n\n${webSummary}\n\n`
      : "";

    const outputs = [];

    for (const outputType of types) {
      const outputDescription = describeOutputType(outputType);

      const userPrompt = `
Output type: ${outputType}
Description: ${outputDescription}
${maxWords ? `Target maximum words: ${maxWords}\n` : ""}

${publicContext}${internalContext}

Write the final ${outputType.replace(
        "_",
        " "
      )} now. Do not include any JSON or explanation, only the prose.
`.trim();

      const completion = await client.chat.completions.create({
        model: modelId || "gpt-4o-mini",
        temperature: typeof temperature === "number" ? temperature : 0.3,
        max_tokens:
          typeof maxTokens === "number" && maxTokens > 0
            ? maxTokens
            : 2048,
        messages: [
          { role: "system", content: baseSystem },
          { role: "user", content: userPrompt },
        ],
      });

      const textOut =
        completion.choices?.[0]?.message?.content?.trim() || "";

      outputs.push({
        outputType,
        text: textOut,
        score: null, // Leave scoring for later refinement
        metrics: {},
      });
    }

    // For now we don't return structured public sources; just an empty list
    const publicSources = [];

    return res.status(200).json({
      outputs,
      publicSources,
    });
  } catch (err) {
    console.error("Error in /api/generate:", err);
    return res.status(500).json({
      error: err.message || String(err),
    });
  }
}
