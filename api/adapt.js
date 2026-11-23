import { withCors } from "../lib/http/with-cors.mjs";
// api/adapt.js
// Adapt is parked as of R4.1. Endpoint and code retained for future reactivation. Not wired to any UI.
//
// SPEC X2.0: Adapt creates a derived draft from a base draft.
// Same source set; fresh retrieval within that set allowed.
// No invention of facts.

import { applyCors } from "../lib/http/frontend-origins.mjs";
import { renderDraftingInstructions } from "../lib/style-guide/render.mjs";
import { styleForRequest } from "../lib/style-guide/request-style.mjs";
import { rememberAccount, requireAccount } from "../lib/auth/require-account.mjs";
import { reportRouteFailure } from "../lib/problem-events.mjs";
import { beginBillableRequest, endBillableRequest, enterRequestSpend } from "../lib/spend/ledger.mjs";
import {
  tavilySearch,
  formatWebResultsForPrompt,
  webResultsToReferences,
  deriveQueryFromDraft,
} from "../lib/web.js";
import {
  normalizeOutputType,
  normalizeVisibility,
  visibilityForDraft,
  buildOutputIntent,
  getPromptGuidance,
  OUTPUT_TYPE,
} from "../lib/output-intent.js";
import { applyDraftHouseStyle } from "../lib/qc/draft-house-style.mjs";
import { applyPlaceholderGuard } from "../lib/prompt-library/placeholder-guard.mjs";
import { lengthInstruction } from "../lib/prompt-library/outputTypeGuidance.js";
import { prepareUploadedSourcesForPipeline } from "../lib/extract-text-from-source.mjs";
import { callLLM, flushObservability, getLlmSpend, hasProviderApiKey } from "../lib/observability.js";
import { STAGE_MODELS } from "../lib/qc/model-config.mjs";
import { beginRequestBudget, FUNCTION_MAX_DURATION_MS } from "../lib/qc/request-budget.mjs";
import { sourcesForPrompt as omitRoleForPrompt } from "../lib/source-role.mjs";


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

async function handler(req, res) {
  if (applyCors(req, res, { methods: "GET,POST,OPTIONS", headers: ["x-brightline-diag"] })) return;
  const account = await requireAccount(req, res);
  if (!account) return;
  rememberAccount(account);
  if (!(await beginBillableRequest(res, account))) return;
  enterRequestSpend();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const routeStartedAt = Date.now();
  const modelConfig = STAGE_MODELS.adapt;
  beginRequestBudget({
    startedAt: routeStartedAt,
    maxDurationMs: FUNCTION_MAX_DURATION_MS,
    model: modelConfig.model,
  });
  if (!hasProviderApiKey(modelConfig.provider)) {
    await reportRouteFailure({
      account,
      route: "adapt",
      req,
      status: 500,
      error: "Server is missing provider API key for adapt",
      startedAt: routeStartedAt,
    });
    return res.status(500).json({ ok: false, error: "Server is missing provider API key for adapt" });
  }

  try {
    const body = typeof req.body === "string" ? safeJsonParse(req.body) : req.body || {};
    const houseStyle = await styleForRequest(account, body);
    const baseDraftId = typeof body.baseDraftId === "string" ? body.baseDraftId.trim() : null;
    const baseDraftText = typeof body.baseDraftText === "string" ? body.baseDraftText : "";
    const sources = Array.isArray(body.sources) ? body.sources : [];
    const fromOutputType = normalizeOutputType(body.fromOutputType ?? body.from_output_type ?? null);
    const fromVisibility = normalizeVisibility(body.fromVisibility ?? body.from_visibility ?? null);
    const targetOutputType = normalizeOutputType(body.targetOutputType ?? body.target_output_type ?? null);
    const targetVisibility = visibilityForDraft(targetOutputType, body.targetVisibility ?? body.target_visibility ?? null);
    const modelId = typeof body.model === "string" && body.model.trim() ? body.model.trim() : modelConfig.model;
    const publicSearch = Boolean(body.publicSearch);
    // X2.2: Optional word-limit override for Adapt (per-output cap persistence)
    const rawOverride = body.maxWords ?? body.max_words ?? null;
    const overrideNum = typeof rawOverride === "number" && Number.isFinite(rawOverride) ? rawOverride : (typeof rawOverride === "string" && rawOverride.trim() !== "" ? parseInt(rawOverride, 10) : null);
    const MIN_WORDS = 1;
    const MAX_WORDS = 2000;
    let maxWords = null;
    if (overrideNum != null && !Number.isNaN(overrideNum)) {
      const clamped = Math.floor(Number(overrideNum));
      if (clamped >= MIN_WORDS && clamped <= MAX_WORDS) {
        maxWords = clamped;
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

    const writing = renderDraftingInstructions({
      outputType: targetOutputType,
      eventType: body?.eventType,
      houseStyle,
      styleChoices: houseStyle,
      sources,
      visibility: targetVisibility,
    });
    const prompt = `
You are adapting an existing draft to a new output format and visibility. Use the SAME facts and source material; do not invent new facts.

${writing}

FROM: ${fromOutputType} (${fromVisibility})
TO: ${targetOutputType} (${targetVisibility})

FORMAT GUIDANCE FOR TARGET: ${targetGuidance}
${optionalGuidance ? `ADDITIONAL TARGET INSTRUCTIONS:\n${optionalGuidance}` : ""}
BASE DRAFT (adapt this content):
---
${baseDraftText}
---

SOURCES (same universe; do not add facts not present here or in the draft):
${sourcesForPrompt.length ? JSON.stringify(omitRoleForPrompt(sourcesForPrompt), null, 2) : "(none)"}

WEB RESULTS (optional; cite [1], [2] if you use them):
${webResultsForPrompt || "(none)"}

Rules:
- Preserve all factual content from the base draft.
- Restructure and re-tone for the target type and visibility.
- Do not add claims that are not in the base draft or sources.
${publicSearch && webReferences.length ? "- If you use web results, cite with [1], [2], etc." : ""}
- ${lengthInstruction(targetOutputType, maxWords)}

Return ONLY JSON:
{
  "draftText": "string"
}
`.trim();

    const completion = await callLLM({
      provider: modelConfig.provider,
      model: modelId,
      temperature: 0.2,
      messages: [{ role: "user", content: prompt }],
      traceName: "adapt-generate",
      spanName: "adapt-generate",
      metadata: { route: "adapt" },
    });

    const raw = completion?.text || "";
    const parsed = safeJsonParse(raw) || {};
    const draftText = applyDraftHouseStyle(
      typeof parsed.draftText === "string" ? parsed.draftText.trim() : "",
      {
        outputType: targetOutputType,
        houseStyle,
        sources: sourcesForPrompt,
      }
    );

    if (!draftText) {
      return res.status(500).json({ ok: false, error: "Adapt failed. Please try again." });
    }

    const guardedAdapt = applyPlaceholderGuard(draftText, baseDraftText, "Adapt");
    if (!guardedAdapt.accepted) {
      return res.status(422).json({
        ok: false,
        error: guardedAdapt.message,
        code: "PLACEHOLDER_IN_OUTPUT",
      });
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
    if (maxWords != null) {
      responseOutputIntent.maxWords = maxWords;
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
    await reportRouteFailure({
      account,
      route: "adapt",
      req,
      status: 500,
      error: err?.message || "Adapt failed",
      startedAt: routeStartedAt,
    });
    return res.status(500).json({
      ok: false,
      error: err?.message || "Adapt failed",
    });
  } finally {
    await endBillableRequest({ account, route: "adapt", req, spend: getLlmSpend() });
    await flushObservability();
  }
}

export default withCors(handler, { problemRoute: "adapt" });
