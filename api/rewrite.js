// api/rewrite.js
//
// Rewrites an existing draft.
// Behaviour:
// - publicSearch === true: retrieve from web
// - publicSearch === false: do not retrieve from web

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

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeSourcesUsedRows(rows) {
  const arr = Array.isArray(rows) ? rows : [];
  return arr
    .filter((r) => r && typeof r === "object")
    .map((r) => ({
      title: typeof r.title === "string" ? r.title : "",
      url: typeof r.url === "string" ? r.url : "",
      snippet: typeof r.snippet === "string" ? r.snippet : "",
    }));
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!client) {
    return res.status(500).json({ error: "Missing OPENAI_API_KEY environment variable" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

    const baseText =
      (typeof body.text === "string" && body.text) ||
      (typeof body.draftText === "string" && body.draftText) ||
      "";

    const instructions = typeof body.instructions === "string" ? body.instructions : "";

    const modelId =
      typeof body.modelId === "string" && body.modelId.trim() ? body.modelId.trim() : "gpt-5.1";

    const effectiveMaxWords =
      typeof body.maxWords === "number" && Number.isFinite(body.maxWords) && body.maxWords > 0
        ? body.maxWords
        : null;

    const publicSearch = Boolean(body.publicSearch);
    const sources = Array.isArray(body.sources) ? body.sources : [];

    if (!baseText.trim()) return res.status(400).json({ error: "Missing base text to rewrite." });
    if (!instructions.trim())
      return res.status(400).json({ error: "Missing rewrite instructions." });

    let webResultsForPrompt = "";
    let webReferences = [];
    let web = { ok: false, enabled: false, used: false };

    if (publicSearch) {
      const query = deriveQueryFromDraft(
        [instructions, baseText].filter(Boolean).join("\n\n")
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

    const prompt = `
Rewrite the text according to the instructions.

INSTRUCTIONS:
${instructions}

TEXT:
${baseText}

WEB RESULTS:
${webResultsForPrompt || "(none)"}

SOURCES:
${sources.length ? JSON.stringify(sources, null, 2) : "(none)"}

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
    const rewritten =
      typeof parsed.draftText === "string" && parsed.draftText.trim()
        ? parsed.draftText.trim()
        : "";

    if (!rewritten) {
      return res.status(500).json({ error: "Rewrite failed. Please try again." });
    }

    const existingSourcesUsed = normalizeSourcesUsedRows(body?.sourcesUsed?.references || []);

    return res.status(200).json({
      ok: true,
      draftText: rewritten,
      sourcesUsed: {
        web: publicSearch
          ? { enabled: true, used: Boolean(web?.ok), provider: "tavily", query: web?.query || "" }
          : { enabled: false, used: false },
        references: [...existingSourcesUsed, ...webReferences],
      },
      meta: { maxWords: effectiveMaxWords },
    });
  } catch (err) {
    return res.status(500).json({ error: "Rewrite failed", details: err?.message || String(err) });
  }
}
