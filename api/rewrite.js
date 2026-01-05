// api/rewrite.js
//
// Rewrites an existing draft.
// Web search behaviour:
// - publicSearch === true: enrich with web search results
// - publicSearch === false: do not retrieve from web

import OpenAI from "openai";
import {
  tavilySearch,
  formatWebResultsForPrompt,
  webResultsToReferences,
  deriveQueryFromDraft,
} from "../lib/web.js";

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin === "null" ? "*" : origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
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
function detectUnattributedEnrichment(draftText, webEnabled, usedReferenceIds, uploadedSources) {
  if (!webEnabled || usedReferenceIds.length > 0) return false;
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
    const text = typeof body.text === "string" ? body.text : "";
    
    // Accept legacy frontend payloads:
    // - instructions (preferred)
    // - notes (Phase 2 frontend)
    // - rewriteNotes (defensive)
    const instructions =
      (typeof body.instructions === "string" ? body.instructions : "") ||
      (typeof body.notes === "string" ? body.notes : "") ||
      (typeof body.rewriteNotes === "string" ? body.rewriteNotes : "");
    
    const modelId =
      typeof body.modelId === "string" && body.modelId.trim() ? body.modelId.trim() : "gpt-5.1";
    const publicSearch = Boolean(body.publicSearch);
    const sources = Array.isArray(body.sources) ? body.sources : [];

    if (!text.trim()) return res.status(400).json({ error: "Missing text" });
    if (!instructions.trim()) return res.status(400).json({ error: "Missing instructions" });

    let webResultsForPrompt = "";
    let webReferences = [];
    let web = { ok: false };

    if (publicSearch) {
      const query = deriveQueryFromDraft([instructions, text].filter(Boolean).join("\n\n"));
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

    const prompt = `
Rewrite the draft based on the instructions.

INSTRUCTIONS:
${instructions}

DRAFT:
${text}

WEB RESULTS:
${webResultsForPrompt || "(none)"}

SOURCES:
${sources.length ? JSON.stringify(sources, null, 2) : "(none)"}

CRITICAL ATTRIBUTION RULES:
${publicSearch && webReferences.length > 0 ? `
- If you use ANY factual information from web results, you MUST cite it with inline bracket citations [1], [2], etc.
- Citations must match the numbered web sources (e.g., [1] refers to the first web source listed above).
- If you cannot cite a claim to a web source, DO NOT include that claim.
- Only use information that is either:
  (a) explicitly stated in the uploaded sources, OR
  (b) from web results with proper citation [n]
` : `
- Use only information from the uploaded sources provided above.
`}

Return ONLY JSON:
{
  "draftText": "string"
}
`.trim();

    const completion = await client.chat.completions.create({
      model: modelId,
      temperature: 0.2,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = completion?.choices?.[0]?.message?.content || "";
    const parsed = safeJsonParse(raw) || {};
    const draftText = typeof parsed.draftText === "string" ? parsed.draftText.trim() : "";

    if (!draftText) {
      return res.status(500).json({ ok: false, error: "Rewrite failed. Please try again." });
    }

    // Extract citations and derive usedReferenceIds
    const citations = extractCitations(draftText);
    const usedReferenceIds = citations.filter((id) => 
      webReferences.some((ref) => ref.id === id)
    );

    // Detect unattributed enrichment
    const unattributedEnrichment = detectUnattributedEnrichment(
      draftText,
      publicSearch,
      usedReferenceIds,
      sources
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
      sourcesUsed: {
        web: {
          enabled: Boolean(publicSearch),
          used: Boolean(publicSearch === true && web.ok && webReferences.length),
          provider: "tavily",
          query: web?.query || null,
          references: webReferences,
          usedReferenceIds: usedReferenceIds.length > 0 ? usedReferenceIds : [],
        },
        flags,
      },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || "Rewrite failed" });
  }
}
