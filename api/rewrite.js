// /api/rewrite.js
//
// Rewrites an existing draft based on instructions and house style.
//
// Web search behaviour:
// - If publicSearch === true: enrich rewrite with public web search results.
// - If publicSearch === false: do NOT perform web retrieval.

import OpenAI from "openai";
import {
  tavilySearch,
  formatWebResultsForPrompt,
  webResultsToReferences,
} from "./_web.js";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// --- CORS helper --------------------------------------------------
function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";

  res.setHeader("Access-Control-Allow-Origin", origin === "null" ? "*" : origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
// ------------------------------------------------------------------

// Approx tokens helper (very rough; helps keep outputs bounded)
function approximateTokensFromWords(wordCount) {
  if (!wordCount || typeof wordCount !== "number" || !Number.isFinite(wordCount)) return 1200;
  return Math.max(900, Math.min(4096, Math.round(wordCount * 1.3)));
}

function applyHouseStyle(text) {
  if (typeof text !== "string") return "";
  return text.trim();
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "Missing OPENAI_API_KEY environment variable" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

    const text = typeof body.text === "string" ? body.text : "";
    const notes = typeof body.notes === "string" ? body.notes : "";
    const scenario = typeof body.scenario === "string" ? body.scenario : "";
    const versionType = typeof body.versionType === "string" ? body.versionType : "";
    const publicSearch = body.publicSearch === true;
    const maxWords = typeof body.maxWords === "number" ? body.maxWords : null;

    const resolvedModel =
      typeof body.model === "string" && body.model.trim() ? body.model.trim() : "gpt-4o-mini";

    if (!text.trim()) return res.status(400).json({ error: "Missing base text to rewrite" });
    if (!notes.trim()) return res.status(400).json({ error: "Missing rewrite instructions (notes)" });

    const lengthGuidance =
      typeof maxWords === "number" && maxWords > 0
        ? `Target rewritten length: around ${Math.round(maxWords)} words. If the instructions explicitly say to expand or shorten, obey those instructions first, but try to stay near this length.`
        : "Rewrite for clarity and structure. Keep roughly similar length unless the instructions explicitly say otherwise.";

    // --- Optional web enrichment for rewrite -------------------------------
    let web = { ok: false, query: "", results: [], error: null };
    let webResultsForPrompt = "";
    let webReferences = [];

    if (publicSearch) {
      const qParts = [];
      if (scenario && scenario.trim()) qParts.push(scenario.trim());
      if (versionType && versionType.trim()) qParts.push(versionType.trim());
      if (notes && notes.trim()) qParts.push(notes.trim().slice(0, 220));
      const firstLine = text.split(/\r?\n/).find((x) => x.trim())?.trim() || "";
      if (firstLine) qParts.push(firstLine.slice(0, 160));

      const query = qParts.filter(Boolean).join(" — ").slice(0, 320) || "General background";
      web = await tavilySearch({ query, maxResults: 5 });

      if (web.ok) {
        webResultsForPrompt = formatWebResultsForPrompt(web.results);
        webReferences = webResultsToReferences(web.results);
      }
    }

    const systemPrompt = [
      "You are revising an investment draft based on instructions from the author.",
      "",
      "HOUSE STYLE (MUST FOLLOW):",
      "- Currency:",
      "  • Use currency codes (USD, SGD, EUR). Format: USD 164,000.",
      "- Years:",
      "  • Never format years with thousand separators: write 2025, not 2,025.",
      "- Numbers:",
      "  • Use standard English commas for thousands (164,000).",
      "- Tone:",
      "  • Clear, concise, neutral, professional.",
      "",
      "RULES:",
      "- Do not add new deal-specific facts, numbers, dates, counterparties, or outcomes unless they are already present in the base draft OR explicitly stated in the rewrite instructions.",
      "- If web results are provided, use them only to improve general context/definitions and to avoid factual errors; do not invent specifics.",
      "- Preserve the author's intent and structure improvements.",
      "",
      lengthGuidance,
    ].join("\n");

    const userPrompt = `
SCENARIO:
${scenario || "(none)"}

VERSION TYPE:
${versionType || "(none)"}

REWRITE INSTRUCTIONS:
${notes}

BASE DRAFT:
${text}

WEB RESULTS (only if publicSearch enabled):
${webResultsForPrompt || "(not enabled or no results)"}
`.trim();

    const suggestedMaxTokens =
      typeof maxWords === "number" && maxWords > 0 ? approximateTokensFromWords(maxWords) : 1800;

    const completion = await client.chat.completions.create({
      model: resolvedModel,
      temperature: 0.25,
      max_tokens: suggestedMaxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    let rewritten = completion.choices?.[0]?.message?.content?.trim() || "";

    if (!rewritten) {
      console.error("Rewrite completion empty:", completion);
      return res.status(500).json({ error: "Model returned empty rewrite text." });
    }

    rewritten = applyHouseStyle(rewritten);

    return res.status(200).json({
      text: rewritten,
      meta: {
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
        model: completion.model || resolvedModel,
        usage: {
          promptTokens: completion.usage?.prompt_tokens ?? null,
          completionTokens: completion.usage?.completion_tokens ?? null,
          totalTokens: completion.usage?.total_tokens ?? null,
        },
      },
    });
  } catch (err) {
    console.error("Error in /api/rewrite:", err);
    return res.status(500).json({
      error: "Failed to rewrite draft",
      details: err?.message || String(err),
    });
  }
}
