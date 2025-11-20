// api/rewrite.js

import OpenAI from "openai";
import {
  PROMPT_RECIPES,
  SCENARIO_INSTRUCTIONS,
} from "../helpers/promptRecipes.js";
import { fillTemplate } from "../helpers/template.js";
import { BASE_STYLE_GUIDE } from "../helpers/styleGuides.js";

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


import { scoreOutput } from "../helpers/scoring.js";

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


export default async function handler(req, res) {
  // Set CORS headers on every request
  setCorsHeaders(req, res);

  // Handle preflight OPTIONS request
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
      modelId = "gpt-4o-mini",
      temperature = 0.3,
      maxTokens = 2048,
      maxWords,
    } = req.body || {};
    // ...

    if (!text) {
      return res.status(400).json({ error: "Missing draft text to rewrite" });
    }

    if (!outputType) {
      return res.status(400).json({ error: "Missing outputType" });
    }

    const numericMaxWords =
      typeof maxWords === "number"
        ? maxWords
        : parseInt(maxWords, 10) || 0;

    const styleGuide = BASE_STYLE_GUIDE;
    const promptPack = PROMPT_RECIPES.generic;

    const rewriteTemplate = `
You are to improve and refine an existing draft of a {{outputTypeLabel}}.

Scenario: {{scenario}}

Rewrite Requirements:
- Maintain the intent and meaning of the draft.
- Improve clarity, structure, and tone.
- Follow the style guide exactly.
- Respect all user rewrite notes:
  "{{notes}}"

Here is the draft to rewrite:
===================
{{text}}
===================

Produce a refined, professional version of the draft.
`;

    const userPromptBase = fillTemplate(rewriteTemplate, {
      text,
      notes,
      scenario,
      outputTypeLabel: outputType.replace("_", " "),
    });

    const scenarioExtra =
      SCENARIO_INSTRUCTIONS[scenario] || SCENARIO_INSTRUCTIONS.default;

    const lengthGuidance =
      numericMaxWords > 0
        ? `\nLength guidance:\n- Aim for no more than approximately ${numericMaxWords} words.\n`
        : "";

    const userPrompt =
      userPromptBase +
      "\n\nScenario-specific guidance:\n" +
      scenarioExtra.trim() +
      "\n" +
      lengthGuidance;

    const systemPrompt =
      promptPack.systemPrompt + "\n\nSTYLE GUIDE:\n" + styleGuide;

    const completion = await client.chat.completions.create({
      model: modelId,
      temperature,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    let rewritten =
      completion.choices?.[0]?.message?.content?.trim() ||
      "[No content returned]";

    if (numericMaxWords > 0) {
      const words = rewritten.split(/\s+/);
      if (words.length > numericMaxWords) {
        rewritten = words.slice(0, numericMaxWords).join(" ");
      }
    }

    const scoring = await scoreOutput({
      outputText: rewritten,
      scenario,
      outputType,
    });

    return res.status(200).json({
      outputs: [
        {
          outputType,
          text: rewritten,
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
