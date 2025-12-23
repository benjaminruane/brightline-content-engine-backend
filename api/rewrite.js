// api/rewrite.js
//
// Rewrites an existing draft.
// Web search behaviour:
// - publicSearch === true: enrich rewrite with web search results
// - publicSearch === false: do not retrieve from web
//
// NEW:
// - Accepts text OR draftText; notes OR instructions.
// - Accepts sources[] and returns sourcesUsedRows[] describing what was used.
// - Model is instructed to append a [SOURCES_USED] JSON block that we strip out.

import OpenAI from "openai";
import {
  tavilySearch,
  formatWebResultsForPrompt,
  webResultsToReferences,
} from "./_web.js";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- CORS helper --------------------------------------------------
function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin === "null" ? "*" : origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
// ------------------------------------------------------------------

const STYLE_GUIDE_INSTRUCTIONS = `
HOUSE STYLE:
- Currency: USD 164,000 (currency code + space, English commas).
- Years: write 2025, not 2,025.
- Tone: clear, concise, neutral, professional.
`.trim();

function approximateTokensFromWords(wordCount) {
  // Heuristic: keep small limits actually small.
  // (Old Math.max(900, ...) forced huge outputs.)
  if (!wordCount || typeof wordCount !== "number" || !Number.isFinite(wordCount)) {
    return 1200;
  }
  const n = Math.max(1, Math.round(wordCount));
  // ~1.3–1.7 tokens/word depending on formatting + buffer
  return Math.min(4096, Math.max(128, Math.round(n * 1.6) + 120));
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
    Math.max(128, Math.round(targetWords * 1.6) + 120)
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
        id: `src_${sourceIndex || "x"}_${Math.random().toString(16).slice(2)}`,
        sourceIndex,
        name,
        url,
        usedPortion,
        references,
      };
    })
    .filter((x) => x.name || x.url);
}

function buildSourcesBlock(sources) {
  const safeSources = Array.isArray(sources) ? sources : [];
  if (!safeSources.length) return "(no sources)";

  return safeSources
    .map((s, i) => {
      const kind = typeof s?.kind === "string" ? s.kind : "source";
      const name = typeof s?.name === "string" ? s.name : `Source ${i + 1}`;
      const text = typeof s?.text === "string" ? s.text : "";
      const url = typeof s?.url === "string" ? s.url : "";
      const urlLine = url ? `URL: ${url}` : "URL: (none)";
      return `SOURCE ${i + 1} (${kind}) — ${name}\n${urlLine}\n${text}`.trim();
    })
    .join("\n\n");
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  if (!process.env.OPENAI_API_KEY) {
    return res
      .status(500)
      .json({ error: "Missing OPENAI_API_KEY environment variable" });
  }

  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

    // Accept both old + new payload shapes
    const baseText =
      typeof body.text === "string"
        ? body.text
        : typeof body.draftText === "string"
        ? body.draftText
        : "";

    const instructions =
      typeof body.notes === "string"
        ? body.notes
        : typeof body.instructions === "string"
        ? body.instructions
        : "";

    const scenario = typeof body.scenario === "string" ? body.scenario : "";
    const versionType =
      typeof body.versionType === "string" ? body.versionType : "";
    const publicSearch = body.publicSearch === true;
    const maxWords = typeof body.maxWords === "number" ? body.maxWords : null;

    const sources = Array.isArray(body.sources) ? body.sources : [];

    const modelId =
      typeof body.model === "string" && body.model.trim()
        ? body.model.trim()
        : "gpt-4o-mini";

    if (!baseText.trim())
      return res.status(400).json({ error: "Missing base text to rewrite" });
    if (!instructions.trim())
      return res.status(400).json({ error: "Missing rewrite instructions" });

    // Optional web enrichment (toggle-controlled)
    let web = { ok: false, query: "", results: [], error: null };
    let webResultsForPrompt = "";
    let webReferences = [];

    if (publicSearch) {
      const qParts = [];
      if (scenario.trim()) qParts.push(scenario.trim());
      if (versionType.trim()) qParts.push(versionType.trim());
      if (instructions.trim()) qParts.push(instructions.trim().slice(0, 220));
      const firstLine =
        baseText.split(/\r?\n/).find((x) => x.trim())?.trim() || "";
      if (firstLine) qParts.push(firstLine.slice(0, 160));

      const query =
        qParts.filter(Boolean).join(" — ").slice(0, 320) ||
        "General background";
      web = await tavilySearch({ query, maxResults: 5 });

      if (web.ok) {
        webResultsForPrompt = formatWebResultsForPrompt(web.results);
        webReferences = webResultsToReferences(web.results);
      }
    }

    const lengthGuidance =
      typeof maxWords === "number" && maxWords > 0
        ? `Target rewritten length: <= ${Math.round(
            maxWords
          )} words (hard cap). If the instructions explicitly say to expand or shorten, obey those instructions first, but do not exceed the cap.`
        : "Keep roughly similar length unless the instructions explicitly say otherwise.";

    const systemPrompt = `
You are rewriting an investment draft based on author instructions.

${STYLE_GUIDE_INSTRUCTIONS}

RULES:
- Do not add new deal-specific facts unless already present in the base draft or instructions.
- Use the attached SOURCES only to clarify or tighten language. Do not invent new specifics.
- If web results are provided, use them only for general context/definitions; do not invent specifics.
${lengthGuidance}

SOURCES USED REPORT (IMPORTANT):
After the rewritten draft, append a machine-readable report in this EXACT format:

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

    const sourcesBlock = buildSourcesBlock(sources);

    const userPrompt = `
SCENARIO:
${scenario || "(none)"}

VERSION TYPE:
${versionType || "(none)"}

REWRITE INSTRUCTIONS:
${instructions}

BASE DRAFT:
${baseText}

SOURCES:
${sourcesBlock}

WEB RESULTS (only if publicSearch enabled):
${webResultsForPrompt || "(not enabled or no results)"}
`.trim();

    const maxCompletionTokens =
      typeof maxWords === "number" && maxWords > 0
        ? approximateTokensFromWords(maxWords)
        : 1800;

    const completion = await client.chat.completions.create({
      model: modelId,
      temperature: 0.25,

      // Compatibility: different model routes may honor one or the other.
      max_tokens: maxCompletionTokens,
      max_completion_tokens: maxCompletionTokens,

      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content?.trim() || "";
    if (!raw) {
      return res
        .status(500)
        .json({ error: "Model returned empty rewrite text." });
    }

    const extracted = extractSourcesUsedBlock(raw);
    let rewrittenText = extracted.cleaned;
    const sourcesUsed = normalizeSourcesUsed(extracted.sourcesUsed);

    // Guaranteed cap (only if maxWords provided)
    if (typeof maxWords === "number" && maxWords > 0) {
      const hardCap = Math.round(maxWords * 1.05);
      if (countWords(rewrittenText) > hardCap) {
        try {
          rewrittenText = await compressToWordLimit({
            modelId,
            text: rewrittenText,
            maxWords,
          });
        } catch {
          // If clamp fails, return the original; token cap should prevent most overshoots.
        }
      }
    }

    return res.status(200).json({
      // Backward-compatible + new
      text: rewrittenText,
      draftText: rewrittenText,

      // NEW: for Sources Used panel
      sourcesUsedRows: sourcesUsed,

      meta: {
        sourcesUsed,

        webSearch: {
          enabled: publicSearch,
          used: Boolean(publicSearch && web.ok && webReferences.length),
          provider: "tavily",
          query: publicSearch ? web.query : null,
          resultsCount: publicSearch ? webReferences.length : 0,
          error: publicSearch && !web.ok ? web.error || "Web search failed" : null,
          note: "Rewrite uses web search only when the draft toggle is enabled.",
        },
        references: webReferences,
      },
    });
  } catch (err) {
    return res.status(500).json({
      error: "Failed to rewrite draft",
      details: err?.message || String(err),
    });
  }
}
