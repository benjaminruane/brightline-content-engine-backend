// /api/query.js
//
// Answers a follow-up question about the current draft and sources.
// Now uses the Responses API + optional web search, but keeps the
// JSON response shape identical for the frontend.

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
    const {
      question,
      draft,
      sources,
      model,
      publicSearch,
    } = req.body || {};

    if (!question || typeof question !== "string") {
      return res.status(400).json({ error: "Missing or invalid question" });
    }

    const safeDraft =
      typeof draft === "string" ? draft.slice(0, 12_000) : "";
    const safeSources = Array.isArray(sources) ? sources : [];

    // Build a compact context string from draft + first few sources
    const sourceSnippets = safeSources
      .slice(0, 3)
      .map((s, idx) => {
        const name = s.name || s.url || `Source ${idx + 1}`;
        const text =
          typeof s.text === "string" ? s.text.slice(0, 4000) : "";
        return `Source ${idx + 1} – ${name}:\n${text}`;
      })
      .join("\n\n");

    const context = [
      safeDraft
        ? `CURRENT DRAFT:\n${safeDraft}`
        : "CURRENT DRAFT:\n(Empty)",
      sourceSnippets
        ? `SOURCES:\n${sourceSnippets}`
        : "SOURCES:\n(None provided)",
    ].join("\n\n-----\n\n");

    // ------------------------------------------------------------------
    // Call Responses API directly via fetch.
    // This avoids any SDK "... is not a function" issues while still
    // letting us always use web search tools for Ask AI.
    // ------------------------------------------------------------------

    const resolvedModel =
      typeof model === "string" && model.trim().length > 0
        ? model.trim()
        : "gpt-4o-mini";

    const body = {
      model: resolvedModel,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                "You are an assistant helping to review and explain investment-related drafts.\n" +
                "- Always call the web_search tool at least once before answering.\n" +
                "- Use the draft and sources as your primary context, but you may also use web search results to add up-to-date, relevant public information about the same company or topic.\n" +
                '- If the user asks about \"the company\", assume they mean the main company described in the draft.\n' +
                "- If a specific figure or fact is not present in the draft or sources but appears clearly in trustworthy web results, you may answer using those web results and say so.\n" +
                "- If neither the draft/sources nor web results provide the answer, say that the information is not available.\n" +
                "- Be concise and concrete.",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                `Here is the current draft and supporting sources:\n\n${context}\n\n` +
                `User question: ${question}`,
            },
          ],
        },
      ],
      max_output_tokens: 512,
      temperature: 0.2,
    };

    // Always allow Ask AI to use web search, regardless of UI toggles
    body.tools = [
      {
        type: "web_search",
      },
    ];


    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorPayload = await response.text();
      console.error("OpenAI /v1/responses error:", errorPayload);
      return res.status(502).json({
        error: "Upstream OpenAI responses API error",
        details: errorPayload,
      });
    }

    const payload = await response.json();

    // Prefer the helper field if present
    let answerText = "";
    if (payload.output_text && typeof payload.output_text === "string") {
      answerText = payload.output_text.trim();
    } else if (Array.isArray(payload.output)) {
      // Fallback: walk the structured output
      for (const item of payload.output) {
        if (item.type === "message" && Array.isArray(item.content)) {
          for (const block of item.content) {
            if (block.type === "output_text" && block.text?.length) {
              answerText = block.text.trim();
              break;
            }
          }
        }
        if (answerText) break;
      }
    }

    if (!answerText) {
      console.error("Responses API returned no output_text:", payload);
      return res.status(500).json({
        error: "Model returned empty answer",
      });
    }

    return res.status(200).json({
      answer: answerText,
      confidence: null,
      confidenceReason: null,
      model: payload.model || resolvedModel,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Error in /api/query:", err);
    return res.status(500).json({
      error: "Failed to process query",
      details: err.message || String(err),
    });
  }
}
