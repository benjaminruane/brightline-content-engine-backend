/**
 * Pr9 — Suggest revised draft (generation-side).
 * POST { draftText, statements, outputType?, requiredVersion?, sources? }
 * sources?: [{ index, publicationState }] — optional; absent → no public-source downgrade.
 * → { ok: true, revisedDraft, markers } | { ok: false, error }
 *
 * Does NOT import or touch the QC pipeline, verdict, or aggregation.
 */

import { callLLM, flushObservability, hasProviderApiKey } from "../lib/observability.js";
import { STAGE_MODELS } from "../lib/qc/model-config.mjs";
import {
  buildPublicationMap,
  buildRevisionPrompt,
  finalizeSuggestRevisionText,
  gatherConcerns,
} from "../lib/build-revision-prompt.mjs";

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

function stripCodeFence(text) {
  if (typeof text !== "string") return "";
  const trimmed = text.trim();
  const fence = /^```(?:\w+)?\s*\n?([\s\S]*?)\n?```\s*$/;
  const match = trimmed.match(fence);
  return match ? match[1].trim() : trimmed;
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const modelConfig = STAGE_MODELS["writing-rewrite"];
  if (!hasProviderApiKey(modelConfig.provider)) {
    return res.status(500).json({
      ok: false,
      error: "Server is missing provider API key for writing-rewrite",
    });
  }

  try {
    const body = typeof req.body === "string" ? safeJsonParse(req.body) : req.body || {};
    const draftText = typeof body?.draftText === "string" ? body.draftText : "";
    if (!draftText.trim()) {
      return res.status(400).json({ ok: false, error: "Missing draftText" });
    }

    const statements = Array.isArray(body.statements) ? body.statements : null;
    if (!statements) {
      return res.status(400).json({ ok: false, error: "Missing statements array" });
    }

    const outputType = typeof body.outputType === "string" ? body.outputType : undefined;
    const requiredVersion =
      typeof body.requiredVersion === "string" ? body.requiredVersion : undefined;
    const publicationMap = buildPublicationMap(body.sources);

    const concerns = gatherConcerns(statements, publicationMap);
    const prompt = buildRevisionPrompt(draftText, concerns, { outputType, requiredVersion });

    const completion = await callLLM({
      provider: modelConfig.provider,
      model: modelConfig.model,
      temperature: 0,
      messages: [{ role: "user", content: prompt }],
      traceName: "suggest-revision",
      spanName: "suggest-revision",
      metadata: {
        route: "suggest-revision",
        concernCount: concerns.length,
        ...(outputType ? { outputType } : {}),
        ...(requiredVersion ? { requiredVersion } : {}),
      },
    });

    const raw = stripCodeFence(typeof completion?.text === "string" ? completion.text : "");
    if (!raw) {
      return res.status(500).json({ ok: false, error: "Suggest-revision produced empty revisedDraft" });
    }

    // Parse {{span||note}} markers, strip delimiters, then ASCII house-style char normalize
    // with offset remapping (normalizePgHouseStyleCharacters only — no PG fund/methodology filters).
    const { revisedDraft, markers } = finalizeSuggestRevisionText(raw);
    if (!revisedDraft.trim()) {
      return res.status(500).json({ ok: false, error: "Suggest-revision produced empty revisedDraft" });
    }

    return res.status(200).json({ ok: true, revisedDraft, markers });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || "Suggest-revision failed" });
  } finally {
    await flushObservability();
  }
}
