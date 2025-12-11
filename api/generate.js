// api/generate.js
//
// Generates a new draft based on title, notes, scenario, output types,
// and attached sources. Uses OpenAI chat.completions.create() with no
// tools, no web-search, and no experimental APIs.

import OpenAI from "openai";

// --- CORS helper --------------------------------------------------
function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";

  res.setHeader("Access-Control-Allow-Origin", origin === "null" ? "*" : origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
// ------------------------------------------------------------------

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Shared style-guide text (keep in sync with /api/query if you change it)
const STYLE_GUIDE_INSTRUCTIONS = `
You are part of an internal writing tool called "Content Engine".
Follow this style guide in all draft outputs:

- Currency:
  - Use "USD" followed by a space and a number with standard English thousand separators.
    Example: USD 1,500,000 (not USD1.5m, USD1,500,000 or US$1.5m).
- Years:
  - Do NOT insert thousand separators into years: 2025, 1999.
- Quotation marks:
  - Prefer straight double quotes "like this" for titles, terms, and citations.
  - Use single quotes only for quotes-within-quotes.
- Tone:
  - Clear, concise, neutral, professional.
`;

/**
 * Try to make the scenario description a bit more human-readable.
 */
function describeScenario(scenarioId) {
  switch (scenarioId) {
    case "new_investment":
      return "New direct investment announcement or description.";
    case "exit_realisation":
      return "Direct investment exit or realisation update.";
    case "revaluation":
      return "Direct investment valuation or revaluation update.";
    case "new_fund_commitment":
      return "New fund commitment (LP committing capital to a fund).";
    case "fund_capital_call":
      return "Fund capital call notice.";
    case "fund_distribution":
      return "Fund distribution or proceeds notice.";
    default:
      return scenarioId || "General private markets communication.";
  }
}

/**
 * Build the system prompt passed to the model.
 */
function buildSystemPrompt() {
  return [
    `You are a specialist writer for private markets and asset management.`,
    `You write investor-facing text based on structured inputs: scenario, title, notes, output types, and attached source excerpts.`,
    `If there is any ambiguity, prioritise being accurate and transparent over sounding promotional.`,
    STYLE_GUIDE_INSTRUCTIONS,
  ].join("\n\n");
}

/**
 * Build the user prompt from the payload.
 */
function buildUserPrompt(payload) {
  const {
    title,
    notes,
    scenario,
    selectedTypes,
    versionType,
    maxWords,
    sources,
  } = payload || {};

  const safeTitle = (title || "").trim();
  const safeNotes = (notes || "").trim();
  const safeScenario = describeScenario(scenario);
  const typesList =
    Array.isArray(selectedTypes) && selectedTypes.length > 0
      ? selectedTypes.join(", ")
      : "unspecified";

  const maxWordsHint =
    typeof maxWords === "number" && maxWords > 0
      ? `Aim for approximately ${maxWords} words, but prefer clarity over hitting the exact word count.`
      : `Aim for a concise but complete draft.`;

  let sourcesSection = "[no source excerpts were provided]";
  if (Array.isArray(sources) && sources.length > 0) {
    const lines = sources.map((s, idx) => {
      const name = s.name || s.kind || `Source ${idx + 1}`;
      const url = s.url ? ` (${s.url})` : "";
      const text = (s.text || "").slice(0, 1500); // limit per-source text
      return [
        `SOURCE ${idx + 1}: ${name}${url}`,
        text ? text : "[no text excerpt provided]",
      ].join("\n");
    });
    sourcesSection = lines.join("\n\n");
  }

  const notesSection = safeNotes || "[no additional drafting notes provided]";
  const titleLine = safeTitle || "[no explicit title provided]";

  return [
    `SCENARIO DESCRIPTION:`,
    safeScenario,
    "",
    `OUTPUT TYPES:`,
    typesList,
    "",
    `VERSION TYPE:`,
    versionType || "[not specified]",
    "",
    `TITLE / HEADING:`,
    titleLine,
    "",
    `DRAFTING NOTES FROM USER:`,
    notesSection,
    "",
    `SOURCE EXCERPTS:`,
    sourcesSection,
    "",
    `INSTRUCTIONS:`,
    maxWordsHint,
    `Use the information above to draft a single coherent piece of text that fits the scenario and output types.`,
    `Do not invent specific numbers, dates, valuations or party names that are not mentioned in the notes or sources.`,
    `If you need to generalise (for example, about performance or pipeline), keep the language high-level and clearly non-specific.`,
    `Write in polished, professional business English suitable for sophisticated institutional investors.`,
  ].join("\n");
}

/**
 * Ensure we always return *some* draft text, even if the model response is odd.
 */
function coerceDraftText(rawContent) {
  if (!rawContent || typeof rawContent !== "string") {
    return "No draft could be generated from the provided inputs. Please adjust the notes and try again.";
  }

  const trimmed = rawContent.trim();
  if (!trimmed) {
    return "No draft could be generated from the provided inputs. Please adjust the notes and try again.";
  }

  return trimmed;
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res
      .status(500)
      .json({ error: "Missing OPENAI_API_KEY environment variable" });
  }

  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

    const {
      title,
      notes,
      scenario,
      selectedTypes,
      versionType,
      maxWords,
      model,
      // We accept but ignore publicSearch & sources for now:
      publicSearch,
      sources,
    } = body;

    // Basic validation: we at least want scenario OR title OR notes or sources
    if (
      !title &&
      !notes &&
      (!Array.isArray(sources) || sources.length === 0)
    ) {
      return res.status(400).json({
        error:
          "Missing content to generate from. Provide at least a title, notes, or one source excerpt.",
      });
    }

    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt({
      title,
      notes,
      scenario,
      selectedTypes,
      versionType,
      maxWords,
      sources,
    });

    // Rough max completion tokens heuristic based on requested maxWords
    let maxCompletionTokens = 2048;
    if (typeof maxWords === "number" && maxWords > 0) {
      const est = maxWords * 4 + 256; // ~4 tokens per word + buffer
      maxCompletionTokens = Math.min(4096, est);
    }

    const completion = await client.chat.completions.create({
      model: model || "gpt-4o-mini",
      temperature: 0.4,
      max_completion_tokens: maxCompletionTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const message = completion.choices?.[0]?.message;
    const rawContent = message?.content || "";

    // Make sure we always return some non-empty draftText:
    const draftText = coerceDraftText(rawContent);

    // We let the frontend's scoreDraft() function compute a score if needed.
    return res.status(200).json({
      ok: true,
      draftText,
      score: null,
      model: completion.model || null,
      usage: {
        promptTokens: completion.usage?.prompt_tokens ?? null,
        completionTokens: completion.usage?.completion_tokens ?? null,
        totalTokens: completion.usage?.total_tokens ?? null,
      },
    });
  } catch (err) {
    console.error("/api/generate error:", err);
    const message =
      err && typeof err === "object" && "message" in err
        ? err.message
        : "Unknown error";

    // For unexpected failures (network, OpenAI error, bad JSON, etc.),
    // we still return a 500 so the client knows it truly failed.
    return res.status(500).json({
      error: "Failed to generate draft",
      details: message,
    });
  }
}
