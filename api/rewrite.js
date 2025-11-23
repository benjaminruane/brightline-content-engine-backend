// api/rewrite.js

import OpenAI from "openai";
import { PROMPT_RECIPES } from "../helpers/promptRecipes.js";
import { fillTemplate } from "../helpers/template.js";
import { DEFAULT_STYLE_GUIDE } from "../helpers/styleGuides.js";

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
Treat this as a new direct investment transaction.
- Focus on describing the company, what it does, and key operational highlights.
- Explain the investment thesis and why Partners Group was attracted to the opportunity.
- Mention whether it is a lead, joint, or co-investment if that information is available.
- Avoid discussing exits or portfolio performance; stay focused on the entry transaction context.
  `,
  new_fund_commitment: `
Treat this as a new commitment to a fund or program.
- Describe the fund’s strategy, target sectors, and stage.
- Summarise the rationale for committing to this fund (team, track record, access, differentiation).
- Keep commentary neutral, factual, and aligned with the STYLE GUIDE.
  `,
  exit_realisation: `
Treat this as a realisation or exit of an existing investment.
- Describe what happened in the transaction (e.g., full exit, partial sale, recapitalisation).
- Provide concise context on the asset and holding period if available.
- Focus on drivers of value creation that are explicitly supported by the source material.
- Avoid disclosing sensitive or non-public valuation or return metrics.
  `,
  revaluation: `
Treat this as a valuation update for an existing investment.
- Describe the asset briefly and the key drivers of the valuation movement (if given).
- Focus on operational or market factors mentioned in the source material.
- Avoid speculating about performance or outlook beyond the evidence provided.
  `,
  default: `
Write clear, concise, fact-based commentary aligned with the given scenario.
- Follow the STYLE GUIDE exactly.
- Keep the tone neutral and professional.
- Do not invent facts or rationales that are not supported by the source material.
  `,
};

// Temporary scoring stub – matches shape expected by the frontend.
async function scoreOutput() {
  return {
    overall: 85,
    clarity: 0.8,
    accuracy: 0.75,
    tone: 0.8,
    structure: 0.78,
  };
}

// Normalise currency symbols → codes (basic pass)
function normalizeCurrencies(text) {
  return text
    .replace(/\$([0-9])/g, "USD $1")
    .replace(/€([0-9])/g, "EUR $1")
    .replace(/£([0-9])/g, "GBP $1");
}

// Soft word limit that keeps whole sentences where possible
function enforceWordLimit(text, maxWords) {
  if (!maxWords || maxWords <= 0) return text;

  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;

  const sentences = text.match(/[^.!?]+[.!?]+/g);
  if (!sentences) return words.slice(0, maxWords).join(" ");

  let rebuilt = "";
  for (const s of sentences) {
    const currentCount = rebuilt.split(/\s+/).filter(Boolean).length;
    const sentenceWords = s.split(/\s+/).length;
    if (currentCount + sentenceWords > maxWords) break;
    rebuilt += s.trim() + " ";
  }

  return rebuilt.trim() || words.slice(0, maxWords).join(" ");
}

export default async function handler(req, res) {
  // Set CORS headers on every request
  setCorsHeaders(req, res);

  // Handle preflight OPTIONS
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
    } = req.body || {};

    // Lazily create OpenAI client so OPTIONS preflight doesn’t depend on env
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Missing text" });
    }


    const numericMaxWords =
      typeof maxWords === "number" ? maxWords : parseInt(maxWords, 10) || 0;

    const promptPack = PROMPT_RECIPES.generic;
    const template =
      promptPack.templates[outputType] || promptPack.templates.press_release;

    const styleGuide = BASE_STYLE_GUIDE;

    const baseFilled = fillTemplate(template, {
      title: "",
      notes,
      text, // existing draft text
      scenario,
    });

    const scenarioExtra =
      SCENARIO_INSTRUCTIONS[scenario] || SCENARIO_INSTRUCTIONS.default;

    const lengthGuidance =
      numericMaxWords > 0
        ? `\nLength guidance:\n- Aim for no more than approximately ${numericMaxWords} words.\n`
        : "";

    const versionGuidance =
      versionType === "public"
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
      rewriteFrame;

    const systemPrompt =
      promptPack.systemPrompt +
      "\n\nYou must follow the STYLE GUIDE strictly. " +
      "If the text uses symbols (e.g., $, €, £), rewrite them into the proper currency code " +
      "(e.g., USD, EUR, GBP). " +
      "Apply ALL formatting rules consistently, even when they were not followed in the original draft.\n" +
      "Numbers from one to eleven should usually be spelled out; use numerals for twelve and above, " +
      "unless doing so would clearly reduce clarity in a technical context.\n\n" +
      "STYLE GUIDE:\n" +
      styleGuide;

    const completion = await client.chat.completions.create({
      model: modelId,
      temperature,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

        const firstChoice =
      completion && completion.choices && completion.choices.length > 0
        ? completion.choices[0]
        : null;

    let output =
      firstChoice &&
      firstChoice.message &&
      typeof firstChoice.message.content === "string"
        ? firstChoice.message.content.trim()
        : "[No content returned]";

    output = normalizeCurrencies(output);
    output = enforceWordLimit(output, numericMaxWords);

    const scoring = await scoreOutput({
      outputText: output,
      scenario,
      outputType,
      versionType,
    });

    return res.status(200).json({
      outputs: [
        {
          outputType,
          text: output,
          score: scoring.overall,
          metrics: {
            clarity: scoring.clarity,
            accuracy: scoring.accuracy,
            tone: scoring.tone,
            structure: scoring.structure,
          },
        },
      ],
      scenario,
      versionType,
    });
  } catch (err) {
    console.error("Error in /api/rewrite:", err);
    return res.status(500).json({
      error: "Internal server error",
      detail: err.message || String(err),
    });
  }
}
