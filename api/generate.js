// api/generate.js

import OpenAI from "openai";
import { PROMPT_RECIPES } from "../helpers/promptRecipes.js";
import { fillTemplate } from "../helpers/template.js";
import {
  DEFAULT_STYLE_GUIDE,
  // SAMPLE_CLIENT_STYLE_GUIDE, // not used yet, but kept for future multi-client support
} from "../helpers/styleGuides.js";

const BASE_STYLE_GUIDE = DEFAULT_STYLE_GUIDE;

// --- Scenario-specific guidance -----------------------------------
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

  fund_capital_call: `
Treat this as a capital call at the fund level.
- Emphasise the main use(s) of proceeds.
- Describe the key underlying transaction(s) or investments funded.
- Keep language neutral and aligned with the STYLE GUIDE.
  `,

  fund_distribution: `
Treat this as a distribution from a fund.
- Emphasise the largest source of funds driving the distribution.
- If there are multiple sources, name the largest and qualify with "among others" when appropriate.
- Keep language neutral and aligned with the STYLE GUIDE.
  `,

  default: `
Write clear, concise, fact-based commentary aligned with the given scenario.
- Follow the STYLE GUIDE exactly.
- Keep the tone neutral and professional.
- Do not invent facts or rationales that are not supported by the source material.
  `,
};

// --- OpenAI client ------------------------------------------------
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// --- CORS helper --------------------------------------------------
function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";

  // For the prototype, be permissive so frontend + localhost both work
  res.setHeader(
    "Access-Control-Allow-Origin",
    origin === "null" ? "*" : origin
  );
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  // You can keep credentials if you want, but not strictly needed now:
  // res.setHeader("Access-Control-Allow-Credentials", "true");
}

// --- Helpers ------------------------------------------------------

// Enforce currency formatting (very simple normaliser for now)
function normalizeCurrencies(text) {
  return text
    .replace(/\$([0-9])/g, "USD $1")
    .replace(/€([0-9])/g, "EUR $1")
    .replace(/£([0-9])/g, "GBP $1");
}

// Softer word limit: keep whole sentences where possible
function enforceWordLimit(text, maxWords) {
  if (!maxWords || maxWords <= 0) return text;

  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;

  const sentences = text.match(/[^.!?]+[.!?]+/g);
  if (!sentences) {
    // Fall back to a hard cut if we can't detect sentences
    return words.slice(0, maxWords).join(" ");
  }

  let rebuilt = "";
  for (const s of sentences) {
    const currentWordCount = rebuilt.split(/\s+/).filter(Boolean).length;
    const sentenceWords = s.split(/\s+/).length;
    if (currentWordCount + sentenceWords > maxWords) break;
    rebuilt += s.trim() + " ";
  }

  const trimmed = rebuilt.trim();
  return trimmed || words.slice(0, maxWords).join(" ");
}

// Temporary scoring stub – shape matches what the frontend expects
async function scoreOutput() {
  return {
    overall: 85,
    clarity: 0.8,
    accuracy: 0.75,
    tone: 0.8,
    structure: 0.78,
  };
}

// --- Handler ------------------------------------------------------

export default async function handler(req, res) {
  // Always set CORS headers
  setCorsHeaders(req, res);

  // Handle preflight
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
      workspaceMode = "generic",
      scenario = "default",
      versionType = "complete", // "complete" or "public"
      modelId = "gpt-4o-mini",
      temperature = 0.3,
      maxTokens = 2048,
      maxWords, // optional soft word limit from the frontend
    } = req.body || {};

    if (!text) {
      return res.status(400).json({ error: "Missing text" });
    }

    if (!Array.isArray(selectedTypes) || selectedTypes.length === 0) {
      return res.status(400).json({ error: "No output types selected" });
    }

    const numericMaxWords =
      typeof maxWords === "number"
        ? maxWords
        : parseInt(maxWords, 10) || 0;

    const styleGuide = BASE_STYLE_GUIDE;
    const promptPack = PROMPT_RECIPES[workspaceMode] || PROMPT_RECIPES.generic;

    const outputs = [];

    for (const outputType of selectedTypes) {
      const template =
        promptPack.templates[outputType] ||
        promptPack.templates.press_release;

      const userPromptBase = fillTemplate(template, {
        title,
        notes,
        text,
        scenario,
        versionType,
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
This is a PUBLIC-FACING version:
- Base all statements primarily on information that is publicly available.
- If some details from internal sources are used, ensure they are not highly sensitive and are phrased at a high, non-specific level.
- When in doubt, prefer omission or very general wording over specific, non-public metrics.`
          : `
This is a COMPLETE / INTERNAL version:
- Follow the full brief, and incorporate all relevant, non-sensitive details from the source material.
- You may use internal details as long as they are not explicitly flagged as highly sensitive.`;

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
        "Apply ALL formatting rules consistently, even when the source does not." +
        "\n\nSTYLE GUIDE:\n" +
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

      // Normalise currency formatting and apply word limit
      output = normalizeCurrencies(output);
      output = enforceWordLimit(output, numericMaxWords);

      const scoring = await scoreOutput({
        outputText: output,
        scenario,
        outputType,
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
