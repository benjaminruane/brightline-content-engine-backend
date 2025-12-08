// /api/query.js
//
// Answers Ask-AI questions about the current draft and sources.
// Uses the Responses API + web search. Returns plain text answers
// (markdown stripped) to keep UI clean.

import "isomorphic-fetch";

// ---------------- CORS ----------------
function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}
// --------------------------------------

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  // Preflight handler (FIX for CORS errors)
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { question, draft, sources, model, publicSearch } = req.body || {};

    if (!question || typeof question !== "string") {
      return res.status(400).json({ error: "Missing or invalid question" });
    }

    const safeDraft = typeof draft === "string" ? draft.slice(0, 12000) : "";
    const safeSources = Array.isArray(sources) ? sources : [];

    // Build context
    const sourceSnippets = safeSources
      .slice(0, 3)
      .map((s, i) => {
        const name = s.name || s.url || `Source ${i + 1}`;
        const text = typeof s.text === "string" ? s.text.slice(0, 4000) : "";
        return `Source ${i + 1} – ${name}:\n${text}`;
      })
      .join("\n\n");

    const context =
      `CURRENT DRAFT:\n${safeDraft || "(empty)"}\n\n-----\n\n` +
      `SOURCES:\n${sourceSnippets || "(none provided)"}`;

    // ---------------- API call ----------------

    const resolvedModel = model?.trim() || "gpt-4o-mini";

    const payload = {
      model: resolvedModel,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                "You are an assistant helping review investment-related drafts.\n" +
                "- Always call web_search at least once.\n" +
                "- Use draft & sources first, but web results may supplement.\n" +
                "- If figures only appear online, reference web info explicitly.\n" +
                "- If unknown, say so.\n" +
                "- Keep answers factual, concise, and non-promotional."
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `${context}\n\nUser question: ${question}`
            }
          ]
        }
      ],
      max_output_tokens: 512,
      temperature: 0.2,
      tools: [{ type: "web_search" }]
    };

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Responses API error:", errText);
      return res.status(502).json({ error: "Upstream OpenAI error", details: errText });
    }

    const data = await response.json();

    // Extract answer
    let answer = data.output_text?.trim() || "";

    if (!answer && Array.isArray(data.output)) {
      for (const item of data.output) {
        if (item.type === "message" && Array.isArray(item.content)) {
          for (const block of item.content) {
            if (block.type === "output_text" && block.text) {
              answer = block.text.trim();
              break;
            }
          }
        }
      }
    }

    if (!answer) {
      return res.status(500).json({ error: "Model returned empty answer" });
    }

    // Clean formatting for UI
    const cleanAnswer = answer
      .replace(/\*\*(.*?)\*\*/g, "$1") // bold
      .replace(/\*(.*?)\*/g, "$1")     // italics
      .trim();

    return res.status(200).json({
      answer: cleanAnswer,
      confidence: null,
      confidenceReason: null,
      model: data.model || resolvedModel,
      createdAt: new Date().toISOString()
    });

  } catch (err) {
    console.error("Error in /api/query:", err);
    return res.status(500).json({
      error: "Failed to process query",
      details: err.message
    });
  }
}
