// api/rewrite.js
//
// Rewrites an existing draft AND scores the rewritten version using scoreDraft().

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

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      text,
      notes,
      scenario,
      versionType,
      model: modelId,
      publicSearch,
    } = req.body || {};

    if (!text) {
      return res.status(400).json({ error: "Missing draft text to rewrite." });
    }

    const system =
      "You are an expert editing engine. Apply the rewrite instructions carefully.";

    const userPrompt = `
REWRITE INSTRUCTIONS:
${notes || "(none)"}

SCENARIO: ${scenario}
VERSION TYPE: ${versionType}
PUBLIC SEARCH: ${publicSearch}

TEXT TO REWRITE:
---
${text}
---
`;

    const completion = await client.chat.completions.create({
      model: modelId || "gpt-4o-mini",
      max_completion_tokens: 2048,
      temperature: 0.4,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
    });

    const rewritten = completion?.choices?.[0]?.message?.content?.trim() || "";

    if (!rewritten) {
      return res.status(500).json({ error: "Empty rewritten text returned." });
    }

    // --------- Score rewritten text (heuristic) -----------------------------
    const score = await scoreDraft(rewritten, modelId);

    return res.status(200).json({
      text: rewritten,
      score, // 0–1; frontend converts to % where needed
      model: completion.model,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Error in /api/rewrite:", err);
    return res.status(500).json({
      error: "Failed to rewrite draft",
      details: err.message || String(err),
    });
  }
}
