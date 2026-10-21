/**
 * B410. Re-check the statements whose text changed. One note call each.
 * Fact matching is deterministic. Other statements are returned as sent.
 */
import { flushObservability, hasProviderApiKey } from "../lib/observability.js";
import { recheckStatements } from "../lib/qc/reading-review.mjs";

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin === "null" ? "*" : origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-brightline-diag");
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
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
    });
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    return res.status(400).json({ ok: false, error: err?.message || "recheck failed" });
  } finally {
    await flushObservability();
  }
}
