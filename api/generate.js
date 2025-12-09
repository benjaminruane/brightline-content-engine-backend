// /api/generate.js
//
// Generates a draft based on scenario, output types, notes, and sources.
// Returns { draftText, label, score } where score may be null and the
// frontend's local scoreDraft() will act as fallback.

import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

export default async function handler(req, res) {
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
      scenario,
      selectedTypes,
      versionType,
      maxWords,
      model,
      publicSearch,
      sources,
    } = req.body || {};

    if (!Array.isArray(selectedTypes) || selectedTypes.length === 0) {
      return res
        .status(400)
        .json({ error: "At least one output type must be selected." });
    }

    const safeSources = Array.isArray(sources) ? sources : [];

    // Build a concise source summary (no need to send full docs to the model)
    const sourceSummaries = safeSources
      .slice(0, 6)
      .map((s, idx) => {
        const name = s.name || s.url || `Source ${idx + 1}`;
        const text =
          typeof s.text === "string" ? s.text.slice(0, 3000) : "";
        return `Source ${idx + 1} – ${name}:\n${text}`;
      })
      .join("\n\n");

    const safeMaxWords =
      typeof maxWords === "number" && maxWords > 0 ? maxWords : null;

    const resolvedModel =
      typeof model === "string" && model.trim().length > 0
        ? model.trim()
        : "gpt-4o-mini";

    // System prompt – includes soft guidance on length instead of truncation
    const systemParts = [
      "You are an assistant that writes high-quality, investment-related draft texts.",
      "Follow the user's scenario, selected output types, and notes carefully.",
      "Write in a clear, concise, professional tone suitable for institutional investors.",
    ];

    if (safeMaxWords) {
      systemParts.push(
        `Aim for no more than approximately ${safeMaxWords} words. It is fine to be slightly shorter if that reads better, but do not exceed this target by more than ~10%.`
      );
    }

    const systemPrompt = systemParts.join("\n");

    // User prompt
    const userLines = [];

    if (title) {
      userLines.push(`Title: ${title}`);
    }

    if (notes) {
      userLines.push(`Author notes / instructions:\n${notes}`);
    }

    if (scenario) {
      userLines.push(`Scenario: ${scenario}`);
    }

    userLines.push(
      `Version type: ${versionType || "complete"}\n` +
        `Selected output types (ids): ${selectedTypes.join(", ")}`
    );

    if (safeMaxWords) {
      userLines.push(
        `Target length: approximately ${safeMaxWords} words (do not exceed this target by more than ~10%).`
      );
    }

    if (sourceSummaries) {
      userLines.push(
        "\nHere are source materials you MUST rely on as primary grounding:\n\n" +
          sourceSummaries
      );
    } else {
      userLines.push(
        "\nNo explicit source documents were provided; write based only on the scenario and notes, and do not invent detailed facts or figures."
      );
    }

    const userPrompt = userLines.join("\n\n");

    // Call Chat Completions (no web search needed for drafting)
    const completion = await client.chat.completions.create({
      model: resolvedModel,
      temperature: 0.2,
      max_tokens: 2048,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const draftText =
      completion.choices?.[0]?.message?.content?.trim() || "";

    if (!draftText) {
      console.error("OpenAI completion returned empty content:", completion);
      return res
        .status(500)
        .json({ error: "Model returned empty content" });
    }

    // Label: let frontend fall back to "Version N" if needed
    const label =
      typeof title === "string" && title.trim().length > 0
        ? `Draft – ${title.trim()}`
        : null;

    // Score: optional – let frontend scoreDraft() handle fallback
    const score = null;

    return res.status(200).json({
      draftText,
      label,
      score,
      model: completion.model || resolvedModel,
      publicSearch: !!publicSearch,
    });
  } catch (err) {
    console.error("Error in /api/generate:", err);
    return res.status(500).json({
      error: "Failed to generate draft",
      details: err.message || String(err),
    });
  }
}
