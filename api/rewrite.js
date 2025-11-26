// api/rewrite.js
//
// Rewrites an existing draft according to user notes,
// keeping the same scenario + output type.
// - Uses internal draft as primary source of truth.
// - If publicSearch === true, adds web_search_preview context
//   to help sharpen public-facing language and remove factual drift.

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
      : "Using current public information, provide background context relevant to an investment commentary rewrite.";

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

function describeRewriteContext(outputType, versionType) {
  const base =
    outputType === "press_release"
      ? "public-facing press release"
      : outputType === "linkedin_post"
      ? "professional LinkedIn post"
      : outputType === "investment_note"
      ? "investor letter"
      : "transaction description";

  const visibility =
    versionType === "public"
      ? "public-facing audiences and external communications"
      : "internal and investor communications";

  return `${base} aimed at ${visibility}.`;
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
      text,
      notes,
      outputType = "transaction_text",
      scenario = "default",
      versionType = "complete",
      modelId = "gpt-4o-mini",
      temperature = 0.3,
      maxTokens = 2048,
      maxWords,
      publicSearch = false,
    } = req.body || {};

    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Missing text" });
    }

    // Optional public web context (behind the toggle)
    let webSummary = null;
    if (publicSearch) {
      try {
        const truncated = text.slice(0, 2000);
        const webQuery = [
          "Using current public information, provide concise background context",
          "that may help refine and sanity-check an investment commentary rewrite.",
          "",
          "Existing draft (may be truncated):",
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
        console.error("web_search_preview in rewrite failed:", e);
        webSummary = null;
      }
    }

    const rewriteContext = describeRewriteContext(outputType, versionType);

    const systemPrompt = `
You are an AI assistant that rewrites professional investment-related content.

You will receive:
- An existing draft,
- User rewrite instructions,
- Scenario and output type,
- Optional public-domain context (for background only).

Your job:
- Preserve the core facts and deal details in the existing draft.
- Apply the user's rewrite instructions faithfully.
- For "public" versions, keep language more high-level, cautious, and suitable for external use,
  while still being specific enough to be useful.
- For "complete" versions, you may be more detailed and technical, but still clear and concise.
- If public-domain context is provided, use it only to improve clarity and remove obvious inaccuracies;
  do NOT introduce new unsubstantiated details or cite URLs.

Return ONLY the rewritten text (no JSON, no commentary).
`.trim();

    const userPrompt = `
Scenario: ${scenario}
Output type: ${outputType}
Version type: ${versionType}
Rewrite context: ${rewriteContext}

User rewrite instructions:
${notes && notes.trim() ? notes.trim() : "(none – just clean up and improve the draft)"}

${webSummary ? `Public-domain background (for your awareness only):\n\n${webSummary}\n\n` : ""}Existing draft:
--------------------
${text}
--------------------

Now provide the fully rewritten draft.
${maxWords ? `Aim to stay within approximately ${maxWords} words.` : ""}
`.trim();

    const completion = await client.chat.completions.create({
      model: modelId || "gpt-4o-mini",
      temperature: typeof temperature === "number" ? temperature : 0.3,
      max_tokens:
        typeof maxTokens === "number" && maxTokens > 0 ? maxTokens : 2048,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const rewritten =
      completion.choices?.[0]?.message?.content?.trim() || "";

    const outputs = [
      {
        text: rewritten,
        score: null, // scoring can be added later
        metrics: {},
      },
    ];

    return res.status(200).json({ outputs });
  } catch (err) {
    console.error("Error in /api/rewrite:", err);
    return res.status(500).json({
      error: err.message || String(err),
    });
  }
}
