// api/rewrite.js
//
// Rewrites an existing draft.
// Web search behaviour:
// - publicSearch === true: enrich rewrite with web search results
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

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function countWords(text) {
  const t = typeof text === "string" ? text.trim() : "";
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

function completionTokensForWordTarget(wordTarget) {
  // rough heuristic: ~1.3 tokens per word + buffer
  const w = Math.max(1, Number(wordTarget) || 0);
  return Math.min(2400, Math.max(600, Math.round(w * 1.3 + 500)));
}

function extractSourcesUsedBlock(text) {
  // expected: "SOURCES USED:" JSON block; fallback to raw text
  const raw = typeof text === "string" ? text : "";
  const marker = "SOURCES USED:";
  const idx = raw.indexOf(marker);
  if (idx === -1) return { cleaned: raw.trim(), sourcesUsed: [] };

  const cleaned = raw.slice(0, idx).trim();
  const jsonText = raw.slice(idx + marker.length).trim();

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
      const type = typeof x?.type === "string" ? x.type : "";
      const url = typeof x?.url === "string" ? x.url : null;
      const usedPortion = typeof x?.usedPortion === "string" ? x.usedPortion : "";
      const refs = Array.isArray(x?.refs) ? x.refs.filter((r) => typeof r === "string") : [];
      return { sourceIndex, name, type, url, usedPortion, refs };
    })
    .filter((x) => x.name || x.url);
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "Missing OPENAI_API_KEY environment variable" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

    const baseText =
      (typeof body.text === "string" && body.text) ||
      (typeof body.draftText === "string" && body.draftText) ||
      "";

    const instructions =
      (typeof body.notes === "string" && body.notes) ||
      (typeof body.instructions === "string" && body.instructions) ||
      "";

    const sources = Array.isArray(body.sources) ? body.sources : [];
    const publicSearch = Boolean(body.publicSearch);

    const modelId =
      typeof body.modelId === "string" && body.modelId.trim() ? body.modelId.trim() : "gpt-5.1";

    const effectiveMaxWords =
      typeof body.maxWords === "number" && Number.isFinite(body.maxWords) && body.maxWords > 0
        ? body.maxWords
        : null;

    if (!baseText.trim()) return res.status(400).json({ error: "Missing base text to rewrite." });
    if (!instructions.trim())
      return res.status(400).json({ error: "Missing rewrite instructions." });

    const sourcesBlock = sources
      .map((s, i) => {
        const name = s?.name || `Source ${i + 1}`;
        const url = s?.url ? ` (${s.url})` : "";
        const text = typeof s?.text === "string" ? s.text : "";
        return `---\n${name}${url}\n${text.slice(0, 6000)}\n`;
      })
      .join("\n");

    let webResultsForPrompt = "";
    let webRefs = [];

    if (publicSearch) {
      const q = deriveQueryFromDraft({ draftText: baseText, title: body.title || "" });
      const search = await tavilySearch(q);
      webResultsForPrompt = formatWebResultsForPrompt(search);
      webRefs = webResultsToReferences(search?.results || []);
    }

    const system = `
You are rewriting a draft. Follow the REWRITE INSTRUCTIONS precisely.

Return the rewritten draft text first.
Then include a "SOURCES USED:" line followed by a JSON object with:
{
  "sourcesUsed": [
    {"sourceIndex": number, "name": string, "type": "file"|"url"|"web", "url": string|null,
     "usedPortion": string, "refs": [string]}
  ]
}

Rules:
- Keep output clean (no extra commentary).
- If web results were provided, you MAY draw on them only when publicSearch is enabled.
`.trim();

    const user = `
REWRITE INSTRUCTIONS:
${instructions}

WORD LIMIT (soft):
${effectiveMaxWords ? `${effectiveMaxWords} words` : "(none)"}

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

    const runOnce = async (temp) => {
      const completion = await client.chat.completions.create({
        model: modelId,
        temperature: temp,
        max_completion_tokens: maxCompletionTokens,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      });
      return (completion.choices?.[0]?.message?.content || "").trim();
    };

    // Retry once if empty (prevents your toast) ✅
    let raw = await runOnce(0.25);
    if (!raw) raw = await runOnce(0.15);

    if (!raw) {
      return res.status(500).json({ error: "Model returned empty rewrite text." });
    }

    const extracted = extractSourcesUsedBlock(raw);
    let rewrittenText = extracted.cleaned;
    const sourcesUsed = normalizeSourcesUsed(extracted.sourcesUsed);

    if (effectiveMaxWords) {
      // crude clamp (don’t over-think here)
      const wc = countWords(rewrittenText);
      if (wc > effectiveMaxWords) {
        const tokens = rewrittenText.split(/\s+/).slice(0, effectiveMaxWords);
        rewrittenText = tokens.join(" ");
      }
    }

    return res.status(200).json({
      ok: true,
      text: rewrittenText,
      draftText: rewrittenText,
      sourcesUsedRows: sourcesUsed,
      meta: {
        webSearch: {
          enabled: publicSearch,
          used: publicSearch && !!webResultsForPrompt,
          references: publicSearch ? webRefs : [],
        },
      },
    });
  } catch (err) {
    return res.status(500).json({ error: "Rewrite failed", details: err?.message || String(err) });
  }
}
