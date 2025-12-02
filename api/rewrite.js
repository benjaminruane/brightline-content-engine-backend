// /api/rewrite.js
import OpenAI from "openai";

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

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
      text,          // original draft
      notes,         // rewrite instructions
      scenario,
      versionType,
      model,
      publicSearch,
    } = req.body || {};

    if (!text || typeof text !== "string") {
      return res
        .status(400)
        .json({ error: "Missing or invalid 'text' to rewrite" });
    }

    const safeScenario = scenario || "unspecified";
    const safeVersionType = versionType || "complete";

    const instructionBlock =
      (notes || "").trim() ||
      "Improve clarity, flow and structure while preserving meaning and factual content. Keep the tone professional and investor-facing.";

    const userPrompt = `
You are rewriting an existing private-markets investment communication.

Context:
- Scenario id: ${safeScenario}
- Version type: ${safeVersionType}
- Public web search allowed flag (for your awareness only): ${
      publicSearch ? "true" : "false"
    }

Rewrite instructions from the user:
${instructionBlock}

Original draft (to be rewritten):
${text}

Task:
Produce a single rewritten draft that applies the instructions above. 
Do NOT add new facts that are not implied by the original text. 
Write directly as the final text.
`.trim();

    const systemPrompt =
      "You are a careful, precise financial editor. You improve clarity, structure and tone of private-markets investment communications without changing their factual content.";

    const completion = await client.chat.completions.create({
      model: model || "gpt-4o-mini",
      temperature: 0.3,
      max_completion_tokens: 2048,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const rawContent = completion?.choices?.[0]?.message?.content;
    const rewrittenText =
      typeof rawContent === "string" ? rawContent.trim() : "";

    if (!rewrittenText) {
      console.error(
        "No rewritten text in OpenAI completion:",
        JSON.stringify(completion, null, 2)
      );
      return res.status(500).json({
        error: "Model returned empty rewritten content",
      });
    }

    // Shape matches what handleRewrite expects
    return res.status(200).json({
      text: rewrittenText,
      score: null,              // reserved for later scoring
      statementAnalysis: null,  // reserved; FE can run analysis separately
    });
  } catch (err) {
    console.error("Error in /api/rewrite:", err);
    return res.status(500).json({
      error: "Failed to rewrite draft",
      details: err.message || String(err),
    });
  }
}
