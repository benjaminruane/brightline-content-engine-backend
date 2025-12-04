// /api/generate.js
//
// Vercel serverless endpoint
// Produces draft text + quality score + (optional) statement analysis
//
// IMPORTANT:
// - Returns { draftText, score, model, projectId, usage, createdAt }
// - Uses scoreDraft helper
// - max_tokens is replaced by max_completion_tokens (OpenAI 2025 requirement)

import OpenAI from "openai";
import { scoreDraft } from "../utils/scoreDraft.js";

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
      model,
      title,
      notes,
      scenario,
      selectedTypes,
      versionType,
      maxWords,
      publicSearch,
      sources,
      projectId,
    } = req.body || {};

    // Frontend sends `modelId`; backend names arg `model`.
    const modelId = model || "gpt-4o-mini";

    // Build prompt
    const sourceText =
      Array.isArray(sources)
        ? sources.map((s) => s.text || "").join("\n\n")
        : "";

    const userPrompt = `
You are the Content Engine drafting model.
Follow the scenario, selected output types, internal notes and sources.

Title: ${title || "(none)"}
Scenario: ${scenario}
Output types: ${JSON.stringify(selectedTypes || [])}
Version type: ${versionType}
Max words: ${maxWords || "none"}
Public search: ${publicSearch === true ? "on" : "off"}

NOTES:
${notes || "(none)"}

SOURCE MATERIAL:
${sourceText}
    `.trim();

    // ---- OpenAI Call -------------------------------------------------

    const completion = await client.chat.completions.create({
      model: modelId,
      temperature: 0.3,
      max_completion_tokens:
        typeof maxWords === "number" && maxWords > 0
          ? Math.max(80, maxWords)
          : 2048,
      messages: [
        {
          role: "system",
          content:
            "You are an expert private-markets drafting engine. Produce clean, internally coherent prose.",
        },
        { role: "user", content: userPrompt },
      ],
    });

    const rawContent = completion?.choices?.[0]?.message?.content || "";
    const draftText =
      typeof rawContent === "string" ? rawContent.trim() : "";

    if (!draftText) {
      console.error("No draft text in OpenAI completion:", completion);
      return res.status(500).json({
        error: "Model returned empty content",
      });
    }

    // ---- Quality Scoring ----------------------------------------------
    const score = scoreDraft(draftText, modelId, { publicSearch });

    // ---- Response ------------------------------------------------------
    return res.status(200).json({
      draftText,
      score,
      model: modelId,
      projectId: projectId || null,
      usage: completion.usage || null,
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
