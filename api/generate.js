// api/generate.js
//
// Generates a new draft.
// Web search behaviour:
// - publicSearch === true: enrich with web search results
// - publicSearch === false: do not retrieve from web
//
// NEW:
// - Returns sourcesUsedRows[] at the top-level for convenient frontend consumption.
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
- Write in third-person voice by default (e.g., "the firm", "the company", "Partners Group", "it", "they").
  Use third-person even if source documents use first or second person.
`.trim();

// Detect voice override in user instructions (Notes or Rewrite instructions)
function detectVoiceOverride(text) {
  if (typeof text !== "string" || !text.trim()) return null;
  
  const lower = text.toLowerCase();
  
  // Check for explicit voice instructions
  const firstPersonPatterns = [
    /\b(use|write in|write|employ|adopt)\s+(first[\s-]?person|I|we|our|us)\b/,
    /\bfirst[\s-]?person\b/,
    /\buse\s+(I|we|our|us)\b/,
  ];
  
  const secondPersonPatterns = [
    /\b(use|write in|write|employ|adopt)\s+(second[\s-]?person|you|your)\b/,
    /\bsecond[\s-]?person\b/,
    /\buse\s+(you|your)\b/,
  ];
  
  const thirdPersonPatterns = [
    /\b(use|write in|write|employ|adopt)\s+(third[\s-]?person|it|they|them|their)\b/,
    /\bthird[\s-]?person\b/,
  ];
  
  // Check in order: explicit third-person override, then first, then second
  for (const pattern of thirdPersonPatterns) {
    if (pattern.test(lower)) return "third";
  }
  
  for (const pattern of firstPersonPatterns) {
    if (pattern.test(lower)) return "first";
  }
  
  for (const pattern of secondPersonPatterns) {
    if (pattern.test(lower)) return "second";
  }
  
  return null; // No override detected, use default (third-person)
}

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

// Extract citation numbers from text (e.g., [1], [2] -> [1, 2])
function extractCitations(text) {
  if (typeof text !== "string") return [];
  const citationPattern = /\[(\d+)\]/g;
  const citations = new Set();
  let match;
  while ((match = citationPattern.exec(text)) !== null) {
    const num = parseInt(match[1], 10);
    if (num > 0) citations.add(num);
  }
  return Array.from(citations).sort((a, b) => a - b);
}

// Heuristic to detect unattributed enrichment
// Returns true if web search was enabled but no citations found, and output seems enriched
function detectUnattributedEnrichment(draftText, webEnabled, usedReferenceIds, uploadedSources) {
  if (!webEnabled || usedReferenceIds.length > 0) return false;
  
  // Simple heuristic: if web search enabled but no citations, flag it
  // This is conservative - we flag when web was enabled but not used
  // More sophisticated detection could check if draft contains facts not in sources,
  // but that's complex and error-prone, so we keep it simple
  return true;
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
    const body = typeof req.body === "string" ? safeJsonParse(req.body) : req.body || {};
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

    // Detect voice override in Notes
    const voiceOverride = detectVoiceOverride(safeNotes);
    const voiceInstruction = voiceOverride === "first"
      ? "Write in first-person voice (use 'I', 'we', 'our', 'us')."
      : voiceOverride === "second"
      ? "Write in second-person voice (use 'you', 'your')."
      : "Write in third-person voice (use 'the firm', 'the company', 'it', 'they', 'their'). This is the default style, even if source documents use first or second person.";

    const userPrompt = `
You are generating a draft. Follow the style guide.

Inputs:
Title: ${safeTitle || "(none)"}
Notes: ${safeNotes || "(none)"}
Scenario: ${safeScenario || "(none)"}
Selected types: ${safeSelectedTypes.length ? safeSelectedTypes.join(", ") : "(none)"}
Version type: ${safeVersionType || "(none)"}

Web search enabled: ${safePublicSearch ? "true" : "false"}

VOICE REQUIREMENT:
${voiceInstruction}

WEB RESULTS:
${webResultsForPrompt || "(none)"}

SOURCES (user uploaded / URLs):
${safeSources.length ? JSON.stringify(safeSources, null, 2) : "(none)"}

CRITICAL ATTRIBUTION RULES:
${safePublicSearch && webReferences.length > 0 ? `
- If you use ANY factual information from web results, you MUST cite it with inline bracket citations [1], [2], etc.
- Citations must match the numbered web sources (e.g., [1] refers to the first web source listed above).
- If you cannot cite a claim to a web source, DO NOT include that claim.
- Only use information that is either:
  (a) explicitly stated in the uploaded sources, OR
  (b) from web results with proper citation [n]
` : `
- Use only information from the uploaded sources provided above.
`}

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

    // Extract citations and derive usedReferenceIds
    const citations = extractCitations(draftText);
    const usedReferenceIds = citations.filter((id) => 
      webReferences.some((ref) => ref.id === id)
    );

    // Detect unattributed enrichment
    const unattributedEnrichment = detectUnattributedEnrichment(
      draftText,
      safePublicSearch,
      usedReferenceIds,
      safeSources
    );

    const flags = {
      unattributedEnrichment: Boolean(unattributedEnrichment),
      unattributedEnrichmentNotes: unattributedEnrichment
        ? "Web search was enabled but no web sources were cited in the draft. Any factual enrichment beyond uploaded sources must be cited."
        : null,
    };

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
          usedReferenceIds: usedReferenceIds.length > 0 ? usedReferenceIds : [],
        },
        flags,
      },
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err?.message || "Unknown error",
    });
  }
}
