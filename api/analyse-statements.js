// api/analyse-statements.js
//
// Statement analysis endpoint.
// Behavior: Always-on web retrieval (Phase 3).
// Scoring: rules-based (no LLM self-scoring).
// Extraction: LLM-assisted.

import OpenAI from "openai";
import {
  tavilySearch,
  formatWebResultsForPrompt,
  webResultsToReferences,
  deriveQueryFromDraft,
} from "./_web.js";

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin === "null" ? "*" : origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

const client = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function stripPlaceholders(text) {
  if (typeof text !== "string") return "";
  return text.replace(/\[(?:SOURCE|CITATION):[^\]]+\]/g, "").trim();
}

function deriveQueryFromDraft(draftText) {
  return deriveQueryFromDraftOriginal(draftText);
}

// Preserve original import name to avoid accidental refactors
function deriveQueryFromDraftOriginal(draftText) {
  return deriveQueryFromDraft(draftText);
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!client) {
    return res
      .status(500)
      .json({ error: "Missing OPENAI_API_KEY environment variable" });
  }

  try {
    const body =
      typeof req.body === "string" ? safeJsonParse(req.body || "{}") : req.body || {};

    const draftText = typeof body.draftText === "string" ? body.draftText : "";
    const modelId =
      typeof body.modelId === "string" && body.modelId.trim() ? body.modelId.trim() : "gpt-5.1";

    if (!draftText.trim()) {
      return res.status(400).json({ error: "Missing or invalid draftText" });
    }

    // Always-on web retrieval
    const cleanDraft = stripPlaceholders(draftText);
    const searchQuery = deriveQueryFromDraft(cleanDraft);
    const search = await tavilySearch({ query: searchQuery, maxResults: 6 });
    const webBlock = search.ok ? formatWebResultsForPrompt(search.results) : "";
    const webReferences = search.ok ? webResultsToReferences(search.results) : [];

    // User-provided sources (files/URLs) are treated as "uploaded" evidence for analysis.
    const uploadedSources = Array.isArray(req?.body?.sources) ? req.body.sources : [];
    const uploadedReferences = uploadedSources
      .map((s, i) => ({
        idx: i + 1,
        title: typeof s?.name === "string" ? s.name : `Source ${i + 1}`,
        url: typeof s?.url === "string" ? s.url : null,
        snippet: "",
        kind: s?.kind || "source",
        type: s?.type || "unknown",
      }))
      .slice(0, 8);

    const system = `
You are the "Review" engine inside Content Engine.

You will:
1) Extract atomic factual statements from the draft.
2) For each statement, assess:
   - Evidence quality
   - Consistency with other statements
   - Support from web references (if present)
3) Return ONLY valid JSON.

Citations:
- Use bracket citations [1], [2], ... referring to WEB REFERENCES list.
- If web results are empty, do not invent sources; say evidence is unavailable.

Return JSON schema:
{
  "statements": [
    {
      "text": "string",
      "assessment": {
        "reliabilityScore": number,
        "reliabilityLabel": "High|Medium|Low",
        "reasons": ["string", ...],
        "citations": [1,2]
      }
    }
  ]
}
`.trim();

    const user = `
DRAFT:
${draftText}

WEB RESULTS:
${webBlock || "(none)"}

WEB REFERENCES:
${webReferences
  .slice(0, 8)
  .map((r, i) => `[${i + 1}] ${r.title} — ${r.url}`)
  .join("\n") || "(none)"}

UPLOADED REFERENCES:
${uploadedReferences
  .map((r) => `- ${r.title}${r.url ? ` (${r.url})` : ""}`)
  .join("\n") || "(none)"}
`.trim();

    const completion = await client.chat.completions.create({
      model: modelId,
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    const raw = completion?.choices?.[0]?.message?.content || "";
    const parsed = safeJsonParse(raw) || {};
    const statements = Array.isArray(parsed.statements) ? parsed.statements : [];

    return res.status(200).json({
      ok: true,
      statements,
      references: webReferences,
      meta: {
        webSearch: { enabled: true, used: Boolean(search?.ok && search?.results?.length) },
      },
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "Analyse failed",
      details: err?.message || String(err),
    });
  }
}
