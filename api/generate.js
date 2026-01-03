// api/generate.js
//
// Generates a new draft.
// Behaviour:
// - publicSearch === true: retrieve from web
// - publicSearch === false: do not retrieve from web
//
// NEW:
// - If OPENAI_API_KEY is missing, fail gracefully with JSON (instead of crashing / failed-to-fetch).

import OpenAI from "openai";
import {
  tavilySearch,
  formatWebResultsForPrompt,
  webResultsToReferences,
  deriveQueryFromDraft,
} from "./_web.js";

// ------------------------------------------------------------------
// CORS
function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin === "null" ? "*" : origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
// ------------------------------------------------------------------

const client = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const STYLE_GUIDE_INSTRUCTIONS = `
You are part of an internal writing tool called "Content Engine".
You produce crisp, professional, investment-grade writing.

General style:
- Write in clear, concise English.
- Prefer short sentences.
- Avoid hype.
- Avoid unnecessary adjectives.
- Use standard English commas (no weird formatting).
- Avoid thousand separators for years.
`.trim();

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function clampMaxWords(maxWords) {
  if (typeof maxWords !== "number" || !Number.isFinite(maxWords) || maxWords <= 0) return null;
  return Math.floor(maxWords);
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  if (!client) {
    return res.status(500).json({
      ok: false,
      error: "Server is missing OPENAI_API_KEY",
    });
  }

  try {
    const body = req.body || {};
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
    } = body;

    const modelId =
      typeof model === "string" && model.trim() ? model.trim() : "gpt-5.1";
    const effectiveMaxWords = clampMaxWords(maxWords);

    const safeTitle = typeof title === "string" ? title : "";
    const safeNotes = typeof notes === "string" ? notes : "";
    const safeScenario = typeof scenario === "string" ? scenario : "";
    const safeSelectedTypes = Array.isArray(selectedTypes) ? selectedTypes : [];
    const safeVersionType = typeof versionType === "string" ? versionType : "";
    const safePublicSearch = Boolean(publicSearch);

    const safeSources = Array.isArray(sources) ? sources : [];

    // When web search is enabled, always derive a retrieval query from the draft inputs.
    let webResultsForPrompt = "";
    let webReferences = [];
    let web = { ok: false, enabled: false, used: false };

    if (safePublicSearch) {
      const query = deriveQueryFromDraft(
        [safeTitle, safeNotes, safeScenario, safeSelectedTypes.join(" ")]
          .filter(Boolean)
          .join("\n\n")
      );

      try {
        const results = await tavilySearch(query);
        webResultsForPrompt = formatWebResultsForPrompt(results);
        webReferences = webResultsToReferences(results);
        web = { ok: true, provider: "tavily", query, results };
      } catch (e) {
        web = {
          ok: false,
          provider: "tavily",
          query,
          results: [],
          error: e?.message || String(e),
        };
        webResultsForPrompt = "";
        webReferences = [];
      }
    }

    const userPrompt = `
You are generating a draft. Follow the style guide.

Inputs:
Title: ${safeTitle || "(none)"}
Notes: ${safeNotes || "(none)"}
Scenario: ${safeScenario || "(none)"}
Selected types: ${safeSelectedTypes.length ? safeSelectedTypes.join(", ") : "(none)"}
Version type: ${safeVersionType || "(none)"}

Web search enabled: ${safePublicSearch ? "true" : "false"}

WEB RESULTS:
${webResultsForPrompt || "(none)"}

SOURCES (user uploaded / URLs):
${safeSources.length ? JSON.stringify(safeSources, null, 2) : "(none)"}

Output constraints:
${effectiveMaxWords ? `- Keep output under ~${effectiveMaxWords} words where possible.` : "- No explicit word limit provided."}

Return ONLY JSON:
{
  "draftText": "string"
}
`.trim();

    const completion = await client.chat.completions.create({
      model: modelId,
      temperature: 0.2,
      messages: [
        { role: "system", content: STYLE_GUIDE_INSTRUCTIONS },
        { role: "user", content: userPrompt },
      ],
    });

    const raw = completion?.choices?.[0]?.message?.content || "";
    const parsed = safeJsonParse(raw) || {};
    const draftText =
      typeof parsed.draftText === "string" ? parsed.draftText.trim() : "";

    if (!draftText) {
      return res.status(500).json({
        ok: false,
        error:
          "Draft could not be generated. Please try again, or provide more notes and/or sources.",
      });
    }

    return res.status(200).json({
      ok: true,
      draftText,
      sourcesUsed: {
        web: safePublicSearch
          ? { enabled: true, used: Boolean(web?.ok), provider: "tavily", query: web?.query || "" }
          : { enabled: false, used: false },
        references: webReferences,
      },
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error:
        "Draft could not be generated. Please try again, or provide more notes and/or sources.",
      details: err?.message || String(err),
    });
  }
}
