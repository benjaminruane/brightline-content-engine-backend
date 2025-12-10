// /api/generate.js
//
// Generates a new draft based on scenario, sources and settings.
// Uses Chat Completions. We keep the JSON response shape stable
// for the frontend.

import OpenAI from "openai";

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

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

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

    const safeScenario = typeof scenario === "string" ? scenario : "generic";
    const safeTitle = typeof title === "string" ? title.trim() : "";
    const safeNotes = typeof notes === "string" ? notes.trim() : "";

    const safeSources = Array.isArray(sources) ? sources : [];

    if (safeSources.length === 0) {
      return res.status(400).json({
        error: "At least one source is required to generate a draft.",
      });
    }

    const sourceSummaries = safeSources.map((s, idx) => {
      const label = s.name || s.url || `Source ${idx + 1}`;
      const text =
        typeof s.text === "string" ? truncateText(s.text, 8000) : "";
      return `Source ${idx + 1} – ${label}:\n${text}`;
    });

    const sourcesBlock = sourceSummaries.join("\n\n-----\n\n");

    const scenarioLabelMap = {
      new_investment: "New direct investment",
      exit_realisation: "Direct investment exit",
      revaluation: "Direct investment revaluation",
      new_fund_commitment: "New fund commitment",
      fund_capital_call: "Fund capital call",
      fund_distribution: "Fund distribution",
    };

    const scenarioLabel =
      scenarioLabelMap[safeScenario] || "Investment-related event";

    const versionLabel =
      versionType === "public"
        ? "Public / externally safe version"
        : "Complete internal version";

    const { lengthGuidance, suggestedMaxTokens } = buildLengthGuidance(
      maxWords
    );

    const selectedTypeLabels = selectedTypes.map((t) => {
      switch (t) {
        case "transaction_text":
          return "Transaction text";
        case "investment_note":
          return "Investor letter";
        case "press_release":
          return "Press release";
        case "linkedin_post":
          return "LinkedIn post";
        default:
          return t;
      }
    });

    const resolvedModel =
      typeof model === "string" && model.trim().length > 0
        ? model.trim()
        : "gpt-4.1-mini";

    const systemParts = [
      "You are an assistant that writes high-quality, investment-related draft texts.",
      "Follow the user's scenario, selected output types, and notes carefully.",
      "Write in a clear, concise, professional tone suitable for institutional investors.",
      "Style rules:",
      " - For money amounts, prefer formats like 'USD 10 million' instead of '$10m' or 'USD 10m'.",
      " - Spell out 'million' and 'billion' in full; avoid using 'm' or 'bn' suffixes.",
      " - Use ISO currency codes (e.g. USD, EUR, GBP) instead of symbols ($, €, £) where appropriate.",
    ];

    const systemPrompt = systemParts.join("\n");

    const userLines = [];

    if (safeTitle) {
      userLines.push(`INTERNAL EVENT TITLE:\n${safeTitle}`);
    }

    userLines.push(`SCENARIO:\n${scenarioLabel}`);
    userLines.push(
      `REQUESTED OUTPUT TYPES:\n${selectedTypeLabels.join(", ")}`
    );
    userLines.push(`VERSION TYPE:\n${versionLabel}`);

    if (safeNotes) {
      userLines.push(`INSTRUCTIONS / CONSTRAINTS:\n${safeNotes}`);
    }

    if (lengthGuidance) {
      userLines.push(`LENGTH GUIDANCE:\n${lengthGuidance}`);
    }

    userLines.push("SOURCE MATERIAL (EXCERPTED – DO NOT HALLUCINATE):");
    userLines.push(sourcesBlock);

    userLines.push(
      [
        "TASK:",
        "- Based on the scenario, requested output types, version type and sources,",
        "  write the requested draft text.",
        "- If multiple output types are requested, structure the response so that",
        "  each type is clearly separated and labelled (e.g. headings).",
        "- Do not include any meta commentary about the drafting process.",
      ].join("\n")
    );

    const userPrompt = userLines.join("\n\n");

    const completion = await client.chat.completions.create({
      model: resolvedModel,
      temperature: 0.2,
      max_completion_tokens: suggestedMaxTokens || 2048,
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
        .json({ error: "Model returned empty draft text." });
    }

    const lengthScore = (() => {
      const len = draftText.length;
      if (len < 400) return 60;
      if (len < 800) return 70;
      if (len < 1200) return 80;
      if (len < 2000) return 90;
      return 95;
    })();

    return res.status(200).json({
      draftText,
      label: `Version ${new Date()
        .toISOString()
        .slice(0, 16)
        .replace("T", " ")}`,
      model: resolvedModel,
      scenario: safeScenario,
      scenarioLabel,
      versionType: versionType || "complete",
      score: lengthScore,
    });
  } catch (err) {
    console.error("Error in /api/generate:", err);
    return res.status(500).json({
      error: "Failed to generate draft",
      details: err?.response?.data || err?.message || String(err),
    });
  }
}

// --- Helpers -------------------------------------------------------------

function truncateText(text, maxChars = 8000) {
  if (!text || typeof text !== "string") return "";
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars);
}

function approximateTokensFromWords(wordCount) {
  if (!wordCount || typeof wordCount !== "number") return null;
  return Math.round(wordCount / 0.75);
}

function buildLengthGuidance(maxWords) {
  let lengthGuidance = "";
  let suggestedMaxTokens = 1024;

  if (typeof maxWords === "number" && maxWords > 0) {
    const rounded = Math.max(50, Math.round(maxWords));
    const approxTokens = approximateTokensFromWords(rounded);
    suggestedMaxTokens = approxTokens
      ? Math.min(approxTokens + 200, 2500)
      : 1200;

    lengthGuidance =
      `Target length: around ${rounded} words (soft ceiling). ` +
      `Do not exceed ${rounded} words by more than ~10–15%. ` +
      `If you can answer fully in fewer words, prefer being concise.`;
  } else {
    lengthGuidance =
      "Write a clear, well-structured draft. Be concise but complete.";
    suggestedMaxTokens = 1200;
  }

  return { lengthGuidance, suggestedMaxTokens };
}
