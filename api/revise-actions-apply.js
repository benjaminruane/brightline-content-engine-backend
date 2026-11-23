import { withCors } from "../lib/http/with-cors.mjs";
/**
 * Apply accepted action-list decisions onto the analysed draft.
 * Off unless REVISE_ACTION_LIST is on. Does not call a model.
 */

import { applyCors } from "../lib/http/frontend-origins.mjs";
import { rememberAccount, requireAccount } from "../lib/auth/require-account.mjs";
import { applyDecisions } from "../lib/revise-actions/apply.mjs";
import { isReviseActionListEnabled } from "./_lib/env-flags.js";


function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

async function handler(req, res) {
  if (applyCors(req, res, { methods: "GET,POST,OPTIONS", headers: ["x-brightline-diag"] })) return;
  const account = await requireAccount(req, res);
  if (!account) return;
  rememberAccount(account);

  if (!isReviseActionListEnabled()) {
    return res.status(404).json({ ok: false, error: "Not found" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const body = typeof req.body === "string" ? safeJsonParse(req.body) : req.body || {};
  if (!body || typeof body !== "object") {
    return res.status(400).json({ ok: false, error: "Invalid JSON" });
  }
  const draft = typeof body.draftText === "string" ? body.draftText : "";
  const result = applyDecisions({
    draft,
    statements: body.statements,
    entries: body.entries,
    decisions: body.decisions,
  });
  const notices = Array.isArray(result.notices) ? result.notices : [];
  if (!result.ok) {
    return res.status(400).json({
      ok: false,
      error: result.error || "These two sentences overlap in the draft, so neither change was applied.",
      notices,
      writtenStatementIds: [],
    });
  }
  return res.status(200).json({
    ok: true,
    text: result.text,
    notices,
    writtenStatementIds: Array.isArray(result.writtenStatementIds) ? result.writtenStatementIds : [],
  });
}

export default withCors(handler, {});
