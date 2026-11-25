/**
 * B599. Re-apply transaction status to a stored review. No model calls.
 * Returns updated stamps and meta.reviewSummary.
 */
import { withCors } from "../lib/http/with-cors.mjs";
import { applyCors } from "../lib/http/frontend-origins.mjs";
import { rememberAccount, requireAccount } from "../lib/auth/require-account.mjs";
import { dealStatusValue, DEAL_STATUS_DEFAULT, DEAL_STATUS_OPTIONS } from "../lib/deal-status.mjs";
import { restampAnalyseResponse } from "../lib/qc/b596-stamp.mjs";
import { restampTransactionStatus } from "../lib/qc/exit-gate.mjs";

function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return {};
}

async function handler(req, res) {
  if (applyCors(req, res, { methods: "POST,OPTIONS" })) return;
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const account = await requireAccount(req, res);
  if (!account) return;
  rememberAccount(account);

  const body = readJsonBody(req);
  const analysis = body?.analysisResult || body?.analysis || body;
  const dealStatusRaw = body?.dealStatus;
  if (!analysis || !Array.isArray(analysis.statements)) {
    return res.status(400).json({ error: "analysis_required" });
  }
  if (dealStatusRaw == null || String(dealStatusRaw).trim() === "") {
    return res.status(400).json({ error: "deal_status_required" });
  }
  const trimmed = String(dealStatusRaw).trim();
  if (!DEAL_STATUS_OPTIONS.includes(trimmed)) {
    return res.status(400).json({ error: "deal_status_unknown", value: trimmed });
  }
  if (trimmed === DEAL_STATUS_DEFAULT) {
    return res.status(400).json({ error: "deal_status_must_confirm" });
  }
  let confirmed;
  try {
    confirmed = dealStatusValue(trimmed);
  } catch (err) {
    return res.status(400).json({ error: String(err?.message || err) });
  }
  if (!confirmed) {
    return res.status(400).json({ error: "deal_status_must_confirm" });
  }

  // Full re-stamp with the new status, then status-specific exit gate.
  const stamped = restampAnalyseResponse({
    ...analysis,
    meta: {
      ...(analysis.meta && typeof analysis.meta === "object" ? analysis.meta : {}),
      dealStatus: confirmed,
    },
  });
  const out = restampTransactionStatus(stamped, confirmed, stamped.meta?.reviewOptions);
  return res.status(200).json({
    ok: true,
    analysisResult: out,
    meta: out.meta,
    historyEntry: `Transaction status set to ${confirmed}`,
  });
}

export default withCors(handler);
