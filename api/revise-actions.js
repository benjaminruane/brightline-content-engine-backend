/**
 * Per-finding action list. Off unless REVISE_ACTION_LIST is on.
 * POST { statements, draftText?, authoringOrganisation? }
 * → { ok: true, entries } | 404 when the flag is off.
 *
 * Does not import or touch api/suggest-revision.js.
 */

import { flushObservability, hasProviderApiKey } from "../lib/observability.js";
import { STAGE_MODELS } from "../lib/qc/model-config.mjs";
import { runActionList } from "../lib/revise-actions/run.mjs";

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

export function isReviseActionListEnabled(env = process.env) {
  const v = String(env?.REVISE_ACTION_LIST || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();

  if (!isReviseActionListEnabled()) {
    return res.status(404).json({ ok: false, error: "Not found" });
  }

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
    const statements = Array.isArray(body?.statements) ? body.statements : null;
    if (!statements) {
      return res.status(400).json({ ok: false, error: "Missing statements array" });
    }

    const result = await runActionList(statements, {
      authoringOrganisation: body?.options?.authoringOrganisation ?? body?.authoringOrganisation,
      draftText: typeof body?.draftText === "string" ? body.draftText : undefined,
    });
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || "Revise action list failed" });
  } finally {
    await flushObservability();
  }
}
