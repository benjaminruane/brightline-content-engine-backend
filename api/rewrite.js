// api/rewrite.js
//
// Rewrites an existing draft.
// Web search behaviour:
// - publicSearch === true: enrich rewrite with web search results
// - publicSearch === false: do not retrieve from web
//
// Accepts:
// - text OR draftText
// - notes OR instructions
// - sources[]
//
// Returns:
// - text + draftText
// - sourcesUsedRows[] describing what was used (attached + web refs when enabled)
// - meta.webSearch info
//
// Word-count behaviour (IMPORTANT):
// - If rewrite instructions include an explicit word target (e.g., "Expand to 100 words"),
//   that target OVERRIDES the MaxWords UI value for rewrite only.
//
// Model is instructed to append a [SOURCES_USED] JSON block that we strip out.

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

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function coercePositiveInt(v) {
  const n =
    typeof v === "number" ? v : typeof v === "string" ? Number(v.trim()) : NaN;

  if (!Number.isFinite(n)) return null;
  const i = Math.round(n);
  return i > 0 ? i : null;
}

function completionTokensForWordTarget(targetWords) {
  // Tight but safe; we still clamp.
  return Math.min(4096, Math.max(160, Math.round(targetWords * 1.6) + 120));
}

function countWords(text) {
  const s = typeof text === "string" ? text.trim() : "";
  if (!s) return 0;
  return s.split(/\s+/).filter(Boolean).length;
}

async function compressToWordLimit({ modelId, text, maxWords }) {
  const targetWords = coercePositiveInt(maxWords);
  if (!targetWords) return text;

  const maxCompletionTokens = completionTokensForWordTarget(targetWords);

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
  if (!m) return { cleaned: text.trim(), sourcesUsed: [] };

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
      const sourceIndex = typeof x?.sourceIndex === "number" ? x.sourceIndex : null;
      const name = typeof x?.name === "string" ? x.name : "";
      const url = typeof x?.url === "string" ? x.url : null;
      const usedPortion = typeof x?.usedPortion === "string" ? x.usedPortion : "";
      const references = Array.isArray(x?.references)
        ? x.references.filter((r) => typeof r === "string")
        : [];
      return { sourceIndex, name, url, usedPortion, references };
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

function webReferencesToSourcesUsedRows(webRefs) {
  const arr = Array.isArray(webRefs) ? webRefs : [];
  return arr
    .filter((r) => r && typeof r.url === "string" && r.url.trim())
    .slice(0, 8)
    .map((r, i) => ({
      id: `web_${Date.now()}_${i}_${Math.random().toString(16).slice(2)}`,
      name:
        typeof r.title === "string" && r.title.trim()
          ? r.title.trim()
          : r.url.trim(),
      type: "web",
      url: r.url.trim(),
      usedPortion: "web search result (used for context)",
      refs: null,
    }));
}

// IMPORTANT: instruction word target overrides MaxWords for rewrite.
function extractWordTargetFromInstructions(instructions) {
  const s = typeof instructions === "string" ? instructions : "";
  const t = s.replace(/\s+/g, " ").trim();

  const patterns = [
    /(?:expand|increase|grow|lengthen|extend)\s+(?:to|into|up to)\s+(\d{1,5})\s+words?/i,
    /(?:reduce|shorten|cut|trim)\s+(?:to|into|down to)\s+(\d{1,5})\s+words?/i,
    /(?:around|about|approx(?:\.|imately)?)\s+(\d{1,5})\s+words?/i,
    /(?:max(?:imum)?|up to|no more than|<=)\s*(\d{1,5})\s+words?/i,
    // We deliberately do NOT include a last-resort "\b(\d+) words\b" to avoid false positives
    // from unrelated text in instructions.
  ];

  for (const re of patterns) {
    const m = t.match(re);
    if (m && m[1]) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0) return Math.round(n);
    }
  }
  return null;
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
      typeof req.body === "string"
        ? safeJsonParse(req.body || "{}") || {}
        : req.body || {};

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
    const versionType = typeof body.versionType === "string" ? body.versionType : "";
    const publicSearch = body.publicSearch === true;

    const uiMaxWords = coercePositiveInt(body.maxWords);
    const instructionWordTarget = extractWordTargetFromInstructions(instructions);
    const effectiveMaxWords = instructionWordTarget || uiMaxWords || null;

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
        qParts.filter(Boolean).join(" — ").slice(0, 320) || "General background";

      try {
        const results = await tavilySearch({ query, maxResults: 5 });
        web = results;

        if (web?.ok) {
          webResultsForPrompt = formatWebResultsForPrompt(web.results);
          webReferences = webResultsToReferences(web.results);
        }
      } catch (e) {
        web = { ok: false, query, results: [], error: e?.message || String(e) };
        webResultsForPrompt = "";
        webReferences = [];
      }
    }

    const lengthGuidance = effectiveMaxWords
      ? `Target rewritten length: <= ${effectiveMaxWords} words (hard cap). IMPORTANT: If the rewrite instructions specify a word target, obey that target.`
      : "Keep roughly similar length unless the instructions explicitly say otherwise.";

    const systemPrompt = `
You are rewriting an investment draft based on author instructions.

${STYLE_GUIDE_INSTRUCTIONS}

RULES:
- Follow the rewrite instructions exactly.
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

    const maxCompletionTokens = effectiveMaxWords
      ? completionTokensForWordTarget(effectiveMaxWords)
      : 1800;

    const completion = await client.chat.completions.create({
      model: modelId,
      temperature: 0.25,
      max_completion_tokens: maxCompletionTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    let raw = completion.choices?.[0]?.message?.content?.trim() || "";

    // Rarely, the model returns an empty message. Retry once with a slightly
    // more deterministic temperature before failing.
    if (!raw) {
      const retry = await client.chat.completions.create({
        model: modelId,
        temperature: 0.05,
        max_completion_tokens: maxCompletionTokens,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content:
              userPrompt +
              "\n\nIMPORTANT: You must return a non-empty rewritten draft. Do not return an empty response.",
          },
        ],
      });
      raw = retry.choices?.[0]?.message?.content?.trim() || "";
    }

    if (!raw) {
      return res.status(500).json({ error: "Model returned empty rewrite text." });
    }

    const extracted = extractSourcesUsedBlock(raw);
    let rewrittenText = extracted.cleaned;
    const sourcesUsed = normalizeSourcesUsed(extracted.sourcesUsed);

    // Enforce effectiveMaxWords via clamp (especially important for small targets)
    if (effectiveMaxWords) {
      const wc = countWords(rewrittenText);
      const hardCap = Math.round(effectiveMaxWords * 1.05);
      const mustClamp =
        effectiveMaxWords <= 120 ? wc > effectiveMaxWords : wc > hardCap;

      if (mustClamp) {
        try {
          rewrittenText = await compressToWordLimit({
            modelId,
            text: rewrittenText,
            maxWords: effectiveMaxWords,
          });
        } catch {
          // If clamp fails, return original.
        }
      }
    }

    // SourcesUsedRows: attached sources (from model report) + web references (if enabled)
    const normalizedSourceRows = (Array.isArray(sourcesUsed) ? sourcesUsed : []).map(
      (x, idx) => ({
        id: `src_${x.sourceIndex ?? idx + 1}_${Math.random().toString(16).slice(2)}`,
        name: x.name || `Source ${idx + 1}`,
        type: "attached",
        url: x.url || null,
        usedPortion: x.usedPortion || "",
        refs: Array.isArray(x.references) && x.references.length ? x.references : null,
      })
    );

    const webRows =
      publicSearch === true && Array.isArray(webReferences) && webReferences.length
        ? webReferencesToSourcesUsedRows(webReferences)
        : [];

    const mergedRows = [...normalizedSourceRows, ...webRows];

    return res.status(200).json({
      text: rewrittenText,
      draftText: rewrittenText,

      sourcesUsedRows: mergedRows,

      meta: {
        sourcesUsed,
        wordTarget: {
          uiMaxWords: uiMaxWords || null,
          instructionWordTarget: instructionWordTarget || null,
          effectiveMaxWords: effectiveMaxWords || null,
        },
        webSearch: {
          enabled: publicSearch,
          used: Boolean(publicSearch && web?.ok && webReferences.length),
          provider: "tavily",
          query: publicSearch ? web.query : null,
          references: webReferences,
          error: publicSearch && !web?.ok ? web.error || "Web search failed" : null,
          note: "Rewrite uses web search only when the draft toggle is enabled.",
        },
      },
    });
  } catch (err) {
    return res.status(500).json({
      error: "Failed to rewrite draft",
      details: err?.message || String(err),
    });
  }
}
