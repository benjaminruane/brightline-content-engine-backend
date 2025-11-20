// api/rewrite.js

import OpenAI from "openai";
import {
  PROMPT_RECIPES,
  SCENARIO_INSTRUCTIONS,
} from "../helpers/promptRecipes.js";
import { fillTemplate } from "../helpers/template.js";
import { BASE_STYLE_GUIDE } from "../helpers/styleGuides.js";
import { scoreOutput } from "../helpers/scoring.js";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      text, // draft to rewrite
      notes, // rewrite instructions
      outputType,
      scenario = "default",
      modelId = "gpt-4o-mini",
      temperature = 0.3,
      maxTokens = 2048,
      maxWords,
    } = req.body || {};

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
    const promptPack = PROMPT_RECIPES.default;

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
