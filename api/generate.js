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
Follow this style guide in all draft outputs:

- Currency:
  - Use "USD" followed by a space and a number with standard English thousand separators.
    Example: USD 1,500,000.
- Years:
  - Do NOT insert thousand separators into years: 2025, 1999.
- Quotation marks:
  - Prefer straight double quotes "like this".
- Tone:
  - Clear, concise, neutral, professional.
`.trim();

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

function buildSystemPrompt() {
  return `
You are a professional private markets writer inside a tool called Content Engine.

TASK:
Write an investor-grade draft based ONLY on:
- the user's title/notes/scenario/output types
- attached source excerpts (if any)
- and, if provided, web search results (ONLY when publicSearch is enabled)

STRICT RULES:
- Do not invent facts, numbers, dates, or company details not supported by inputs.
- If key information is missing, write around it cleanly with neutral placeholders.
- If web results are provided, use them only for general context (definitions/market context).
  Do not fabricate deal-specific details.

STYLE GUIDE:
${STYLE_GUIDE_INSTRUCTIONS}

SOURCES USED REPORT (IMPORTANT):
After the draft, append a machine-readable report in this EXACT format:

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
          const kind = typeof s?.kind === "string" ? s.kind : "source";
          const name = typeof s?.name === "string" ? s.name : `Source ${i + 1}`;
          const text = typeof s?.text === "string" ? s.text : "";
          const url = typeof s?.url === "string" ? s.url : "";
          const urlLine = url ? `URL: ${url}` : "URL: (none)";
          return `SOURCE ${i + 1} (${kind}) — ${name}\n${urlLine}\n${text}`.trim();
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
    ? `${maxWords} words max`
    : "(no max words provided)"
}

NOTES:
${safeNotes || "(none)"}

SOURCES:
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
      const sourceIndex = typeof x?.sourceIndex === "number" ? x.sourceIndex : null;
      const name = typeof x?.name === "string" ? x.name : "";
      const url = typeof x?.url === "string" ? x.url : null;
      const usedPortion = typeof x?.usedPortion === "string" ? x.usedPortion : "";
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

function coerceDraftText(rawContent) {
  const text = typeof rawContent === "string" ? rawContent.trim() : "";
  if (text) return text;
  return "Draft could not be generated. Please try again, or provide more notes and/or sources.";
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "Missing OPENAI_API_KEY environment variable" });
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
      model: modelIdRaw,
      publicSearch,
      sources,
    } = body;

    if (!title && !notes && (!Array.isArray(sources) || sources.length === 0)) {
      return res.status(400).json({
        error: "Missing content to generate from. Provide at least a title, notes, or one source excerpt.",
      });
    }

    const modelId =
      typeof modelIdRaw === "string" && modelIdRaw.trim() ? modelIdRaw.trim() : "gpt-4o-mini";

    // Optional web enrichment
    let web = { ok: false, query: "", results: [], error: null };
    let webResultsForPrompt = "";
    let webReferences = [];

    if (publicSearch === true) {
      const qParts = [];
      if (typeof title === "string" && title.trim()) qParts.push(title.trim());
      if (typeof scenario === "string" && scenario.trim()) qParts.push(scenario.trim());
      if (typeof notes === "string" && notes.trim()) qParts.push(notes.trim().slice(0, 200));
      const query = qParts.filter(Boolean).join(" — ").slice(0, 320) || "General background";

      web = await tavilySearch({ query, maxResults: 5 });
      if (web.ok) {
        webResultsForPrompt = formatWebResultsForPrompt(web.results);
        webReferences = webResultsToReferences(web.results);
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

    // IMPORTANT: use max_completion_tokens (not max_tokens)
    const maxCompletionTokens =
      typeof maxWords === "number" && maxWords > 0
        ? Math.min(4096, Math.max(900, Math.round(maxWords * 2)))
        : 2048;

    const completion = await client.chat.completions.create({
      model: modelId,
      temperature: 0.3,
      max_completion_tokens: maxCompletionTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const rawContent = completion.choices?.[0]?.message?.content || "";
    const draftRaw = coerceDraftText(rawContent);

    const extracted = extractSourcesUsedBlock(draftRaw);
    const draftText = extracted.cleaned;
    const sourcesUsed = normalizeSourcesUsed(extracted.sourcesUsed);

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
          query: publicSearch === true ? web.query : null,
          resultsCount: publicSearch === true ? webReferences.length : 0,
          error: publicSearch === true && !web.ok ? web.error || "Web search failed" : null,
          note: "Generate uses web search only when the draft toggle is enabled.",
        },
        references: webReferences,
      },
    });
  } catch (err) {
    return res.status(500).json({
      error: "Failed to generate draft",
      details: err?.message || String(err),
    });
  }
}
