#!/usr/bin/env node
/**
 * Production-path extraction check. No LLM.
 *
 *   node scripts/diagnostic/extraction-check/run-extraction-check.mjs
 *
 * Reads public files from inputs/. Reports two production ceilings first:
 *   1. B79 / F20 upload body cap (frontend sourceRequestBudget.js)
 *   2. MAX_PDF_MB (prepareUploadedSourcesForPipeline)
 * Then calls prepareUploadedSourcesForPipeline (the analyse-statements
 * upload path, which calls extractTextFromSource). Then runs
 * computeGuardrailForSource, which production never calls.
 * Writes outputs/<stem>.txt and outputs/summary.json.
 */

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  MAX_PDF_BYTES,
  MAX_PDF_MB,
  MIN_TOTAL_TEXT,
  SUPPORTED_MIME_TYPES,
  computeGuardrailForSource,
  detectFileType,
  prepareUploadedSourcesForPipeline,
} from "../../../lib/extract-text-from-source.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INPUTS_DIR = path.join(__dirname, "inputs");
const OUTPUTS_DIR = path.join(__dirname, "outputs");

const EXT_OK = new Set([".pdf", ".docx", ".pptx", ".xlsx"]);

/**
 * Mirror of frontend src/utils/sourceRequestBudget.js (F20 / B79).
 * Vercel edge rejects bodies over 4.5 MB. Client guard is 4_200_000.
 * Encoded size of n raw bytes is 4 * ceil(n / 3).
 */
const MAX_REQUEST_BYTES = 4_200_000;
const REQUEST_JSON_OVERHEAD_BYTES = 8_192;
const VERCEL_EDGE_BODY_BYTES = 4_500_000;
const EFFECTIVE_RAW_BYTES_CEILING = 3 * Math.floor((MAX_REQUEST_BYTES - REQUEST_JSON_OVERHEAD_BYTES) / 4);

function stemOf(filename) {
  return path.basename(filename, path.extname(filename));
}

function firstChars(text, n = 400) {
  const t = typeof text === "string" ? text : "";
  return t.slice(0, n);
}

function mimeFor(filename) {
  const mime = detectFileType("", filename);
  if (mime) return mime;
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".pdf") return SUPPORTED_MIME_TYPES.PDF;
  if (ext === ".docx") return SUPPORTED_MIME_TYPES.DOCX;
  if (ext === ".pptx") return SUPPORTED_MIME_TYPES.PPTX;
  if (ext === ".xlsx") return SUPPORTED_MIME_TYPES.XLSX;
  return null;
}

function ceilingReport(rawBytes, encodedSize) {
  const estimatedRequestBytes = encodedSize + REQUEST_JSON_OVERHEAD_BYTES;
  const passesUploadCap = estimatedRequestBytes <= MAX_REQUEST_BYTES;
  const passesMaxPdfMb = rawBytes <= MAX_PDF_BYTES;
  return {
    rawBytes,
    encodedBase64Bytes: encodedSize,
    estimatedRequestBytes,
    maxRequestBytes: MAX_REQUEST_BYTES,
    vercelEdgeBodyBytes: VERCEL_EDGE_BODY_BYTES,
    requestJsonOverheadBytes: REQUEST_JSON_OVERHEAD_BYTES,
    effectiveRawBytesCeiling: EFFECTIVE_RAW_BYTES_CEILING,
    passesUploadCap,
    maxPdfMb: MAX_PDF_MB,
    maxPdfBytes: MAX_PDF_BYTES,
    passesMaxPdfMb,
    wouldReachExtractor: passesUploadCap && passesMaxPdfMb,
  };
}

async function listInputFiles() {
  let names = [];
  try {
    names = await readdir(INPUTS_DIR);
  } catch {
    return [];
  }
  return names
    .filter((n) => EXT_OK.has(path.extname(n).toLowerCase()))
    .sort();
}

async function runOne(filename) {
  const filePath = path.join(INPUTS_DIR, filename);
  const buf = await readFile(filePath);
  const mimeType = mimeFor(filename);
  const contentBase64 = buf.toString("base64");
  const ceilings = ceilingReport(buf.length, contentBase64.length);

  const t0 = Date.now();
  const prep = await prepareUploadedSourcesForPipeline(
    [
      {
        name: filename,
        filename,
        mimeType,
        contentBase64,
      },
    ],
    {}
  );
  const elapsedMs = Date.now() - t0;

  if (prep.error) {
    return {
      filename,
      bytes: buf.length,
      elapsedMs,
      status: prep.error.code === "extraction_timeout" ? "timeout" : "error",
      errorCode: prep.error.code,
      errorMessage: prep.error.message,
      charCount: 0,
      text: "",
      first400: "",
      extractionWarnings: [],
      sourceIngestionWarning: prep.sourceIngestionWarning || null,
      totalTextLowWarning: prep.totalTextLowWarning === true,
      extractionStatus: null,
      guardrail: null,
      ceilings,
    };
  }

  const row = Array.isArray(prep.sources) ? prep.sources[0] : null;
  const text = typeof row?.text === "string" ? row.text : "";
  const extraction = row?.meta?.extraction && typeof row.meta.extraction === "object" ? row.meta.extraction : {};
  const guardrail = computeGuardrailForSource(text, {
    extractedTextLength: Number.isFinite(extraction.extractedTextLength)
      ? extraction.extractedTextLength
      : text.length,
    rawBytesLength: Number.isFinite(extraction.rawBytesLength) ? extraction.rawBytesLength : buf.length,
    fileType: extraction.fileType || "pdf",
    tokenProbeHits: extraction.tokenProbeHits || {},
    detectedNumberCount: Number.isFinite(extraction.detectedNumberCount)
      ? extraction.detectedNumberCount
      : 0,
  });

  return {
    filename,
    bytes: buf.length,
    elapsedMs,
    status: "ok",
    errorCode: null,
    errorMessage: null,
    charCount: text.length,
    text,
    first400: firstChars(text, 400),
    extractionWarnings: Array.isArray(extraction.warnings) ? extraction.warnings : [],
    sourceIngestionWarning: prep.sourceIngestionWarning || null,
    totalTextLowWarning: prep.totalTextLowWarning === true,
    extractionStatus: extraction.status || null,
    minTotalText: MIN_TOTAL_TEXT,
    guardrail,
    ceilings,
  };
}

function formatRow(row) {
  const g = row.guardrail;
  const gLine = g
    ? `${g.guardrailStatus} [${(g.guardrailReasons || []).join(", ") || "none"}]`
    : "n/a";
  const c = row.ceilings || {};
  return [
    `## ${row.filename}`,
    `- rawBytes: ${row.bytes}`,
    `- encodedBase64Bytes: ${c.encodedBase64Bytes}`,
    `- estimatedRequestBytes (encoded + ${c.requestJsonOverheadBytes} overhead): ${c.estimatedRequestBytes}`,
    `- passesUploadCap (B79 / F20, cap ${c.maxRequestBytes}): ${c.passesUploadCap}`,
    `- passesMaxPdfMb (cap ${c.maxPdfMb} MB / ${c.maxPdfBytes} bytes): ${c.passesMaxPdfMb}`,
    `- wouldReachExtractor in production: ${c.wouldReachExtractor}`,
    `- status: ${row.status}${row.errorCode ? ` (${row.errorCode})` : ""}`,
    `- elapsedMs: ${row.elapsedMs}`,
    `- charCount: ${row.charCount}`,
    `- extraction.status: ${row.extractionStatus}`,
    `- extraction.warnings: ${(row.extractionWarnings || []).join(", ") || "none"}`,
    `- sourceIngestionWarning: ${row.sourceIngestionWarning || "none"}`,
    `- totalTextLowWarning: ${row.totalTextLowWarning}`,
    `- computeGuardrailForSource: ${gLine}`,
    `- first 400 characters:`,
    "```",
    row.first400 || "(empty)",
    "```",
    "",
  ].join("\n");
}

async function main() {
  await mkdir(OUTPUTS_DIR, { recursive: true });
  const files = await listInputFiles();
  if (files.length === 0) {
    const msg = `No PDF/DOCX/PPTX/XLSX in ${INPUTS_DIR}. Drop public files and re-run.`;
    console.log(msg);
    await writeFile(
      path.join(OUTPUTS_DIR, "summary.json"),
      JSON.stringify({ ranAt: new Date().toISOString(), files: [], note: msg }, null, 2)
    );
    return;
  }

  const rows = [];
  for (const filename of files) {
    console.log(`extracting ${filename}`);
    const row = await runOne(filename);
    rows.push(row);
    const stem = stemOf(filename);
    await writeFile(path.join(OUTPUTS_DIR, `${stem}.txt`), row.text || "", "utf8");
    const { text: _omit, ...meta } = row;
    await writeFile(path.join(OUTPUTS_DIR, `${stem}.meta.json`), JSON.stringify(meta, null, 2));
    console.log(
      `  reach=${row.ceilings?.wouldReachExtractor} b79=${row.ceilings?.passesUploadCap} maxPdf=${row.ceilings?.passesMaxPdfMb} ${row.status} chars=${row.charCount} guardrail=${row.guardrail?.guardrailStatus || "n/a"}`
    );
  }

  const summary = {
    ranAt: new Date().toISOString(),
    inputCount: files.length,
    wouldReachExtractor: rows.filter((r) => r.ceilings?.wouldReachExtractor).length,
    blockedByUploadCap: rows.filter((r) => r.ceilings && !r.ceilings.passesUploadCap).length,
    blockedByMaxPdfMb: rows.filter((r) => r.ceilings && !r.ceilings.passesMaxPdfMb).length,
    ok: rows.filter((r) => r.status === "ok").length,
    error: rows.filter((r) => r.status === "error").length,
    timeout: rows.filter((r) => r.status === "timeout").length,
    guardrailError: rows.filter((r) => r.guardrail?.guardrailStatus === "ERROR").length,
    guardrailWarn: rows.filter((r) => r.guardrail?.guardrailStatus === "WARN").length,
    guardrailOk: rows.filter((r) => r.guardrail?.guardrailStatus === "OK").length,
    sourceIngestionWarningCount: rows.filter((r) => r.sourceIngestionWarning).length,
    totalTextLowWarningCount: rows.filter((r) => r.totalTextLowWarning).length,
    ceilings: {
      maxRequestBytes: MAX_REQUEST_BYTES,
      vercelEdgeBodyBytes: VERCEL_EDGE_BODY_BYTES,
      requestJsonOverheadBytes: REQUEST_JSON_OVERHEAD_BYTES,
      effectiveRawBytesCeiling: EFFECTIVE_RAW_BYTES_CEILING,
      maxPdfMb: MAX_PDF_MB,
      maxPdfBytes: MAX_PDF_BYTES,
    },
    rows: rows.map(({ text: _t, ...rest }) => rest),
  };
  await writeFile(path.join(OUTPUTS_DIR, "summary.json"), JSON.stringify(summary, null, 2));
  await writeFile(
    path.join(OUTPUTS_DIR, "SUMMARY.md"),
    [`# Extraction check machine summary`, ``, ...rows.map(formatRow)].join("\n"),
    "utf8"
  );
  console.log(
    `done files=${files.length} reach=${summary.wouldReachExtractor} ok=${summary.ok} error=${summary.error} timeout=${summary.timeout} guardrail ERROR=${summary.guardrailError} WARN=${summary.guardrailWarn} OK=${summary.guardrailOk}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
