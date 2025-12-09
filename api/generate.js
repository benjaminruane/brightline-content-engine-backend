// /api/generate.js
//
// Generates a draft based on title, notes, scenario and sources.
// Uses OpenAI's chat completions API and returns:
//   { draftText, score, label }
//
// Also includes full CORS handling so it works from the Vercel frontend.

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

function simpleScore(text) {
  if (!text || typeof text !== "string") return null;
  const len = text.length;
  if (len < 400) return 60;
  if (len < 800) return 70;
  if (len < 1200) return 80;
  if (len < 2000) return 90;
  return 95;
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    // Preflight – no body, just headers
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res
      .status(500)
      .json({ error: "OPENAI_API_KEY is not configured on the backend." });
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
      publicSearch, // currently unused here but kept for future
      sources,
    } = req.body || {};

    if (!Array.isArray(selectedTypes) || selectedTypes.length === 0) {
      return res
        .status(400)
        .json({ error: "At least one output type must be selected." });
    }

    if (!Array.isArray(sources) || sources.length === 0) {
      return res
        .status(400)
        .json({ error: "At least one source must be provided." });
    }

    const resolvedModel =
      typeof model === "string" && model.trim().length > 0
        ? model.trim()
        : "gpt-4o-mini";

    // Build a compact context from sources (truncate for safety)
    const sourceSnippets = sources
      .slice(0, 6)
      .map((s, idx) => {
        const name = s.name || s.url || `Source ${idx + 1}`;
        const text =
          typeof s.text === "string" ? s.text.slice(0, 6000) : "";
        return `Source ${idx + 1} – ${name}:\n${text}`;
      })
      .join("\n\n-----\n\n");

    const safeTitle = (title || "").toString();
    const safeNotes = (notes || "").toString();
    const safeScenario = (scenario || "").toString();

    const safeMaxWords =
      typeof maxWords === "number" && Number.isFinite(maxWords) && maxWords > 0
        ? Math.round(maxWords)
        : null;

    const scenarioLine = safeScenario
      ? `Scenario: ${safeScenario}.`
      : "Scenario: new direct investment or similar private-markets event.";

    const outputTypesLine = `Requested output types: ${selectedTypes.join(
      ", "
    )}. (Focus on drafting one primary transaction text in clear, neutral, professional tone.)`;

    const wordLimitInstruction = safeMaxWords
      ? `Respect a hard word limit of approximately ${safeMaxWords} words. Write naturally and do NOT exceed this limit.`
      : "There is no strict word limit, but keep the text concise and focused.";

    const notesInstruction = safeNotes
      ? `The user provided additional drafting instructions:\n"${safeNotes}". Respect these instructions unless they conflict with compliance / factual accuracy.`
      : "The user did not provide additional drafting instructions.";

    const systemPrompt =
      "You are an expert private-markets investment writer. " +
      "You draft crisp, factual transaction texts based on an internal investment memo and supporting materials. " +
      "Your tone is neutral, clear, and suitable for professional audiences. " +
      "You never hallucinate specific financial figures that are not clearly supported by the sources.";

    const userPrompt = [
      scenarioLine,
      outputTypesLine,
      wordLimitInstruction,
      notesInstruction,
      "",
      safeTitle ? `Internal event title: ${safeTitle}` : "",
      "",
      "Below are the key sources and extracts the user has provided. Use them as your primary factual basis:",
      sourceSnippets || "(No readable source text provided.)",
      "",
      "TASK:",
      "- Draft a single, self-contained transaction text in professional third-person voice.",
      "- Focus on the key facts, investment thesis, and high-level rationale.",
      "- Do NOT include meta commentary, headings, or bullet points.",
      "- Do NOT explain what you are doing; output ONLY the final draft text.",
    ]
      .filter(Boolean)
      .join("\n");

    const completionBody = {
      model: resolvedModel,
      temperature: 0.3,
      max_tokens: 1024,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    };

    const openaiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(completionBody),
      }
    );

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text().catch(() => "");
      console.error("OpenAI /v1/chat/completions error:", errorText);
      return res.status(502).json({
        error: "Upstream OpenAI error during generate",
        details: errorText.slice(0, 1000),
      });
    }

    const completionPayload = await openaiResponse.json();
    const choice = completionPayload.choices?.[0];
    const draftText =
      choice?.message?.content?.trim() ||
      completionPayload.choices?.[0]?.message?.content?.trim() ||
      "";

    if (!draftText) {
      console.error("Generate: model returned empty draft:", completionPayload);
      return res.status(500).json({
        error: "Model returned empty draft",
      });
    }

    const score = simpleScore(draftText);

    return res.status(200).json({
      draftText,
      score,
      label: "Version 1",
    });
  } catch (err) {
    console.error("Error in /api/generate:", err);
    return res.status(500).json({
      error: "Failed to generate draft",
      details: err.message || String(err),
    });
  }
}
