// api/rewrite.js

import OpenAI from "openai";
import { PROMPT_RECIPES } from "../helpers/promptRecipes.js";
import { fillTemplate } from "../helpers/template.js";
import { DEFAULT_STYLE_GUIDE } from "../helpers/styleGuides.js";
import { scoreOutput } from "../helpers/scoring.js";

const BASE_STYLE_GUIDE = DEFAULT_STYLE_GUIDE;

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

const SCENARIO_INSTRUCTIONS = {
  new_investment: `
Rewrite as a new direct investment transaction.
- Preserve factual details but improve clarity and flow.
- Maintain neutral, institutional tone.
  `,
  new_fund_commitment: `
Rewrite as a fund commitment summary.
- Clarify strategy, rationale and key differentiators.
- Keep wording neutral and aligned with STYLE GUIDE.
  `,
  exit_realisation: `
Rewrite as a realisation / exit commentary.
- Clearly describe what happened and key value drivers stated in the draft.
  `,
  revaluation: `
Rewrite as a valuation update.
- Preserve factual drivers of valuation movement.
- Keep speculative language out.
  `,
  default: `
Rewrite for clarity, structure and tone while preserving factual content.
  `
};

// Currency normaliser
function normalizeCurrencies(text) {
  return text
    .replace(/\$([0-9])/g, "USD $1")
    .replace(/€([0-9])/g, "EUR $1")
    .replace(/£([0-9])/g, "GBP $1");
}

// Soft word limit
function enforceWordLimit(text, maxWords) {
  if (!maxWords || maxWords <= 0) return text;

  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;

  const sentences = text.match(/[^.!?]+[.!?]+/g);
  if (!sentences) return words.slice(0, maxWords).join(" ");

  let rebuilt = "";
  for (let i = 0; i < sentences.length; i += 1) {
    const s = sentences[i];
    const currentCount = rebuilt.split(/\s+/).filter(Boolean).length;
    const sentenceWords = s.split(/\s+/).length;
    if (currentCount + sentenceWords > maxWords) break;
    rebuilt += s.trim() + " ";
  }

  return rebuilt.trim() || words.slice(0, maxWords).join(" ");
}

// --- Handler ------------------------------------------------------

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
      outputType,
      scenario,
      versionType,
      modelId,
      temperature,
      maxTokens,
      maxWords
    } = req.body || {};

    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Missing text" });
    }

    const outType = outputType || "transaction_text";
    const scenarioKey = scenario || "default";
    const verType = versionType || "complete";
    const model = modelId || "gpt-4o-mini";
    const temp = typeof temperature === "number" ? temperature : 0.3;
    const maxTok = typeof maxTokens === "number" ? maxTokens : 2048;
    const numericMaxWords =
      typeof maxWords === "number"
        ? maxWords
        : parseInt(maxWords, 10) || 0;

    const promptPack = PROMPT_RECIPES.generic;
    const template =
      promptPack.templates[outType] || promptPack.templates.press_release;

    const styleGuide = BASE_STYLE_GUIDE;

    const baseFilled = fillTemplate(template, {
      title: "",
      notes,
      text,
      scenario: scenarioKey
    });

    const scenarioExtra =
      SCENARIO_INSTRUCTIONS[scenarioKey] ||
      SCENARIO_INSTRUCTIONS.default;

    const lengthGuidance =
      numericMaxWords > 0
        ? "\nLength guidance:\n- Aim for no more than approximately " +
          numericMaxWords +
          " words.\n"
        : "";

    const versionGuidance =
      verType === "public"
        ? `
Public-facing version guidance:
- Treat this as a public summary. Prefer information that is clearly public.
- If some details in the existing draft look internal or sensitive, you may soften or omit them.
- Favour high-level, qualitative wording and avoid granular internal metrics where there is any doubt.`
        : `
Internal "complete" version guidance:
- You may preserve or enhance internal detail where it helps clarity.
- Keep everything aligned with the WRITING GUIDELINES and a professional, client-facing tone.`;

    const rewriteFrame = `
You are rewriting an existing draft for the same scenario and output type.

Rewrite the draft text below to:
- Apply the user's rewrite instructions.
- Preserve factual content that is supported by the original draft.
- Improve clarity, tone, and flow while following the STYLE GUIDE.
- Keep the structure broadly similar unless the instructions request otherwise.

User rewrite instructions (if any):
${notes || "(none provided)"}

Existing draft to rewrite:
"""${text}"""
`;

    const userPrompt =
      baseFilled +
      "\n\nScenario-specific guidance:\n" +
      scenarioExtra.trim() +
      "\n" +
      versionGuidance +
      "\n" +
      lengthGuidance +
      "\n" +
      rewriteFrame;

    const systemPrompt =
      promptPack.systemPrompt +
      "\n\nYou must follow the STYLE GUIDE strictly. " +
      "If the text uses symbols (e.g., $, €, £), rewrite them into the proper currency code " +
      "(e.g., USD, EUR, GBP). " +
      "Apply ALL formatting rules consistently, even when they were not followed in the original draft.\n\n" +
      "STYLE GUIDE:\n" +
      styleGuide;

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const completion = await client.chat.completions.create({
      model,
      temperature: temp,
      max_tokens: maxTok,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    });

    let firstChoice = null;
    if (
      completion &&
      completion.choices &&
      Array.isArray(completion.choices) &&
      completion.choices.length > 0
    ) {
      firstChoice = completion.choices[0];
    }

    let output = "[No content returned]";
    if (
      firstChoice &&
      firstChoice.message &&
      typeof firstChoice.message.content === "string"
    ) {
      output = firstChoice.message.content.trim();
    }

    output = normalizeCurrencies(output);
    output = enforceWordLimit(output, numericMaxWords);

    const scoring = await scoreOutput({
      outputText: output,
      scenario: scenarioKey,
      outputType: outType,
      versionType: verType
    });

    return res.status(200).json({
      outputs: [
        {
          outputType: outType,
          text: output,
          score: scoring.overall,
          metrics: {
            clarity: scoring.clarity,
            accuracy: scoring.accuracy,
            tone: scoring.tone,
            structure: scoring.structure
          }
        }
      ],
      scenario: scenarioKey,
      versionType: verType
    });
  } catch (err) {
    console.error("Error in /api/rewrite:", err);
    return res.status(500).json({
      error: "Internal server error",
      detail: err && err.message ? err.message : String(err)
    });
  }
}
