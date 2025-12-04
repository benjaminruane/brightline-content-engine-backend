// /api/rewrite.js
//
// Vercel serverless endpoint
// Rewrites an existing draft + returns a quality score.
//
// IMPORTANT:
// - Mirrors /api/generate.js response shape exactly.
// - Returns { draftText, score, model, usage, createdAt }
// - max_tokens → max_completion_tokens for 2025 OpenAI API compatibility.

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
      text,
      notes,
      scenario,
      versionType,
      model,
      publicSearch,
      projectId,
    } = req.body || {};

    if (!text || typeof text !== "string") {
      return res
        .status(400)
        .json({ error: "Missing or invalid base text to rewrite." });
    }

    const modelId = model || "gpt-4o-mini";

    // Build rewrite prompt
    const userPrompt = `
You are the Content Engine rewriting module.
Rewrite the provided draft while respecting the scenario, version type, and rewrite notes.

Scenario: ${scenario}
Version type: ${versionType}
Public search: ${publicSearch === true ? "on" : "off"}

Rewrite instructions:
${notes || "(none)"}

--- ORIGINAL DRAFT ---
${text}
`.trim();

    // ---- OpenAI Call -------------------------------------------------
    const completion = await client.chat.completions.create({
      model: modelId,
      temperature: 0.25,
      max_completion_tokens: 2048,
      messages: [
        {
          role: "system",
          content:
            "You are an expert rewriting engine. Produce clean, internally coherent prose without altering core facts.",
        },
        { role: "user", content: userPrompt },
      ],
    });

    const rawContent = completion?.choices?.[0]?.message?.content || "";
    const rewrittenText =
      typeof rawContent === "string" ? rawContent.trim() : "";

    if (!rewrittenText) {
      console.error("Empty rewrite completion:", completion);
      return res.status(500).json({
        error: "Model returned empty rewrite",
      });
    }

    // ---- Quality Scoring ----------------------------------------------
    const score = scoreDraft(rewrittenText, modelId, { publicSearch });

    // ---- Response ------------------------------------------------------
    return res.status(200).json({
      draftText: rewrittenText, // keep same key name as generate
      score,
      model: modelId,
      projectId: projectId || null,
      usage: completion.usage || null,
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
