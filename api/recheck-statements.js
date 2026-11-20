/**
 * B410. Re-check the statements whose text changed. One note call each.
 * Fact matching is deterministic. Other statements are returned as sent.
 */
import { applyCors } from "../lib/http/frontend-origins.mjs";
import { rememberAccount, requireAccount } from "../lib/auth/require-account.mjs";
import { beginBillableRequest, endBillableRequest, enterRequestSpend } from "../lib/spend/ledger.mjs";
import { flushObservability, getLlmSpend, hasProviderApiKey } from "../lib/observability.js";
import { recheckStatements } from "../lib/qc/reading-review.mjs";


export default async function handler(req, res) {
  if (applyCors(req, res, { methods: "POST,OPTIONS", headers: ["x-brightline-diag"] })) return;
  const account = await requireAccount(req, res);
  if (!account) return;
  rememberAccount(account);
  if (!(await beginBillableRequest(res, account))) return;
  enterRequestSpend();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });
  if (!hasProviderApiKey("anthropic")) {
    return res.status(500).json({ ok: false, error: "Server is missing ANTHROPIC_API_KEY" });
  }
  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  if (typeof body.draft !== "string") {
    return res.status(400).json({ ok: false, error: "recheck: draft is missing" });
  }
  if (!Array.isArray(body.statements)) {
    return res.status(400).json({ ok: false, error: "recheck: statements are missing" });
  }
  try {
    const result = await recheckStatements({
      draft: body.draft,
      statements: body.statements,
      sources: body.sources,
      entries: body.entries,
      decisions: body.decisions,
      outputType: body.outputType,
      requiredVersion: body.requiredVersion,
      authoringOrganisation: body.authoringOrganisation,
      eventType: typeof body.eventType === "string" ? body.eventType : body.scenario,
      dealStatus: body.dealStatus,
    });
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err?.message || "recheck failed" });
  } finally {
    await endBillableRequest({ account, route: "recheck-statements", req, spend: getLlmSpend() });
    await flushObservability();
  }
}
