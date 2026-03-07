/**
 * T1.1: Guarded test-only endpoint for QC regression.
 * POST /api/test/run-qc — runs the real QC pipeline with draft + corpus source filenames.
 * Available only when ENABLE_QC_TEST_ENDPOINT === "true".
 */

import { resolveQcTestSourceFiles } from "../../lib/resolve-qc-test-sources.mjs";

const ROUTE = "test/run-qc";

function setCors(req, res) {
  const origin = req.headers?.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin === "null" ? "*" : origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  setCors(req, res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (process.env.ENABLE_QC_TEST_ENDPOINT !== "true") {
    return res.status(404).json({ ok: false, error: "not_found" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const body = typeof req.body === "string" ? (() => { try { return JSON.parse(req.body); } catch { return {}; } })() : req.body || {};
  const draft = typeof body.draft === "string" ? body.draft : "";
  const sourceFiles = Array.isArray(body.sourceFiles) ? body.sourceFiles : [];
  const options = body.options && typeof body.options === "object" ? body.options : {};
  const webEnabled = options.webEnabled === true;

  if (!draft.trim()) {
    return res.status(400).json({
      ok: false,
      error: "validation",
      message: "draft must be a non-empty string",
    });
  }
  if (sourceFiles.length === 0) {
    return res.status(400).json({
      ok: false,
      error: "validation",
      message: "sourceFiles must be a non-empty array of filenames",
    });
  }

  const resolved = await resolveQcTestSourceFiles(sourceFiles);
  if (resolved.error) {
    return res.status(400).json({
      ok: false,
      error: resolved.error.code,
      message: resolved.error.message,
    });
  }

  const rid = req.headers?.["x-brightline-rid"] || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const syntheticBody = {
    draftText: draft,
    sources: resolved.sources,
    publicSearch: webEnabled,
  };

  const implUrl = new URL("../../lib/analyse-statements-impl.mjs", import.meta.url);
  let mod;
  try {
    mod = await import(implUrl.href);
  } catch (e) {
    console.error("[run-qc][IMPL_IMPORT_FAIL]", e?.message);
    return res.status(500).json({
      ok: false,
      statements: [],
      references: [],
      meta: { fatal: "Failed to load QC pipeline", fatalStage: "test_endpoint", extractionQuality: "failed", extractionQualityReasons: ["import_error"] },
    });
  }

  const impl = mod?.default;
  if (typeof impl !== "function") {
    return res.status(500).json({
      ok: false,
      statements: [],
      references: [],
      meta: { fatal: "QC pipeline not available", fatalStage: "test_endpoint", extractionQuality: "failed", extractionQualityReasons: ["import_error"] },
    });
  }

  const mockReq = {
    body: syntheticBody,
    method: "POST",
    _brightlineRid: rid,
    headers: req.headers || {},
    url: req.url || `/api/${ROUTE}`,
  };
  const mockRes = {};

  let payload;
  try {
    payload = await impl(mockReq, mockRes);
  } catch (err) {
    console.error("[run-qc][PIPELINE_ERROR]", err?.message);
    return res.status(200).json({
      ok: false,
      statements: [],
      references: [],
      meta: {
        fatal: (err?.message && String(err.message).slice(0, 300)) || "QC pipeline error",
        fatalStage: "pipeline",
        extractionQuality: "failed",
        extractionQualityReasons: ["pipeline_exception"],
      },
    });
  }

  const result = payload != null ? payload : {
    ok: false,
    statements: [],
    references: [],
    meta: { fatal: "No response from pipeline", fatalStage: "test_endpoint", extractionQuality: "failed", extractionQualityReasons: ["empty_response"] },
  };
  const statusCode = result?.meta?.extractionGuardStatusCode === 422 ? 422 : 200;
  return res.status(statusCode).json(result);
}
