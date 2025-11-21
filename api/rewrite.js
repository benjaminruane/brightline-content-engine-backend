// api/rewrite.js

import OpenAI from "openai";
import { PROMPT_RECIPES } from "../helpers/promptRecipes.js";
import { fillTemplate } from "../helpers/template.js";
import { DEFAULT_STYLE_GUIDE } from "../helpers/styleGuides.js";

const BASE_STYLE_GUIDE = DEFAULT_STYLE_GUIDE;

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

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// --- CORS helper -------------------------------------------------

const ALLOWED_ORIGINS = [
  "https://content-engine-frontend-gilt.vercel.app",
  "http://localhost:3000",
];

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
// -----------------------------------------------------------------

// Prototype scoring stub – same as generate.js
async function scoreOutput() {
  return {
    overall: 85,
    clarity: 0.8,
    accuracy: 0.75,
    tone: 0.8,
    structure: 0.78,
  };
}

function normalizeCurrencies(text) {
  if (!text) return text;
  return text
    .replace(/\$([0-9])/g, "USD $1")
    .replace(/€([0-9])/g, "EUR $1")
    .replace(/£([0-9])/g, "GBP $1");
}

function enforceWordLimit(text, maxWords) {
  if (!maxWords || maxWords <= 0 || !text) return text;

  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;

  // Prefer trimming at sentence boundaries
  const sentences = text.match(/[^.!?]+[.!?]+/g);
  if (!sentences) return words.slice(0, maxWords).join(" ");

  let rebuilt = "";
  for (const s of sentences) {
    const countSoFar = rebuilt.split(/\s+/).filter(Boolean).length;
    const sentenceCount = s.split(/\s+/).filter(Boolean).length;
    if (countSoFar + sentenceCount > maxWords) break;
    rebuilt += s.trim() + " ";
  }

  const trimmed = rebuilt.trim();
  return trimmed || words.slice(0, maxWords).join(" ");
}

export default async function handler(req, res) {
  // Set CORS headers
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      text,
      notes,
      outputType = "transaction_text",
      scenario = "default",
      modelId = "gpt-4o-mini",
      temperature = 0.3,
      maxTokens = 2048,
      maxWords,
    } = req.body || {};

    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Missing text" });
    }

    const numericMaxWords =
      typeof maxWords === "number"
        ? maxWords
        : maxWords
        ? parseInt(maxWords, 10) || 0
        : 0;

    const promptPack = PROMPT_RECIPES.generic;

    const template =
      promptPack.templates[outputType] ||
      promptPack.templates.press_release;

    // Use the existing draft as the source material during rewrite
    const baseFilled = fillTemplate(template, {
      title: "",
      notes,
      text,
      scenario,
    });

    const scenarioExtra =
      SCENARIO_INSTRUCTIONS[scenario] || SCENARIO_INSTRUCTIONS.default;

    const lengthGuidance =
      numericMaxWords > 0
        ? `\nLength guidance:\n- Aim for no more than approximately ${numericMaxWords} words.\n`
        : "";

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
      lengthGuidance +
      rewriteFrame;

    const systemPrompt =
      promptPack.systemPrompt +
      "\n\nYou must follow the STYLE GUIDE strictly. " +
      "If the source uses currency symbols (e.g. $, €, £), rewrite them using the correct three-letter currency code " +
      "(e.g. USD, EUR, GBP). Apply ALL formatting rules from the STYLE GUIDE consistently, even when the source does not." +
      "\n\nSTYLE GUIDE:\n" +
      BASE_STYLE_GUIDE;

    const completion = await client.chat.completions.create({
      model: modelId,
      temperature,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    let output =
      completion.choices?.[0]?.message?.content?.trim() ||
      "[No content returned]";

    output = normalizeCurrencies(output);
    output = enforceWordLimit(output, numericMaxWords);

    const scoring = await scoreOutput({
      outputText: output,
      scenario,
      outputType,
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
    });
  } catch (err) {
    console.error("Error in /api/rewrite:", err);
    return res.status(500).json({
      error: "Internal server error",
      detail: err.message || String(err),
    });
  }
}
