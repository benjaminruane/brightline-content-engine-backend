// /api/rewrite.js
//
// Rewrites an existing draft based on instructions and house style.

import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

// Approx tokens helper
function approximateTokensFromWords(wordCount) {
  if (!wordCount || typeof wordCount !== "number") return null;
  return Math.round(wordCount / 0.75);
}

// Same house-style helper as generate.js
function applyHouseStyle(text) {
  if (!text || typeof text !== "string") return text;
  let out = text;

  out = out.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");

  out = out.replace(/\$\s?(\d+(?:\.\d+)?)\s?[mM]\b/g, (m, num) => {
    return `USD ${num} million`;
  });

  out = out.replace(/S\$\s?(\d+(?:\.\d+)?)\s?[mM]\b/g, (m, num) => {
    return `SGD ${num} million`;
  });

  out = out.replace(/S\$\s?([\d,.]+)\b/g, (m, num) => {
    return `SGD ${num}`;
  });

  out = out.replace(/[€]\s?(\d+(?:\.\d+)?)\s?[mM]\b/g, (m, num) => {
    return `EUR ${num} million`;
  });

  out = out.replace(/\$\s?([\d,.]+)\b/g, (m, num) => {
    return `USD ${num}`;
  });

  return out;
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
      scenario,
      versionType,
      model,
      publicSearch, // ignored for now
      maxWords,
    } = req.body || {};

    const safeText = typeof text === "string" ? text.trim() : "";
    const safeNotes = typeof notes === "string" ? notes.trim() : "";

    if (!safeText) {
      return res.status(400).json({
        error: "Base draft text is required for rewrite.",
      });
    }

    if (!safeNotes) {
      return res.status(400).json({
        error: "Rewrite instructions are required.",
      });
    }

    const resolvedModel =
      typeof model === "string" && model.trim()
        ? model.trim()
        : "gpt-4.1-mini";

    let lengthGuidance = "";
    let suggestedMaxTokens = 900;

    if (typeof maxWords === "number" && maxWords > 0) {
      const rounded = Math.max(50, Math.round(maxWords));
      const approxTokens = approximateTokensFromWords(rounded);
      suggestedMaxTokens = approxTokens
        ? Math.min(approxTokens + 200, 2200)
        : 1000;

      lengthGuidance =
        `Target rewritten length: around ${rounded} words. ` +
        `If the instructions explicitly say to expand or shorten, obey those instructions first, but try to stay near this length.`;
    } else {
      lengthGuidance =
        "Rewrite for clarity and structure. Keep roughly similar length unless instructions explicitly say otherwise.";
      suggestedMaxTokens = 1200;
    }

    const systemPrompt = [
      "You are revising an investment draft based on instructions from the author.",
      "",
      "HOUSE STYLE (MUST FOLLOW):",
      "- Currency:",
      "  • '$10m' → 'USD 10 million'; 'S$10m' → 'SGD 10 million'; etc.",
      "  • Use currency codes (USD, SGD, EUR...).",
      "- Numbers:",
      "  • Use normal thousand separators for big numbers where useful.",
      "  • Never use separators in calendar years (e.g. '2025').",
      "- Punctuation:",
      "  • Use straight quotes \"\" not curly quotes.",
      "",
      "Rewrite goals:",
      "- Obey the author's rewrite instructions exactly.",
      "- Preserve factual content from the original draft unless instructions say otherwise.",
      "- You may re-order and tighten the text.",
      "- Maintain professional, neutral tone.",
    ].join("\n");

    const userPrompt = [
      "ORIGINAL DRAFT:",
      safeText,
      "",
      "REWRITE INSTRUCTIONS FROM AUTHOR:",
      safeNotes,
      "",
      lengthGuidance,
      "",
      "TASK:",
      "- Produce the full rewritten draft text.",
      "- Apply the house style rules strictly.",
      "- Do not explain what you changed – return only the rewritten draft.",
    ].join("\n\n");

    const completion = await client.chat.completions.create({
      model: resolvedModel,
      temperature: 0.25,
      max_completion_tokens: suggestedMaxTokens || 1800,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    let rewritten =
      completion.choices?.[0]?.message?.content?.trim() || "";

    if (!rewritten) {
      console.error("Rewrite completion empty:", completion);
      return res
        .status(500)
        .json({ error: "Model returned empty rewrite text." });
    }

    rewritten = applyHouseStyle(rewritten);

    return res.status(200).json({
      text: rewritten,
    });
  } catch (err) {
    console.error("Error in /api/rewrite:", err);
    return res.status(500).json({
      error: "Failed to rewrite draft",
      details: err?.response?.data || err?.message || String(err),
    });
  }
}
