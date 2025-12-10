// /api/rewrite.js
//
// Rewrites an existing draft based on user instructions.
// - If publicSearch === true  -> Uses Responses API + web_search
// - If publicSearch === false -> Uses Chat Completions only

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

// Optional helper if you ever want to estimate tokens
function approximateTokensFromWords(wordCount) {
  if (!wordCount || typeof wordCount !== "number") return null;
  // Rough: 1 token ≈ 0.75 words
  return Math.round(wordCount / 0.75);
}

function extractTextFromResponses(payload) {
  if (!payload) return "";

  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  if (Array.isArray(payload.output)) {
    for (const item of payload.output) {
      if (item.type === "message" && Array.isArray(item.content)) {
        for (const block of item.content) {
          if (
            (block.type === "output_text" || block.type === "input_text") &&
            typeof block.text === "string" &&
            block.text.trim().length
          ) {
            return block.text.trim();
          }
        }
      }
    }
  }

  return "";
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
      text,          // original draft text
      notes,         // rewrite instructions
      scenario,
      versionType,
      model,
      publicSearch,
      maxWords,
    } = req.body || {};

    const baseText =
      typeof text === "string" && text.trim().length
        ? text.trim()
        : "";

    if (!baseText) {
      return res
        .status(400)
        .json({ error: "Original draft text is required to rewrite." });
    }

    const safeNotes =
      typeof notes === "string" && notes.trim().length
        ? notes.trim()
        : "";

    if (!safeNotes) {
      return res
        .status(400)
        .json({ error: "Rewrite instructions are required." });
    }

    const safeScenario = typeof scenario === "string" ? scenario : "generic";

    // Word-limit prompting: soft guidance + ceiling
    let lengthGuidance = "";
    let suggestedMaxTokens = 1024;

    if (typeof maxWords === "number" && maxWords > 0) {
      const rounded = Math.max(50, Math.round(maxWords));
      const approxTokens = approximateTokensFromWords(rounded);
      suggestedMaxTokens = approxTokens
        ? Math.min(approxTokens + 200, 2500)
        : 1200;

      lengthGuidance =
        `Target length: around ${rounded} words (soft ceiling). ` +
        `Do not exceed ${rounded} words by more than ~10–15%. ` +
        `If you can answer fully in fewer words, prefer being concise.`;
    } else {
      lengthGuidance =
        "Write a clear, well-structured draft. Be concise but complete.";
      suggestedMaxTokens = 1200;
    }

    const resolvedModel =
      typeof model === "string" && model.trim().length > 0
        ? model.trim()
        : "gpt-4.1-mini";

    // SYSTEM PROMPT
    const baseSystemPrompt = [
      "You are a senior private-markets editor.",
      "You revise and improve existing drafts while preserving factual accuracy.",
      "",
      "Key behaviours:",
      "- Preserve all verifiable facts from the original text unless instructed otherwise.",
      "- Improve clarity, flow, and structure.",
      "- Maintain a neutral, professional tone.",
      "- Respect the requested scenario and version type.",
      "",
      "Compliance:",
      "- Avoid introducing forward-looking or speculative statements unless clearly requested",
      "  and clearly labelled.",
      "- Do not cherry-pick information that would distort the balance of the original text.",
    ].join("\n");

    const systemPrompt = publicSearch
      ? [
          baseSystemPrompt,
          "",
          "Web search behaviour:",
          "- You have access to a web_search tool to retrieve up-to-date, public information.",
          "- Use it to enrich context (e.g., company background, sector context) *only* where it",
          "  helps clarify or strengthen the draft and does not contradict the original text.",
          "- If public information conflicts with the draft, prioritise the original text unless",
          "  the conflict is material and can be neutrally described.",
        ].join("\n")
      : baseSystemPrompt;

    // USER PROMPT
    const userLines = [];

    userLines.push(`SCENARIO (for context):\n${safeScenario}`);
    userLines.push(
      `VERSION TYPE:\n${
        versionType === "public"
          ? "Public / externally safe version"
          : "Complete internal version"
      }`
    );

    userLines.push(`ORIGINAL DRAFT TEXT:\n${baseText}`);
    userLines.push(`REWRITE INSTRUCTIONS:\n${safeNotes}`);

    if (lengthGuidance) {
      userLines.push(`LENGTH GUIDANCE:\n${lengthGuidance}`);
    }

    userLines.push(
      [
        "TASK:",
        "- Rewrite the original draft according to the instructions.",
        "- Preserve factual content unless the instructions explicitly request changes.",
        "- Do not include meta commentary about the rewriting process.",
      ].join("\n")
    );

    const userPrompt = userLines.join("\n\n");
    const useWebSearch = !!publicSearch;

    let rewrittenText = "";
    let usedModel = resolvedModel;

    if (useWebSearch) {
      // ---- Branch A: Responses API + web_search -------------------
      const response = await client.responses.create({
        model: resolvedModel,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: systemPrompt,
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: userPrompt,
              },
            ],
          },
        ],
        tools: [
          {
            type: "web_search",
          },
        ],
        max_output_tokens: suggestedMaxTokens || 2048,
        temperature: 0.2,
      });

      rewrittenText = extractTextFromResponses(response);
      usedModel = response.model || resolvedModel;
    } else {
      // ---- Branch B: Chat Completions only ------------------------
      const completion = await client.chat.completions.create({
        model: resolvedModel,
        temperature: 0.2,
        max_completion_tokens: suggestedMaxTokens || 2048,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });

      rewrittenText =
        completion.choices?.[0]?.message?.content?.trim() || "";
      usedModel = completion.model || resolvedModel;
    }

    if (!rewrittenText) {
      console.error("Rewrite: model returned empty content");
      return res
        .status(500)
        .json({ error: "Model returned empty rewrite text." });
    }

    // Simple length-based score fallback
    const lengthScore = (() => {
      const len = rewrittenText.length;
      if (len < 400) return 60;
      if (len < 800) return 70;
      if (len < 1200) return 80;
      if (len < 2000) return 90;
      return 95;
    })();

    return res.status(200).json({
      text: rewrittenText,
      model: usedModel,
      score: lengthScore,
    });
  } catch (err) {
    console.error("Error in /api/rewrite:", err);
    return res.status(500).json({
      error: "Failed to rewrite draft",
      details: err?.response?.data || err?.message || String(err),
    });
  }
}
