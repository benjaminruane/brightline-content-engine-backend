// api/generate.js
//
// Generates a new draft.
// Web search behaviour:
// - publicSearch === true: enrich with web search results
// - publicSearch === false: do not retrieve from web
//
// NEW:
// - Returns meta.sourcesUsed[] describing what was used from attached sources.
// - Also returns sourcesUsedRows[] at the top-level for convenient frontend consumption.
// - The model is instructed to append a [SOURCES_USED] JSON block that we strip out.

import OpenAI from "openai";
import {
  tavilySearch,
  formatWebResultsForPrompt,
  webResultsToReferences,
  deriveQueryFromDraft,
} from "../lib/web.js";

// ------------------------------------------------------------------
// CORS
function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin === "null" ? "*" : origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();
  
// ------------------------------------------------------------------

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

function stripSourcesUsedBlock(text) {
  if (typeof text !== "string") return "";
  // Removes a trailing [SOURCES_USED] JSON section if present
  const marker = "[SOURCES_USED]";
  const idx = text.lastIndexOf(marker);
  if (idx === -1) return text.trim();
  return text.slice(0, idx).trim();
}

function extractSourcesUsedRows(text) {
  if (typeof text !== "string") return [];
  const marker = "[SOURCES_USED]";
  const idx = text.lastIndexOf(marker);
  if (idx === -1) return [];

  const jsonPart = text.slice(idx + marker.length).trim();
  const parsed = safeJsonParse(jsonPart);
  const rows = Array.isArray(parsed?.sourcesUsedRows) ? parsed.sourcesUsedRows : [];
  return rows
    .filter((r) => r && typeof r === "object")
    .map((r) => ({
      title: typeof r.title === "string" ? r.title : "",
      url: typeof r.url === "string" ? r.url : "",
      snippet: typeof r.snippet === "string" ? r.snippet : "",
    }))
    .filter((r) => r.title || r.url || r.snippet);
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ ok: false, error: "Server is missing OPENAI_API_KEY" });
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

    const modelId = typeof model === "string" && model.trim() ? model.trim() : "gpt-5.1";
    const effectiveMaxWords = clampMaxWords(maxWords);

    const safeTitle = typeof title === "string" ? title : "";
    const safeNotes = typeof notes === "string" ? notes : "";
    const safeScenario = typeof scenario === "string" ? scenario : "";
    const safeSelectedTypes = Array.isArray(selectedTypes) ? selectedTypes : [];
    const safeVersionType = typeof versionType === "string" ? versionType : "";
    const safePublicSearch = Boolean(publicSearch);
    const safeSources = Array.isArray(sources) ? sources : [];

    let webResultsForPrompt = "";
    let webReferences = [];
    let web = { ok: false };

    if (safePublicSearch) {
      const query = deriveQueryFromDraft(
        [safeTitle, safeNotes, safeScenario, safeSelectedTypes.join(" ")]
          .filter(Boolean)
          .join("\n\n")
      );

      try {
        const results = await tavilySearch({ query, maxResults: 6 });
        webResultsForPrompt = formatWebResultsForPrompt(results);
        webReferences = webResultsToReferences(results?.results || []);
        web = results || { ok: false };
      } catch (e) {
        web = { ok: false, error: e?.message || String(e) };
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
${
  effectiveMaxWords
    ? `- Keep output under ~${effectiveMaxWords} words where possible.`
    : "- No explicit word limit provided."
}

IMPORTANT:
At the END of your output, append a line with exactly: [SOURCES_USED]
Then append JSON with:
{
  "sourcesUsedRows": [
    { "title": "string", "url": "string", "snippet": "string" }
  ]
}

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
    const rawDraftText = typeof parsed.draftText === "string" ? parsed.draftText : "";
    const sourcesUsedRows = extractSourcesUsedRows(rawDraftText);
    const draftText = stripSourcesUsedBlock(rawDraftText);

    if (!draftText.trim()) {
      return res.status(500).json({
        ok: false,
        error: "Draft could not be generated. Please try again, or provide more notes and/or sources.",
      });
    }

    return res.status(200).json({
      ok: true,
      draftText,
      sourcesUsedRows,
      sourcesUsed: {
        web: {
          enabled: Boolean(safePublicSearch),
          used: Boolean(safePublicSearch === true && web.ok && webReferences.length),
          provider: "tavily",
          query: web?.query || null,
          references: webReferences,
        },
      },
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err?.message || "Unknown error",
    });
  }
}
