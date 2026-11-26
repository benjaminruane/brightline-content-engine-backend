/**
 * B602. Re-stamp one card after Accept / Modify / Undo. No model calls.
 * Returns the updated analysisResult with that card and meta.reviewSummary.
 */
import { withCors } from "../lib/http/with-cors.mjs";
import { applyCors } from "../lib/http/frontend-origins.mjs";
import { rememberAccount, requireAccount } from "../lib/auth/require-account.mjs";
import { applyEditRestampToResponse } from "../lib/qc/edit-restamp.mjs";

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
  const mode = String(body?.mode || "").trim().toLowerCase();
  const statementIndex = body?.statementIndex ?? body?.index;
  const newStatement = body?.newStatement ?? body?.replacementText ?? body?.text;

  if (!analysis || !Array.isArray(analysis.statements)) {
    return res.status(400).json({ error: "analysis_required" });
  }
  if (!["accept", "modify", "undo"].includes(mode)) {
    return res.status(400).json({ error: "mode_required" });
  }
  if (mode !== "undo" && (newStatement == null || String(newStatement).trim() === "")) {
    return res.status(400).json({ error: "new_statement_required" });
  }

  let out;
  try {
    out = applyEditRestampToResponse(analysis, {
      statementIndex,
      mode,
      newStatement,
    });
  } catch (err) {
    const message = String(err?.message || err);
    const status = /required|unknown mode|nothing to undo|index/i.test(message) ? 400 : 500;
    return res.status(status).json({ error: message });
  }

  return res.status(200).json({
    ok: true,
    analysisResult: out,
    meta: out.meta,
    historyEntry: mode === "undo"
      ? "Undid a change since the review"
      : mode === "accept"
        ? "Accepted a proposed change"
        : "Modified a sentence since the review",
  });
}

export default withCors(handler);
