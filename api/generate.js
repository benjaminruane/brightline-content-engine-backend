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
} from "./_web.js";

// --- CORS helper --------------------------------------------------
function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin === "null" ? "*" : origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
// ------------------------------------------------------------------

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const STYLE_GUIDE_INSTRUCTIONS = `
You are part of an internal writing tool called "Content Engine".
You produce crisp, professional, investment-grade writing.

General style:
- Write in clear, confident, neutral business English.
- Avoid hype, filler, and generic statements.
- Prefer short paragraphs, strong topic sentences, and concrete facts.
- Use bullet points only when it improves clarity.
- If information is missing, do not invent; write around it or explicitly state it is not available.
`.trim();

function describeScenario(scenario) {
  switch (scenario) {
    case "new_investment":
      return "Announce / describe a new investment";
    case "direct_investment":
      return "Describe a direct investment";
    case "direct_investment_realisation":
      return "Describe a realisation/exit of a direct investment";
    case "fund_commitment":
      return "Describe a new fund commitment";
    case "fund_capital_call":
      return "Explain a fund capital call";
    case "fund_distribution":
      return "Explain a fund distribution";
    case "linkedin_post":
      return "LinkedIn post style; still professional";
    default:
      return "General drafting";
  }
}

function buildSystemPrompt() {
  return `
${STYLE_GUIDE_INSTRUCTIONS}

You must produce ONLY the draft text.
Do not include preambles, apologies, or meta commentary.

You MUST append a [SOURCES_USED] JSON block at the end, formatted exactly:

[SOURCES_USED]
{
  "sourcesUsed": [
    {
      "sourceIndex": 1,
      "name": "Source name",
      "url": "https://... (or null)",
      "usedPortion": "1–2 sentences on what was used",
      "references": ["page/section/quote pointers if available, otherwise empty"]
    }
  ]
}
[/SOURCES_USED]

Rules:
- Only include sources you actually used.
- usedPortion should be concise and specific (not generic).
- references: keep short; if you cannot infer pages/sections, leave it as [].
`.trim();
}

function buildUserPrompt(payload) {
  const {
    title,
    notes,
    scenario,
    selectedTypes,
    versionType,
    maxWords,
    sources,
    webResultsForPrompt,
  } = payload || {};

  const safeTitle = (title || "").trim();
  const safeNotes = (notes || "").trim();
  const safeScenario = (scenario || "").trim();
  const safeTypes = Array.isArray(selectedTypes) ? selectedTypes : [];
  const safeSources = Array.isArray(sources) ? sources : [];

  const sourceBlock = safeSources.length
    ? safeSources
        .map((s, i) => {
          const idx = i + 1;
          const name = (s?.name || `Source ${idx}`).trim();
          const kind = (s?.kind || "text").trim();
          const url = typeof s?.url === "string" ? s.url.trim() : "";
          const text = typeof s?.text === "string" ? s.text.trim() : "";

          return `
SOURCE ${idx}:
NAME: ${name}
TYPE: ${kind}
URL: ${url || "(none)"}
CONTENT:
${text || "(no content)"}
`.trim();
        })
        .join("\n\n")
    : "(no sources)";

  const webBlock =
    typeof webResultsForPrompt === "string" && webResultsForPrompt.trim()
      ? webResultsForPrompt.trim()
      : "(not enabled or no results)";

  return `
TITLE:
${safeTitle || "(none)"}

SCENARIO:
${safeScenario || "(none)"} — ${describeScenario(safeScenario)}

OUTPUT TYPE(S):
${safeTypes.length ? safeTypes.join(", ") : "(none provided)"}

VERSION TYPE:
${versionType || "(none)"}

TARGET LENGTH:
${
  typeof maxWords === "number" && maxWords > 0
    ? `${maxWords} words maximum (HARD CAP: do not exceed). If you would exceed, compress the draft.`
    : "(no max words provided)"
}

NOTES:
${safeNotes || "(none)"}

ATTACHED SOURCES:
${sourceBlock}

WEB RESULTS (only if publicSearch enabled):
${webBlock}
`.trim();
}

function extractSourcesUsedBlock(rawText) {
  const text = typeof rawText === "string" ? rawText : "";
  const re = /\[SOURCES_USED\]\s*([\s\S]*?)\s*\[\/SOURCES_USED\]/i;
  const m = text.match(re);
  if (!m) {
    return { cleaned: text.trim(), sourcesUsed: [] };
  }

  const jsonText = (m[1] || "").trim();
  const cleaned = text.replace(re, "").trim();

  try {
    const parsed = JSON.parse(jsonText);
    const list = Array.isArray(parsed?.sourcesUsed) ? parsed.sourcesUsed : [];
    return { cleaned, sourcesUsed: list };
  } catch {
    return { cleaned, sourcesUsed: [] };
  }
}

function normalizeSourcesUsed(list) {
  const safe = Array.isArray(list) ? list : [];
  return safe
    .map((x) => {
      const sourceIndex =
        typeof x?.sourceIndex === "number" ? x.sourceIndex : null;
      const name = typeof x?.name === "string" ? x.name : "";
      const url = typeof x?.url === "string" ? x.url : null;
      const usedPortion =
        typeof x?.usedPortion === "string" ? x.usedPortion : "";
      const references = Array.isArray(x?.references)
        ? x.references.filter((r) => typeof r === "string")
        : [];

      return {
        sourceIndex,
        name,
        url,
        usedPortion,
        references,
      };
    })
    .filter((x) => x.name || x.url);
}

function coerceDraftText(rawContent) {
  const text = typeof rawContent === "string" ? rawContent.trim() : "";
  if (text) return text;
  return "Draft could not be generated. Please try again, or provide more notes and/or sources.";
}

function countWords(text) {
  const s = typeof text === "string" ? text.trim() : "";
  if (!s) return 0;
  return s.split(/\s+/).filter(Boolean).length;
}

async function compressToWordLimit({ modelId, text, maxWords }) {
  const targetWords =
    typeof maxWords === "number" && Number.isFinite(maxWords) && maxWords > 0
      ? Math.round(maxWords)
      : null;
  if (!targetWords) return text;

  const maxCompletionTokens = Math.min(
    4096,
    Math.max(256, Math.round(targetWords * 1.6) + 80)
  );

  const system = `
You are an expert editor.
Rewrite the provided draft so it is <= ${targetWords} words.
Hard rule: DO NOT exceed the word limit.
Preserve meaning, facts, and structure as much as possible.
Do not add headings, preambles, or commentary.
Return ONLY the rewritten draft text.
`.trim();

  const user = `DRAFT TO SHORTEN:\n\n${text}`.trim();

  const completion = await client.chat.completions.create({
    model: modelId,
    temperature: 0.2,

    // Compatibility: different model routes may honor one or the other.
    max_tokens: maxCompletionTokens,
    max_completion_tokens: maxCompletionTokens,

    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const out = completion.choices?.[0]?.message?.content || "";
  return typeof out === "string" && out.trim() ? out.trim() : text;
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = req.body || {};
    const {
      title,
      notes,
      scenario,
      selectedTypes,
      versionType,
      maxWords,
      model: modelIdRaw,
      publicSearch,
      sources,
    } = body;

    if (!title && !notes && (!Array.isArray(sources) || sources.length === 0)) {
      return res.status(400).json({
        error:
          "Missing content to generate from. Provide at least a title, notes, or one source excerpt.",
      });
    }

    const modelId =
      typeof modelIdRaw === "string" && modelIdRaw.trim()
        ? modelIdRaw.trim()
        : "gpt-4o-mini";

    // Optional web search enrichment
    let webResultsForPrompt = "";
    let webReferences = [];
    let web = { ok: false, provider: "tavily", query: null, results: [] };

    if (publicSearch === true) {
      const draftSeed = [title, notes].filter(Boolean).join("\n\n");
      const query = deriveQueryFromDraft(draftSeed);

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

    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt({
      title,
      notes,
      scenario,
      selectedTypes,
      versionType,
      maxWords: typeof maxWords === "number" ? maxWords : null,
      sources,
      webResultsForPrompt,
    });

    const targetWords =
      typeof maxWords === "number" && Number.isFinite(maxWords) && maxWords > 0
        ? Math.round(maxWords)
        : null;

    const hardCapWords = targetWords ? Math.round(targetWords * 1.05) : null;

    // Rough heuristic: ~0.75–1.0 tokens/word in English + small buffer.
    const maxCompletionTokens = targetWords
      ? Math.min(4096, Math.max(256, Math.round(targetWords * 1.6) + 80))
      : 2048;

    const completion = await client.chat.completions.create({
      model: modelId,
      temperature: 0.3,

      // Compatibility: different model routes may honor one or the other.
      max_tokens: maxCompletionTokens,
      max_completion_tokens: maxCompletionTokens,

      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const rawContent = completion.choices?.[0]?.message?.content || "";
    const draftRaw = coerceDraftText(rawContent);

    const extracted = extractSourcesUsedBlock(draftRaw);
    let draftText = extracted.cleaned;
    const sourcesUsed = normalizeSourcesUsed(extracted.sourcesUsed);

    // Enforce word limit (guaranteed cap).
    if (hardCapWords && countWords(draftText) > hardCapWords) {
      try {
        draftText = await compressToWordLimit({
          modelId,
          text: draftText,
          maxWords: targetWords,
        });
      } catch {
        // If compression fails, still return the original (but token cap should prevent most overshoots).
      }
    }

    return res.status(200).json({
      ok: true,
      draftText,

      // NEW: convenient top-level alias for the frontend panel
      sourcesUsedRows: sourcesUsed,

      score: null,
      model: completion.model || null,
      usage: {
        promptTokens: completion.usage?.prompt_tokens ?? null,
        completionTokens: completion.usage?.completion_tokens ?? null,
        totalTokens: completion.usage?.total_tokens ?? null,
      },
      meta: {
        sourcesUsed,

        webSearch: {
          enabled: publicSearch === true,
          used: Boolean(publicSearch === true && web.ok && webReferences.length),
          provider: "tavily",
          query: web.query || null,
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
