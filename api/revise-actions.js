/**
 * Per-finding action list. Off unless REVISE_ACTION_LIST is on.
 * POST { statements, draftText?, authoringOrganisation?, sourceRulings? }
 * → { ok: true, entries } | 404 when the flag is off.
 *
 * Does not import or touch api/suggest-revision.js.
 */

import { applyCors } from "../lib/http/frontend-origins.mjs";
import { rememberAccount, requireAccount } from "../lib/auth/require-account.mjs";
import { beginBillableRequest, endBillableRequest, enterRequestSpend } from "../lib/spend/ledger.mjs";
import { flushObservability, getLlmSpend, hasProviderApiKey } from "../lib/observability.js";
import { STAGE_MODELS } from "../lib/qc/model-config.mjs";
import { runActionList } from "../lib/revise-actions/run.mjs";
import { isReviseActionListEnabled } from "./_lib/env-flags.js";

export { isReviseActionListEnabled };


function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (applyCors(req, res, { methods: "GET,POST,OPTIONS", headers: ["x-brightline-diag"] })) return;
  const account = await requireAccount(req, res);
  if (!account) return;
  rememberAccount(account);
  if (!(await beginBillableRequest(res, account))) return;
  enterRequestSpend();

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
      authoringOrganisation: body?.authoringOrganisation,
      draftText: typeof body?.draftText === "string" ? body.draftText : undefined,
      factMarks: Array.isArray(body?.factMarks) ? body.factMarks : [],
      sourceText: typeof body?.sourceText === "string" ? body.sourceText : undefined,
      bannedWords: Array.isArray(body?.bannedWords) ? body.bannedWords : [],
      sourceRulings: body?.sourceRulings,
    });
    return res.status(200).json({
      ...result,
      meta: { llmSpend: getLlmSpend() },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || "Revise action list failed" });
  } finally {
    await endBillableRequest({ account, route: "revise-actions", req, spend: getLlmSpend() });
    await flushObservability();
  }
}
