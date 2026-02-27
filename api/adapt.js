// api/adapt.js
//
// SPEC X2.0: Adapt creates a derived draft from a base draft.
// Same source set; fresh retrieval within that set allowed.
// No invention of facts.

import OpenAI from "openai";
import {
  tavilySearch,
  formatWebResultsForPrompt,
  webResultsToReferences,
  deriveQueryFromDraft,
} from "../lib/web.js";
import {
  normalizeOutputType,
  normalizeVisibility,
  buildOutputIntent,
  getPromptGuidance,
} from "../lib/output-intent.js";

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin === "null" ? "*" : origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-brightline-diag");
}

function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
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
    const baseDraftId = typeof body.baseDraftId === "string" ? body.baseDraftId.trim() : null;
    const baseDraftText = typeof body.baseDraftText === "string" ? body.baseDraftText : "";
    const sources = Array.isArray(body.sources) ? body.sources : [];
    const fromOutputType = normalizeOutputType(body.fromOutputType ?? body.from_output_type ?? null);
    const fromVisibility = normalizeVisibility(body.fromVisibility ?? body.from_visibility ?? null);
    const targetOutputType = normalizeOutputType(body.targetOutputType ?? body.target_output_type ?? null);
    const targetVisibility = normalizeVisibility(body.targetVisibility ?? body.target_visibility ?? null);
    const modelId = typeof body.model === "string" && body.model.trim() ? body.model.trim() : "gpt-5.1";
    const publicSearch = Boolean(body.publicSearch);
    // X2.2: Optional word-limit override for Adapt (per-output cap persistence)
    const rawOverride = body.wordLimitOverride ?? body.word_limit_override ?? null;
    const overrideNum = typeof rawOverride === "number" && Number.isFinite(rawOverride) ? rawOverride : (typeof rawOverride === "string" && rawOverride.trim() !== "" ? parseInt(rawOverride, 10) : null);
    const MIN_WORDS = 20;
    const MAX_WORDS = 5000;
    let wordLimitOverride = null;
    if (overrideNum != null && !Number.isNaN(overrideNum)) {
      const clamped = Math.floor(Number(overrideNum));
      if (clamped >= MIN_WORDS && clamped <= MAX_WORDS) {
        wordLimitOverride = clamped;
      }
      // If out of bounds: ignore and could record warning in meta (do not fail request)
    }

    if (!baseDraftText.trim()) {
      return res.status(400).json({ error: "Missing baseDraftText" });
    }

    let webResultsForPrompt = "";
    let webReferences = [];
    if (publicSearch) {
      const query = deriveQueryFromDraft(baseDraftText);
      try {
        const results = await tavilySearch({ query, maxResults: 6 });
        webResultsForPrompt = formatWebResultsForPrompt(results);
        webReferences = webResultsToReferences(results?.results || []);
      } catch {
        webResultsForPrompt = "";
        webReferences = [];
      }
    }

    const targetGuidance = getPromptGuidance(targetOutputType, targetVisibility);
    const outputIntent = buildOutputIntent(targetOutputType, targetVisibility);

    const prompt = `
You are adapting an existing draft to a new output format and visibility. Use the SAME facts and source material; do not invent new facts.

FROM: ${fromOutputType} (${fromVisibility})
TO: ${targetOutputType} (${targetVisibility})

FORMAT GUIDANCE FOR TARGET: ${targetGuidance}

BASE DRAFT (adapt this content):
---
${baseDraftText}
---

SOURCES (same universe; do not add facts not present here or in the draft):
${sources.length ? JSON.stringify(sources, null, 2) : "(none)"}

WEB RESULTS (optional; cite [1], [2] if you use them):
${webResultsForPrompt || "(none)"}

Rules:
- Preserve all factual content from the base draft.
- Restructure and re-tone for the target type and visibility.
- Do not add claims that are not in the base draft or sources.
${publicSearch && webReferences.length ? "- If you use web results, cite with [1], [2], etc." : ""}
${wordLimitOverride != null ? `- Keep output under ~${wordLimitOverride} words where possible.` : ""}

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
      return res.status(500).json({ ok: false, error: "Adapt failed. Please try again." });
    }

    const derivation = {
      kind: "ADAPT",
      fromDraftId: baseDraftId ?? null,
      fromOutputType,
      toOutputType: targetOutputType,
      fromVisibility,
      toVisibility: targetVisibility,
    };

    const responseOutputIntent = {
      outputType: outputIntent.outputType,
      visibility: outputIntent.visibility,
      outputTypeLabel: outputIntent.outputTypeLabel,
      visibilityLabel: outputIntent.visibilityLabel,
    };
    if (wordLimitOverride != null) {
      responseOutputIntent.maxWords = wordLimitOverride;
    }

    return res.status(200).json({
      ok: true,
      draftText,
      meta: {
        outputIntent: responseOutputIntent,
        derivation,
      },
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err?.message || "Adapt failed",
    });
  }
}
