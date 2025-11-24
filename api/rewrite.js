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

// Scenario guidance (same idea as generate)
const SCENARIO_INSTRUCTIONS = {
  new_investment:
    "Rewrite as an entry transaction (new investment) with neutral tone and clear statement of thesis.",
  new_fund_commitment:
    "Rewrite as a fund commitment summary, explaining strategy and rationale.",
  exit_realisation:
    "Rewrite as an exit / realisation note, focusing on what happened and main value drivers mentioned.",
  revaluation:
    "Rewrite as a valuation update, keeping explanations tied to the source.",
  default:
    "Rewrite for clarity, structure and tone while keeping facts from the original draft."
};

// Scoring stub
async function scoreOutput() {
  return {
    overall: 85,
    clarity: 0.8,
    accuracy: 0.75,
    tone: 0.8,
    structure: 0.78
  };
}

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
        ? "Length guidance:\n- Aim for no more than approximately " +
          numericMaxWords +
          " words.\n"
        : "";

    const versionGuidance =
      verType === "public"
        ? "Public-facing version. Prefer clearly public information and soften or omit sensitive detail."
        : "Internal complete version. You may preserve internal detail where appropriate, keeping tone professional.";

    const rewriteFrame =
      "You are rewriting an existing draft.\n\n" +
      "User rewrite instructions (if any):\n" +
      (notes || "(none provided)") +
      "\n\nExisting draft:\n\"\"\"" +
      text +
      "\"\"\"";

    const userPrompt =
      baseFilled +
      "\n\nScenario-specific guidance:\n" +
      scenarioExtra +
      "\n\n" +
      versionGuidance +
      "\n\n" +
      lengthGuidance +
      "\n\n" +
      rewriteFrame;

    const systemPrompt =
      promptPack.systemPrompt +
      "\n\nFollow the STYLE GUIDE strictly.\n" +
      "Rewrite currency symbols as codes (USD, EUR, GBP).\n\n" +
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
