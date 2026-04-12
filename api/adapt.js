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
  OUTPUT_TYPE,
} from "../lib/output-intent.js";
import { prepareUploadedSourcesForPipeline } from "../lib/extract-text-from-source.mjs";

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

/** A9.10: Drop bulky base64 from prompt JSON when extracted text is present. */
function adaptSourceJsonForPrompt(s) {
  if (!s || typeof s !== "object") return s;
  const o = { ...s };
  if (typeof o.text === "string" && o.text.trim().length > 0 && "contentBase64" in o) {
    delete o.contentBase64;
  }
  return o;
}

/**
 * A9.10: PDF (and other file) sources → plain text via pipeline; never throws.
 * On batch failure, uses successful prefix then per-source extraction; falls back to original.
 */
async function prepareSourcesForAdaptPrompt(sources) {
  if (!Array.isArray(sources) || sources.length === 0) return sources;

  try {
    const prep = await prepareUploadedSourcesForPipeline(sources);
    if (!prep.error && Array.isArray(prep.sources) && prep.sources.length === sources.length) {
      return prep.sources.map(adaptSourceJsonForPrompt);
    }

    const head = Array.isArray(prep.sources) ? prep.sources : [];
    const merged = [];
    for (let i = 0; i < sources.length; i++) {
      if (i < head.length) {
        merged.push(adaptSourceJsonForPrompt(head[i]));
        continue;
      }
      try {
        const one = await prepareUploadedSourcesForPipeline([sources[i]]);
        if (!one.error && one.sources?.[0]) {
          merged.push(adaptSourceJsonForPrompt(one.sources[0]));
        } else {
          merged.push(adaptSourceJsonForPrompt(sources[i]));
        }
      } catch {
        merged.push(adaptSourceJsonForPrompt(sources[i]));
      }
    }
    return merged;
  } catch {
    return sources.map(adaptSourceJsonForPrompt);
  }
}

/**
 * A9.6: Optional press-quote and LinkedIn URL lines for the adapt prompt only.
 * @param {string} targetOutputType
 * @param {{ name?: string, title?: string, quote?: string } | null} quoteAttribution
 * @param {string} linkedInUrl
 * @returns {string}
 */
function buildAdaptOptionalGuidance(targetOutputType, quoteAttribution, linkedInUrl) {
  const lines = [];
  if (targetOutputType === OUTPUT_TYPE.PRESS_RELEASE && quoteAttribution && typeof quoteAttribution === "object") {
    const name = typeof quoteAttribution.name === "string" ? quoteAttribution.name.trim() : "";
    const title = typeof quoteAttribution.title === "string" ? quoteAttribution.title.trim() : "";
    const quote = typeof quoteAttribution.quote === "string" ? quoteAttribution.quote.trim() : "";
    if (name && title) {
      lines.push(`Include a quote attributed to ${name}, ${title}.`);
      if (quote) {
        lines.push(`Use this exact quote text: ${JSON.stringify(quote)}`);
      } else {
        lines.push(
          "No quote text was provided; use the bracketed QUOTE placeholder from the structural guidance (with the given speaker name and title) instead of inventing a quote."
        );
      }
    }
  }
  if (targetOutputType === OUTPUT_TYPE.LINKEDIN_POST) {
    const url = typeof linkedInUrl === "string" ? linkedInUrl.trim() : "";
    if (url) {
      lines.push(`Include this URL as the final line of the post with a natural call to action: ${url}`);
    }
  }
  return lines.length ? `${lines.join("\n")}\n` : "";
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

    const rawQuoteAttribution = body.quoteAttribution ?? body.quote_attribution;
    let quoteAttribution = null;
    if (rawQuoteAttribution && typeof rawQuoteAttribution === "object" && !Array.isArray(rawQuoteAttribution)) {
      quoteAttribution = {
        name: typeof rawQuoteAttribution.name === "string" ? rawQuoteAttribution.name : "",
        title: typeof rawQuoteAttribution.title === "string" ? rawQuoteAttribution.title : "",
        quote: typeof rawQuoteAttribution.quote === "string" ? rawQuoteAttribution.quote : "",
      };
    }
    const linkedInRaw = body.linkedInUrl ?? body.linked_in_url;
    const linkedInUrl = typeof linkedInRaw === "string" ? linkedInRaw : "";

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
    const optionalGuidance = buildAdaptOptionalGuidance(targetOutputType, quoteAttribution, linkedInUrl);

    const sourcesForPrompt = await prepareSourcesForAdaptPrompt(sources);

    const prompt = `
You are adapting an existing draft to a new output format and visibility. Use the SAME facts and source material; do not invent new facts.

FROM: ${fromOutputType} (${fromVisibility})
TO: ${targetOutputType} (${targetVisibility})

FORMAT GUIDANCE FOR TARGET: ${targetGuidance}
${optionalGuidance ? `ADDITIONAL TARGET INSTRUCTIONS:\n${optionalGuidance}` : ""}
BASE DRAFT (adapt this content):
---
${baseDraftText}
---

SOURCES (same universe; do not add facts not present here or in the draft):
${sourcesForPrompt.length ? JSON.stringify(sourcesForPrompt, null, 2) : "(none)"}

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
