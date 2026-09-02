/**
 * Apply accepted action-list decisions onto the analysed draft.
 * Off unless REVISE_ACTION_LIST is on. Does not call a model.
 */

import { applyDecisions } from "../lib/revise-actions/apply.mjs";

function isReviseActionListEnabled(env = process.env) {
  const v = String(env?.REVISE_ACTION_LIST || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

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
  if (req.method === "OPTIONS") return res.status(204).end();

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
  if (!result.ok) {
    return res.status(400).json({ ok: false, error: result.error || "Apply failed." });
  }
  return res.status(200).json({ ok: true, text: result.text });
}
