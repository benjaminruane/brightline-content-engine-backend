// api/generate.js

import OpenAI from "openai";
import { PROMPT_RECIPES } from "../helpers/promptRecipes.js";
import { fillTemplate } from "../helpers/template.js";
import { DEFAULT_STYLE_GUIDE } from "../helpers/styleGuides.js";

const BASE_STYLE_GUIDE = DEFAULT_STYLE_GUIDE;

// --- Scenario-specific guidance -----------------------------------
const SCENARIO_INSTRUCTIONS = {
  new_investment:
    "Treat this as a new direct investment transaction. Focus on what the company does, key operational highlights and a concise statement of the investment thesis. Avoid exits/performance commentary.",
  new_fund_commitment:
    "Treat this as a new commitment to a fund or program. Describe strategy, sectors, stage and why the commitment was made. Keep wording neutral and institutional.",
  exit_realisation:
    "Treat this as an exit or realisation. Describe the transaction (full or partial), basic holding context and the main value-creation drivers mentioned in the source. No speculative returns.",
  revaluation:
    "Treat this as a valuation update. Briefly describe the asset and the drivers of the valuation movement, based only on the source material.",
  fund_capital_call:
    "Treat this as a capital call. Emphasise the uses of proceeds and underlying transactions being funded.",
  fund_distribution:
    "Treat this as a distribution. Emphasise the main sources of funds and keep wording neutral and factual.",
  default:
    "Write clear, concise, fact-based commentary aligned with the given scenario. Follow the style guide and keep the tone neutral and professional."
};

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

// --- Helpers ------------------------------------------------------

// Currency normaliser (very basic)
function normalizeCurrencies(text) {
  return text
    .replace(/\$([0-9])/g, "USD $1")
    .replace(/€([0-9])/g, "EUR $1")
    .replace(/£([0-9])/g, "GBP $1");
}

// Soft word limit: keep whole sentences where possible
function enforceWordLimit(text, maxWords) {
  if (!maxWords || maxWords <= 0) return text;

  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;

  const sentences = text.match(/[^.!?]+[.!?]+/g);
  if (!sentences) {
    return words.slice(0, maxWords).join(" ");
  }

  let rebuilt = "";
  for (let i = 0; i < sentences.length; i += 1) {
    const s = sentences[i];
    const currentCount = rebuilt.split(/\s+/).filter(Boolean).length;
    const sentenceWords = s.split(/\s+/).length;
    if (currentCount + sentenceWords > maxWords) break;
    rebuilt += s.trim() + " ";
  }

  const trimmed = rebuilt.trim();
  return trimmed || words.slice(0, maxWords).join(" ");
}

// Simple scoring stub matching frontend shape
async function scoreOutput() {
  return {
    overall: 85,
    clarity: 0.8,
    accuracy: 0.75,
    tone: 0.8,
    structure: 0.78
  };
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
      title,
      notes,
      text,
      selectedTypes,
      workspaceMode,
      scenario,
      versionType,
      modelId,
      temperature,
      maxTokens,
      maxWords
    } = req.body || {};

    if (!text) {
      return res.status(400).json({ error: "Missing text" });
    }

    const typesArray =
      Array.isArray(selectedTypes) && selectedTypes.length > 0
        ? selectedTypes
        : ["press_release"];

    const wsMode = workspaceMode || "generic";
    const scenarioKey = scenario || "default";
    const verType = versionType || "complete";
    const model = modelId || "gpt-4o-mini";
    const temp = typeof temperature === "number" ? temperature : 0.3;
    const maxTok = typeof maxTokens === "number" ? maxTokens : 2048;

    const numericMaxWords =
      typeof maxWords === "number"
        ? maxWords
        : parseInt(maxWords, 10) || 0;

    const styleGuide = BASE_STYLE_GUIDE;
    const promptPack = PROMPT_RECIPES[wsMode] || PROMPT_RECIPES.generic;

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const outputs = [];

    for (let i = 0; i < typesArray.length; i += 1) {
      const outputType = typesArray[i];

      const template =
        promptPack.templates[outputType] || promptPack.templates.press_release;

      const baseFilled = fillTemplate(template, {
        title: title || "",
        notes,
        text,
        scenario: scenarioKey
      });

      const scenarioExtra =
        SCENARIO_INSTRUCTIONS[scenarioKey] ||
        SCENARIO_INSTRUCTIONS.default;

      const lengthGuidance =
        numericMaxWords > 0
          ? "Length guidance:\n- Aim for no more than approximately " +
            numericMaxWords +
            " words.\n"
          : "";

      const versionGuidance =
        verType === "public"
          ? "This is a PUBLIC-FACING version. Prefer clearly public information and keep sensitive details high-level."
          : "This is a COMPLETE / INTERNAL version. You may include non-sensitive internal detail where it helps clarity.";

      const userPrompt =
        baseFilled +
        "\n\nScenario-specific guidance:\n" +
        scenarioExtra +
        "\n\n" +
        versionGuidance +
        "\n\n" +
        lengthGuidance;

      const systemPrompt =
        promptPack.systemPrompt +
        "\n\nYou must follow the STYLE GUIDE strictly.\n" +
        "Rewrite currency symbols ($, €, £) as proper codes (USD, EUR, GBP).\n\n" +
        "STYLE GUIDE:\n" +
        styleGuide;

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

      let outputText = "[No content returned]";
      if (
        firstChoice &&
        firstChoice.message &&
        typeof firstChoice.message.content === "string"
      ) {
        outputText = firstChoice.message.content.trim();
      }

      outputText = normalizeCurrencies(outputText);
      outputText = enforceWordLimit(outputText, numericMaxWords);

      const scoring = await scoreOutput({
        outputText,
        scenario: scenarioKey,
        outputType,
        versionType: verType
      });

      outputs.push({
        outputType,
        text: outputText,
        score: scoring.overall,
        metrics: {
          clarity: scoring.clarity,
          accuracy: scoring.accuracy,
          tone: scoring.tone,
          structure: scoring.structure
        }
      });
    }

    return res.status(200).json({
      outputs,
      scenario: scenarioKey,
      versionType: verType
    });
  } catch (err) {
    console.error("Error in /api/generate:", err);
    return res.status(500).json({
      error: "Internal server error",
      detail: err && err.message ? err.message : String(err)
    });
  }
}
