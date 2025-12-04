// api/generate.js
//
// Generates a draft AND scores it using the scoreDraft() helper.

import OpenAI from "openai";
import { scoreDraft } from "../utils/scoreDraft.js";

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin === "null" ? "*" : origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
      model: modelId,
      temperature,
      maxWords,
      publicSearch,
      scenario,
      selectedTypes,
      sources,
      title,
      notes,
      versionType,
    } = req.body || {};

    // --------- Build user prompt --------------------------------------------
    const baseSystem =
      "You are an expert content-generation engine for investment materials.";

    const sourceSection = Array.isArray(sources)
      ? sources
          .map((s) => `Source (${s.kind} – ${s.name}):\n${s.text}`)
          .join("\n\n")
      : "";

    const userPrompt = `
TITLE: ${title || "(none)"}

INSTRUCTIONS:
${notes || "(none)"}

SCENARIO: ${scenario}
OUTPUT TYPES: ${selectedTypes?.join(", ")}

VERSION TYPE: ${versionType}
PUBLIC SEARCH: ${publicSearch}

MAX WORDS: ${maxWords || "not specified"}

SOURCES:
${sourceSection}
`;

    // --------- Call OpenAI ---------------------------------------------------
    const completion = await client.chat.completions.create({
      model: modelId || "gpt-4o-mini",
      max_completion_tokens: maxWords ? Number(maxWords) + 200 : 2048,
      temperature: typeof temperature === "number" ? temperature : 0.3,
      messages: [
        { role: "system", content: baseSystem },
        { role: "user", content: userPrompt },
      ],
    });

    const draftText = completion?.choices?.[0]?.message?.content?.trim() || "";

    if (!draftText) {
      console.error("Model returned empty content:", completion);
      return res.status(500).json({ error: "Model returned empty content" });
    }

    // --------- Compute score (heuristic) ------------------------------------
    const score = await scoreDraft(draftText, modelId);

    return res.status(200).json({
      draftText,
      score, // 0–1; frontend converts to % where needed
      model: completion.model,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Error in /api/generate:", err);
    return res.status(500).json({
      error: "Failed to generate draft",
      details: err.message || String(err),
    });
  }
}
