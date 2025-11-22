// api/generate.js

import OpenAI from "openai";
import { PROMPT_RECIPES } from "../helpers/promptRecipes.js";
import { fillTemplate } from "../helpers/template.js";
import {
  DEFAULT_STYLE_GUIDE,
  SAMPLE_CLIENT_STYLE_GUIDE,
} from "../helpers/styleGuides.js";

const BASE_STYLE_GUIDE = DEFAULT_STYLE_GUIDE;

// Scenario-specific extra guidance
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

"https://content-engine-frontend-gilt.vercel.app",

// Simple scoring stub so the frontend has something to display
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

  // Handle preflight OPTIONS request
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      title,
      notes,
      text,
      selectedTypes = [],
      workspaceMode = "generic", // reserved for later multi-client support
      scenario = "default",
      versionType = "complete", // "complete" | "public"
      modelId = "gpt-4o-mini",
      temperature = 0.3,
      maxTokens = 2048,
      maxWords, // optional soft word limit from the frontend
      publicSearch, // currently unused but kept for future roadmap
    } = req.body || {};

    if (!text) {
      return res.status(400).json({ error: "Missing text" });
    }

    if (!Array.isArray(selectedTypes) || selectedTypes.length === 0) {
      return res.status(400).json({ error: "No output types selected" });
    }

    const numericMaxWords =
      typeof maxWords === "number" ? maxWords : parseInt(maxWords, 10) || 0;

    const styleGuide = BASE_STYLE_GUIDE;
    const promptPack = PROMPT_RECIPES.generic;

    const outputs = [];

    for (const outputType of selectedTypes) {
      const template =
        promptPack.templates[outputType] || promptPack.templates.press_release;

      const userPromptBase = fillTemplate(template, {
        title,
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

      // Version-specific guidance (Complete vs Public)
      const versionGuidance =
        versionType === "public"
          ? `
Public-facing version guidance:
- Base the draft primarily on information that is clearly public (e.g. official press releases, company websites, widely reported facts).
- If a fact appears only in internal material, you may include it if it is clearly non-sensitive and high-level, but avoid anything granular, proprietary, or commercially delicate.
- Prefer qualitative or approximate wording over precise internal figures where there is any doubt.
- When in doubt, favour brevity and high-level descriptions over detail.`
          : `
Internal "complete" version guidance:
- You may rely fully on the internal source documents.
- It is acceptable to include internal figures and detail, provided they are aligned with the WRITING GUIDELINES and not unnecessarily sensitive.
- Write for a sophisticated, client-facing internal audience and prioritise clarity and completeness over brevity.`;

      const userPrompt =
        userPromptBase +
        "\n\nScenario-specific guidance:\n" +
        scenarioExtra.trim() +
        "\n" +
        versionGuidance +
        "\n" +
        lengthGuidance;

      const systemPrompt =
        promptPack.systemPrompt +
        "\n\nYou must follow the STYLE GUIDE strictly. " +
        "If the source uses symbols (e.g., $, €, £), rewrite them into the proper currency code " +
        "(e.g., USD, EUR, GBP). " +
        "Apply ALL formatting rules consistently, even when the source does not.\n" +
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

      let output =
        completion.choices?.[0]?.message?.content?.trim() ||
        "[No content returned]";

      // Style clean-up passes
      output = normalizeCurrencies(output);
      output = enforceWordLimit(output, numericMaxWords);

      const scoring = await scoreOutput({
        outputText: output,
        scenario,
        outputType,
        versionType,
      });

      outputs.push({
        outputType,
        text: output,
        score: scoring.overall,
        metrics: {
          clarity: scoring.clarity,
          accuracy: scoring.accuracy,
          tone: scoring.tone,
          structure: scoring.structure,
        },
      });
    }

    return res.status(200).json({
      outputs,
      scenario,
      versionType,
    });
  } catch (err) {
    console.error("Error in /api/generate:", err);
    return res.status(500).json({
      error: "Internal server error",
      detail: err.message || String(err),
    });
  }
}
