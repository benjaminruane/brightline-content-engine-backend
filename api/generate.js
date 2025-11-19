// api/generate.js

import OpenAI from "openai";
import { PROMPT_RECIPES } from "../helpers/promptRecipes.js";
import { fillTemplate } from "../helpers/template.js";
import {
  DEFAULT_STYLE_GUIDE,
  SAMPLE_CLIENT_STYLE_GUIDE,
} from "../helpers/styleGuides.js";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  // CORS preflight
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
    } = req.body || {};

    if (!text) {
      return res.status(400).json({ error: "Missing text" });
    }

    if (!Array.isArray(selectedTypes) || selectedTypes.length === 0) {
      return res.status(400).json({ error: "No output types selected" });
    }

    const styleGuide =
      workspaceMode === "client"
        ? SAMPLE_CLIENT_STYLE_GUIDE
        : DEFAULT_STYLE_GUIDE;

    const promptPack =
      PROMPT_RECIPES[workspaceMode] || PROMPT_RECIPES.generic;

    const outputs = [];

    for (const outputType of selectedTypes) {
      const template =
        promptPack.templates[outputType] ||
        promptPack.templates.press_release;

      const userPrompt = fillTemplate(template, {
        title,
        notes,
        text,
        scenario,
      });

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

      const output =
        completion.choices?.[0]?.message?.content?.trim() ||
        "[No content returned]";

      const score = Math.round(Math.random() * 20) + 80;

      outputs.push({
        outputType,
        text: output,
        score,
        metrics: {
          clarity: 0.8,
          accuracy: 0.75,
          tone: 0.82,
        },
      });
    }

    return res.status(200).json({
      outputs,
      workspaceMode,
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
