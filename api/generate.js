// api/generate.js

import OpenAI from "openai";
import { PROMPT_RECIPES } from "../helpers/promptRecipes.js";
import { fillTemplate } from "../helpers/template.js";
import {
  DEFAULT_STYLE_GUIDE,
  SAMPLE_CLIENT_STYLE_GUIDE,
} from "../helpers/styleGuides.js";

const BASE_STYLE_GUIDE = DEFAULT_STYLE_GUIDE;

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
  title,
  notes,
  text,
  selectedTypes = [],
  workspaceMode = "generic",
  scenario = "default",
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
const promptPack = PROMPT_RECIPES.generic;


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

      let output =
        completion.choices?.[0]?.message?.content?.trim() ||
        "[No content returned]";

      // Hard cap the length if maxWords is set
      if (numericMaxWords > 0) {
        const words = output.split(/\s+/);
        if (words.length > numericMaxWords) {
          output = words.slice(0, numericMaxWords).join(" ");
        }
      }

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
    });
  } catch (err) {
    console.error("Error in /api/generate:", err);
    return res.status(500).json({
      error: "Internal server error",
      detail: err.message || String(err),
    });
  }
}
