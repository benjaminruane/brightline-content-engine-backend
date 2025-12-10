// /api/rewrite.js
//
// Rewrites an existing draft based on instructions, preserving core meaning.

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

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  try {
    const {
      text,
      notes,
      scenario,
      versionType,
      maxWords,
      model,
      publicSearch,
    } = req.body || {};

    if (!text || typeof text !== "string" || !text.trim()) {
      return res
        .status(400)
        .json({ error: "Base draft text is required for rewrite." });
    }

    const safeScenario = typeof scenario === "string" ? scenario : "generic";
    const safeNotes = typeof notes === "string" ? notes.trim() : "";

    const resolvedModel =
      typeof model === "string" && model.trim().length > 0
        ? model.trim()
        : "gpt-4.1-mini";

    const versionHint =
      versionType === "public"
        ? "Produce a public / externally safe version (avoid confidential details)."
        : "Produce a complete internal version (you may include internal detail that appears in the original).";

    const maxWordsHint =
      typeof maxWords === "number" && maxWords > 0
        ? `Target length: around ${maxWords} words (soft ceiling).`
        : "No strict length limit; be concise but complete.";

    const systemPrompt =
      "You are an assistant that rewrites investment-style text.\n" +
      "- Preserve the core meaning and key facts.\n" +
      "- Apply the rewrite instructions carefully.\n" +
      `- Scenario: ${safeScenario}.\n` +
      `- ${versionHint}\n` +
      `- ${maxWordsHint}\n` +
      "- Style rules:\n" +
      "  - For money amounts, prefer formats like 'USD 10 million' instead of '$10m' or 'USD 10m'.\n" +
      "  - Spell out 'million' and 'billion' in full; avoid using 'm' or 'bn' suffixes.\n" +
      "  - Use ISO currency codes (e.g. USD, EUR, GBP) instead of symbols ($, €, £) where appropriate.\n" +
      "- Do not include headings like 'Rewrite:' or meta commentary.";

    const userParts = [];

    userParts.push("ORIGINAL DRAFT:\n" + text.trim());

    if (safeNotes) {
      userParts.push("REWRITE INSTRUCTIONS:\n" + safeNotes);
    }

    if (typeof maxWords === "number" && maxWords > 0) {
      userParts.push(
        `WORD COUNT GUIDANCE:\nAim for around ${maxWords} words, with a soft ceiling.`
      );
    }

    userParts.push(
      [
        "TASK:",
        "- Produce a single, fully rewritten version of the draft.",
        "- Preserve the factual content but improve clarity, flow and readability.",
        "- Do not include any explanations of what you changed.",
      ].join("\n")
    );

    const userPrompt = userParts.join("\n\n");

    const suggestedMaxTokens = (() => {
      if (typeof maxWords === "number" && maxWords > 0) {
        const approxTokens = approximateTokensFromWords(maxWords);
        return approxTokens ? Math.min(approxTokens + 200, 2500) : 1200;
      }
      return 1200;
    })();

    const completion = await client.chat.completions.create({
      model: resolvedModel,
      temperature: 0.3,
      max_completion_tokens: suggestedMaxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const newText =
      completion.choices?.[0]?.message?.content?.trim() || "";

    if (!newText) {
      console.error("OpenAI rewrite returned empty content:", completion);
      return res
        .status(500)
        .json({ error: "Model returned empty rewrite text." });
    }

    const score = (() => {
      const len = newText.length;
      if (len < 400) return 60;
      if (len < 800) return 70;
      if (len < 1200) return 80;
      if (len < 2000) return 90;
      return 95;
    })();

    return res.status(200).json({
      text: newText,
      score,
      model: resolvedModel,
      scenario: safeScenario,
      versionType: versionType || "complete",
    });
  } catch (err) {
    console.error("Error in /api/rewrite:", err);
    return res.status(500).json({
      error: "Failed to rewrite draft",
      details: err?.response?.data || err?.message || String(err),
    });
  }
}

// --- Helpers -------------------------------------------------------------

function approximateTokensFromWords(wordCount) {
  if (!wordCount || typeof wordCount !== "number") return null;
  return Math.round(wordCount / 0.75);
}
