/**
 * X1.1: Multi-format source ingestion — deterministic text extraction layer.
 * Converts PDF, DOCX, PPTX, XLSX into plain text for the existing pipeline.
 * No changes to QC, canonicalClaims, or reliabilityScore.
 */

import { normalizePublicationState } from "./source-publication-state.mjs";

// Supported MIME types (preferred) and extension fallback
export const SUPPORTED_MIME_TYPES = Object.freeze({
  PDF: "application/pdf",
  DOCX: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  PPTX: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  XLSX: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
});

const EXT_TO_MIME = Object.freeze({
  pdf: SUPPORTED_MIME_TYPES.PDF,
  docx: SUPPORTED_MIME_TYPES.DOCX,
  pptx: SUPPORTED_MIME_TYPES.PPTX,
  xlsx: SUPPORTED_MIME_TYPES.XLSX,
});

const MIME_TO_TYPE = Object.freeze({
  [SUPPORTED_MIME_TYPES.PDF]: "pdf",
  [SUPPORTED_MIME_TYPES.DOCX]: "docx",
  [SUPPORTED_MIME_TYPES.PPTX]: "pptx",
  [SUPPORTED_MIME_TYPES.XLSX]: "xlsx",
});

/** Default max file size (bytes). Reuse existing limit or 25MB. */
export const DEFAULT_MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

/** X1.2: Max PDF size in MB (configurable via env, default 10). Enforced for raw PDF ingestion. */
export const MAX_PDF_MB = Math.max(1, parseInt(process.env.MAX_PDF_MB || "10", 10) || 10);
/** X1.2: Max PDF size in bytes. */
export const MAX_PDF_BYTES = MAX_PDF_MB * 1024 * 1024;

/** Extraction timeout (ms). */
export const EXTRACTION_TIMEOUT_MS = 60_000;

// X1.1b: PDF quality thresholds (configurable via env)
const MIN_TEXT_LEN_PDF = Math.max(50, parseInt(process.env.X1_1B_MIN_TEXT_LEN_PDF || "200", 10) || 200);
const VERY_LOW_TEXT_LEN_PDF = 50;
/** Minimum total text length across all sources to avoid silent empty-source behaviour. */
export const MIN_TOTAL_TEXT = Math.max(100, parseInt(process.env.X1_1B_MIN_TOTAL_TEXT || "300", 10) || 300);

// X1.3: Guardrail config (env with safe defaults)
const MIN_EXTRACT_LEN_PDF = Math.max(100, parseInt(process.env.MIN_EXTRACT_LEN_PDF || "500", 10) || 500);
const MIN_EXTRACT_LEN_WARN_PDF = Math.max(200, parseInt(process.env.MIN_EXTRACT_LEN_WARN_PDF || "1200", 10) || 1200);
const MIN_RAW_BYTES_FOR_EXPECTED_TEXT = Math.max(1000, parseInt(process.env.MIN_RAW_BYTES_FOR_EXPECTED_TEXT || "50000", 10) || 50000);
const MIN_PRINTABLE_RATIO = Math.min(1, Math.max(0.1, parseFloat(process.env.MIN_PRINTABLE_RATIO || "0.75") || 0.75));

/**
 * X1.1b: PDF-specific post-extraction cleanup. Preserves currency and fixes common PDF artifacts.
 * - Normalize hyphenation across line breaks (e.g. "valua-\ntion" -> "valuation")
 * - Replace common ligature artifacts (ﬁ -> fi, ﬂ -> fl)
 * - Do not strip "$"; collapse excessive whitespace but do not join unrelated paragraphs.
 * @param {string} text
 * @returns {string}
 */
function normalisePdfExtractedText(text) {
  if (text == null || typeof text !== "string") return "";
  let out = text
    .replace(/\uFB01/g, "fi")
    .replace(/\uFB02/g, "fl")
    .replace(/([a-zA-Z])-\s*\n\s*([a-zA-Z])/g, "$1$2");
  out = out
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();
  return out;
}

/**
 * X1.1b: Compute extraction-health metadata (deterministic).
 * @param {string} text
 * @param {"pdf"|"docx"|"pptx"|"xlsx"|"txt"} fileType
 * @param {string} method
 * @param {{ minTextLenPdf?: number, veryLowTextLenPdf?: number }} [thresholds]
 * @returns {{ fileType: string, method: string, textLength: number, numLines: number, hasCurrencyToken: boolean, hasDigits: boolean, warnings: string[] }}
 */
function computeExtractionHealth(text, fileType, method, thresholds = {}) {
  const minLen = thresholds.minTextLenPdf ?? MIN_TEXT_LEN_PDF;
  const veryLow = thresholds.veryLowTextLenPdf ?? VERY_LOW_TEXT_LEN_PDF;
  const str = text == null || typeof text !== "string" ? "" : text;
  const textLength = str.length;
  const numLines = str ? (str.split(/\n/).length || 1) : 0;
  const hasCurrencyToken = /\$|USD|EUR|GBP|(?:million|billion|m|bn)\s*(?:\.|$)/i.test(str) || /\d[\d,.]*\s*(?:million|billion|m\b|bn\b)/i.test(str);
  const hasDigits = /\d/.test(str);
  const warnings = [];

  if (fileType === "pdf") {
    if (textLength < veryLow) {
      warnings.push("very_low_text");
      if (!hasDigits && !hasCurrencyToken) warnings.push("likely_scanned_pdf");
    } else if (textLength < minLen) {
      warnings.push("low_text");
    }
  }

  if (textLength === 0) {
    warnings.push("empty_text");
  }

  return {
    fileType,
    method,
    textLength,
    numLines,
    hasCurrencyToken,
    hasDigits,
    warnings,
  };
}

/** X1.1f: Default sample size for detected numbers. */
const DETECTED_NUMBERS_SAMPLE_SIZE = 10;

/**
 * X1.1f: Deterministic token probes (observability only; not used for scoring).
 * @param {string} text
 * @returns {{ hasAnyDigits: boolean, hasCurrencySymbol: boolean, hasCompactMagnitude: boolean, hasWordMillion: boolean, hasWordBillion: boolean, hasSevenMillionHints: boolean }}
 */
function computeTokenProbeHits(text) {
  const str = text == null || typeof text !== "string" ? "" : text;
  const hasAnyDigits = /\d/.test(str);
  const hasCurrencySymbol = /\$|US\$|S\$|A\$|NZ\$/i.test(str);
  const hasCompactMagnitude = /[0-9]+(\.[0-9]+)?[\s\u00A0\u2009]*(k|m|mm|b|bn)\b/i.test(str);
  const hasWordMillion = /\bmillion\b/i.test(str);
  const hasWordBillion = /\bbillion\b/i.test(str);
  const hasSevenMillionHints = /\$7\s*m\b|\b7\s*m\b|7\s*million|7,000,000/i.test(str.replace(/\s+/g, " "));
  return {
    hasAnyDigits,
    hasCurrencySymbol,
    hasCompactMagnitude,
    hasWordMillion,
    hasWordBillion,
    hasSevenMillionHints,
  };
}

/**
 * X1.1f: Extract numeric values from text for sample (deterministic, sorted, de-duped). Lightweight; no dependency on analyse pipeline.
 * @param {string} text
 * @param {number} [maxSample]
 * @returns {{ numbers: number[], sample: number[] }}
 */
function getDetectedNumbersForProbe(text, maxSample = DETECTED_NUMBERS_SAMPLE_SIZE) {
  const str = text == null || typeof text !== "string" ? "" : text;
  const set = new Set();
  const magnitudeRegex = /(?:US\$|S\$|A\$|NZ\$|\$)?\s*([\d,]+(?:\.\d+)?)[\s\u00A0\u2009\r\n]*(k|mm|bn|b|m(?!s)(?!in))\b/gi;
  let m;
  while ((m = magnitudeRegex.exec(str)) !== null) {
    const numStr = (m[1] || "").replace(/,/g, "");
    const num = parseFloat(numStr);
    if (!Number.isFinite(num)) continue;
    const suffix = (m[2] || "").toLowerCase();
    const mult = suffix === "k" ? 1e3 : suffix === "mm" || suffix === "m" ? 1e6 : suffix === "bn" || suffix === "b" ? 1e9 : 1;
    let value = num * mult;
    value = Number.isInteger(value) || Math.abs(value - Math.round(value)) < 1e-9 ? Math.round(value) : value;
    if (Number.isFinite(value)) set.add(value);
  }
  const plainMoney = /\$[\d,]+(?:\.\d+)?/g;
  while ((m = plainMoney.exec(str)) !== null) {
    const num = parseFloat((m[0] || "").replace(/[$,]/g, ""));
    if (Number.isFinite(num)) set.add(num);
  }
  const commaNum = /\b[\d]{1,3}(?:,[\d]{3})+(?:\.[\d]+)?\b/g;
  while ((m = commaNum.exec(str)) !== null) {
    const num = parseFloat((m[0] || "").replace(/,/g, ""));
    if (Number.isFinite(num)) set.add(num);
  }
  const numbers = [...set].filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  const sample = numbers.slice(0, maxSample);
  return { numbers, sample };
}

const DIAG_EXTRACT_SAMPLES = process.env.DIAG_EXTRACT_SAMPLES === "true" || process.env.DIAG_EXTRACT_SAMPLES === "1";

/**
 * X1.1f: Build additive extraction traceability fields (ingestionPath, probes, detected numbers sample).
 * @param {string} text - Extracted text used for probes/sample
 * @param {"raw_file"|"inline_text"|"unknown"} ingestionPath
 * @param {{ filename?: string, name?: string, title?: string, mimeType?: string }} sourceFields
 * @param {{ warnings?: string[] }} extraction - existing extraction (for warnings merge if needed)
 * @returns {object} Fields to spread onto extraction
 */
function buildExtractionTraceability(text, ingestionPath, sourceFields, extraction = {}) {
  const str = text == null || typeof text !== "string" ? "" : text;
  const tokenProbeHits = computeTokenProbeHits(str);
  const { numbers, sample } = getDetectedNumbersForProbe(str, DETECTED_NUMBERS_SAMPLE_SIZE);
  const out = {
    originalFileName: sourceFields?.filename ?? sourceFields?.name ?? sourceFields?.title ?? null,
    originalMimeType: sourceFields?.mimeType ?? null,
    ingestionPath,
    extractedTextLength: str.length,
    detectedNumberCount: numbers.length,
    detectedNumbersSample: sample,
    tokenProbeHits,
  };
  if (DIAG_EXTRACT_SAMPLES) {
    out.extractedTextSample = str.replace(/\s+/g, " ").trim().slice(0, 280);
  }
  return out;
}

/**
 * Detect file type from MIME (preferred) or file extension.
 * @returns {string|null} Normalised MIME type or null if unsupported.
 */
export function detectFileType(mimeType, filename = "") {
  const mime = (mimeType && String(mimeType).trim().toLowerCase()) || "";
  if (Object.values(SUPPORTED_MIME_TYPES).includes(mime)) return mime;
  const ext = (filename && String(filename).trim().toLowerCase().replace(/^\.+/, "").split(".").pop()) || "";
  return EXT_TO_MIME[ext] || null;
}

/**
 * Normalise extracted text: collapse >2 newlines, trim, UTF-8 safe. Loss-minimising.
 * @param {string} text
 * @returns {string}
 */
export function normaliseExtractedText(text) {
  if (text == null || typeof text !== "string") return "";
  let out = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();
  if (!Buffer.isEncoding("utf8")) return out;
  try {
    Buffer.from(out, "utf8");
  } catch (_) {
    out = out.replace(/[\uFFFD]/g, "").replace(/[^\x00-\x7F\u0080-\uFFFF]/g, "");
  }
  return out;
}

/**
 * Extract text from a file buffer by MIME type.
 * X1.1b: Returns extraction-health metadata (fileType, method, textLength, numLines, hasCurrencyToken, hasDigits, warnings).
 * @param {Buffer} fileBuffer
 * @param {string} mimeType - Normalised MIME (from detectFileType).
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<{ text: string, extraction: { fileType: string, method: string, textLength: number, numLines: number, hasCurrencyToken: boolean, hasDigits: boolean, warnings: string[] } }>}
 */
export async function extractTextFromSource(fileBuffer, mimeType, options = {}) {
  const timeoutMs = options.timeoutMs ?? EXTRACTION_TIMEOUT_MS;
  const type = MIME_TO_TYPE[mimeType] || mimeType?.split("/").pop()?.toLowerCase();

  const runWithTimeout = (promise) => {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("extraction_timeout")), timeoutMs)
      ),
    ]);
  };

  if (type === "pdf") {
    const pdfParse = (await import("pdf-parse")).default;
    const data = await runWithTimeout(pdfParse(fileBuffer));
    const raw = (data?.text ?? "").trim();
    const afterPdfCleanup = normalisePdfExtractedText(raw);
    const text = normaliseExtractedText(afterPdfCleanup);
    const extraction = computeExtractionHealth(text, "pdf", "pdf-parse");
    return { text, extraction };
  }

  if (type === "docx") {
    const mammoth = await import("mammoth");
    const result = await runWithTimeout(mammoth.extractRawText({ buffer: fileBuffer }));
    const text = normaliseExtractedText((result?.value ?? "").trim());
    const extraction = computeExtractionHealth(text, "docx", "mammoth");
    return { text, extraction };
  }

  if (type === "pptx") {
    const JSZip = (await import("jszip")).default;
    const zip = await runWithTimeout(new JSZip().loadAsync(fileBuffer));
    const slideNames = Object.keys(zip.files || {})
      .filter((n) => n.match(/^ppt\/slides\/slide\d+\.xml$/i))
      .sort((a, b) => {
        const na = parseInt(a.replace(/\D/g, ""), 10) || 0;
        const nb = parseInt(b.replace(/\D/g, ""), 10) || 0;
        return na - nb;
      });
    const parts = [];
    for (const name of slideNames) {
      const entry = zip.files[name];
      if (!entry) continue;
      const xml = await entry.async("string");
      const texts = (xml.match(/<a:t>([^<]*)<\/a:t>/g) || []).map((m) => m.replace(/<\/?a:t>/g, ""));
      parts.push(texts.join(" ").trim());
    }
    const text = normaliseExtractedText(parts.filter(Boolean).join("\n"));
    const extraction = computeExtractionHealth(text, "pptx", "jszip+slide-xml");
    return { text, extraction };
  }

  if (type === "xlsx") {
    const XLSX = await import("xlsx");
    const wb = await runWithTimeout(Promise.resolve(XLSX.read(fileBuffer, { type: "buffer", cellText: true })));
    const lines = [];
    for (const sheetName of wb.SheetNames || []) {
      const sheet = wb.Sheets[sheetName];
      if (!sheet || !sheet["!ref"]) continue;
      let range;
      try {
        range = XLSX.utils.decode_range(sheet["!ref"]);
      } catch (_) {
        continue;
      }
      for (let R = range.s.r; R <= range.e.r; R++) {
        const rowCells = [];
        for (let C = range.s.c; C <= range.e.c; C++) {
          const addr = XLSX.utils.encode_cell({ r: R, c: C });
          const cell = sheet[addr];
          const val = cell?.w ?? cell?.v;
          if (val != null && String(val).trim() !== "") rowCells.push(String(val).trim());
        }
        if (rowCells.length > 0) lines.push(rowCells.join("\t"));
      }
    }
    const text = normaliseExtractedText(lines.join("\n"));
    const extraction = computeExtractionHealth(text, "xlsx", "xlsx");
    return { text, extraction };
  }

  throw new Error("unsupported_type");
}

/**
 * X1.2b: Treat source as PDF if name/mime/type indicate PDF.
 * @param {{ name?: string, title?: string, filename?: string, mimeType?: string }} s
 * @returns {boolean}
 */
function isPdfSource(s) {
  if (!s || typeof s !== "object") return false;
  const name = String(s.name ?? s.title ?? s.filename ?? "");
  const mime = String(s.mimeType || "").toLowerCase();
  return /\.pdf$/i.test(name) || mime === "application/pdf";
}

/**
 * X1.2b: Inline text that looks like raw PDF bytes (invalid payload).
 * @param {string} text
 * @returns {boolean}
 */
function looksLikeRawPdfBytes(text) {
  const str = typeof text === "string" ? text.trim() : "";
  return str.length >= 5 && str.slice(0, 5) === "%PDF-";
}

/**
 * X1.3: PDF header signature in extracted text sample (first 200 chars).
 * @param {string} text
 * @returns {boolean}
 */
function pdfHeaderInSample(text) {
  const str = typeof text === "string" ? text : "";
  const sample = str.slice(0, 200);
  return sample.includes("%PDF-");
}

/**
 * X1.3: Printable character ratio (ASCII printable + tab/newline). Rounded to 3 dp.
 * @param {string} text
 * @returns {number|null} null if length 0
 */
function printableCharRatio(text) {
  const str = typeof text === "string" ? text : "";
  if (str.length === 0) return null;
  let printable = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if ((c >= 0x20 && c <= 0x7e) || c === 0x09 || c === 0x0a) printable++;
  }
  const ratio = printable / str.length;
  return Math.round(ratio * 1000) / 1000;
}

/**
 * X1.3: Compute guardrail status, reasons, and metrics for one source (deterministic).
 * @param {string} text - Extracted text
 * @param {{ extractedTextLength?: number, rawBytesLength?: number | null, fileType?: string, tokenProbeHits?: object, detectedNumberCount?: number }} [ext]
 * @returns {{ guardrailStatus: "OK"|"WARN"|"ERROR", guardrailReasons: string[], guardrailMetrics: object }}
 */
export function computeGuardrailForSource(text, ext = {}) {
  const str = typeof text === "string" ? text : "";
  const extractedTextLength = typeof ext.extractedTextLength === "number" ? ext.extractedTextLength : str.length;
  const rawBytesLength = typeof ext.rawBytesLength === "number" ? ext.rawBytesLength : null;
  const fileType = ext.fileType || "unknown";
  const isPdf = fileType === "pdf";
  const hits = ext.tokenProbeHits && typeof ext.tokenProbeHits === "object" ? ext.tokenProbeHits : {};
  const hasAnyDigits = Boolean(hits.hasAnyDigits);
  const hasCurrencySymbol = Boolean(hits.hasCurrencySymbol);
  const hasCompactMagnitude = Boolean(hits.hasCompactMagnitude);
  const detectedNumberCount = typeof ext.detectedNumberCount === "number" ? ext.detectedNumberCount : 0;

  const ratio = printableCharRatio(str);
  const reasons = [];

  // ERROR conditions
  if (pdfHeaderInSample(str)) reasons.push("pdf_header_leaked_into_text");
  if (isPdf && extractedTextLength < MIN_EXTRACT_LEN_PDF && rawBytesLength != null && rawBytesLength >= MIN_RAW_BYTES_FOR_EXPECTED_TEXT) {
    reasons.push("extract_too_short_for_pdf_size");
  }
  if (ratio != null && ratio < MIN_PRINTABLE_RATIO) reasons.push("extract_low_printable_ratio");

  const isError = reasons.length > 0;
  if (!isError) {
    // WARN conditions (between MIN_EXTRACT_LEN_PDF and MIN_EXTRACT_LEN_WARN_PDF = [500, 1200))
    if (isPdf && extractedTextLength >= MIN_EXTRACT_LEN_PDF && extractedTextLength < MIN_EXTRACT_LEN_WARN_PDF) {
      reasons.push("extract_suspiciously_short");
    }
    const expectNumeric = hasAnyDigits || hasCurrencySymbol || hasCompactMagnitude;
    if (expectNumeric && detectedNumberCount === 0) reasons.push("no_numbers_detected_despite_tokens");
  }

  const guardrailStatus = isError ? "ERROR" : (reasons.length > 0 ? "WARN" : "OK");
  const guardrailReasons = [...reasons].sort();

  const guardrailMetrics = {
    extractedTextLength,
    rawBytesLength: rawBytesLength ?? null,
    printableCharRatio: ratio,
    hasAnyDigits,
    hasCurrencySymbol,
    hasCompactMagnitude,
    detectedNumberCount,
  };

  return { guardrailStatus, guardrailReasons, guardrailMetrics };
}

/**
 * Prepare sources for pipeline: resolve contentBase64 + mimeType/filename to .text.
 * X1.1b: Attaches source.meta.extraction (fileType, method, textLength, numLines, hasCurrencyToken, hasDigits, warnings).
 * X1.2b: PDFs must be ingested as raw files only; reject inline_text PDF payloads (400-worthy).
 * Returns sourceIngestionWarning when PDF(s) have very low text; totalTextLowWarning when total text < MIN_TOTAL_TEXT.
 * @param {Array<{ id?: string, name?: string, title?: string, text?: string, contentBase64?: string, mimeType?: string, filename?: string }>} sources
 * @param {{ maxSizeBytes?: number, timeoutMs?: number }} [options]
 * @returns {Promise<{ sources: Array<{ id?: string, name?: string, title?: string, text: string, meta?: { extraction: object } }>, error?: { code: string, message: string }, warnings?: string[], sourceIngestionWarning?: string, totalTextLowWarning?: boolean }>}
 */
export async function prepareUploadedSourcesForPipeline(sources, options = {}) {
  const maxSizeBytes = options.maxSizeBytes ?? DEFAULT_MAX_FILE_SIZE_BYTES;
  const timeoutMs = options.timeoutMs ?? EXTRACTION_TIMEOUT_MS;
  const warnings = [];
  let anyPdfVeryLow = false;
  let totalTextLength = 0;

  if (!Array.isArray(sources)) {
    return { sources: [], error: { code: "invalid_sources", message: "sources must be an array" } };
  }

  const out = [];
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    if (!s || typeof s !== "object") {
      const extraction = computeExtractionHealth("", "txt", "inline");
      const x11f = buildExtractionTraceability("", "unknown", {}, extraction);
      extraction.warnings = [...(extraction.warnings || []), "missing_source_content"];
      out.push({
        id: null,
        name: "Untitled source",
        title: "Untitled source",
        text: "",
        publicationState: "unknown",
        meta: { extraction: { ...extraction, ...x11f } },
      });
      continue;
    }

    const hasText = typeof s.text === "string";
    const hasContent = typeof s.contentBase64 === "string" && s.contentBase64.length > 0;

    // X1.2b PART 3.1: If both raw file and inline text present for a PDF, raw_file wins — use buffer path only; ignore inline.
    const isPdf = isPdfSource(s);
    if (hasText && !hasContent) {
      const text = String(s.text);
      // X1.2b 2.2: Raw PDF bytes sniff — always reject
      if (looksLikeRawPdfBytes(text)) {
        return {
          sources: out,
          error: {
            code: "PDF_INLINE_TEXT_NOT_ALLOWED",
            message: "PDF sources must be uploaded as files (raw PDF). Inline text payload is not accepted.",
          },
        };
      }
      // X1.2b 2.1: PDF presented as inline only (no file part) — reject
      if (isPdf) {
        return {
          sources: out,
          error: {
            code: "PDF_INLINE_TEXT_NOT_ALLOWED",
            message: "PDF sources must be uploaded as files (raw PDF). Inline text payload is not accepted.",
          },
        };
      }
      const extraction = computeExtractionHealth(text, "txt", "inline");
      const x11f = buildExtractionTraceability(text, "inline_text", s, { ...extraction, warnings: extraction.warnings || [] });
      totalTextLength += text.length;
      out.push({
        ...s,
        text,
        name: s.name ?? s.title ?? "Untitled source",
        title: s.title ?? s.name ?? "Untitled source",
        publicationState: normalizePublicationState(s.publicationState),
        meta: { ...(s.meta || {}), extraction: { ...extraction, ...x11f, rawBytesLength: null } },
      });
      continue;
    }

    if (!hasContent) {
      const text = hasText ? String(s.text) : "";
      const extraction = computeExtractionHealth(text, "txt", "inline");
      const warningsOut = [...(extraction.warnings || [])];
      if (!hasText || !text.trim()) warningsOut.push("missing_source_content");
      const x11f = buildExtractionTraceability(text, hasText ? "inline_text" : "unknown", s, { ...extraction, warnings: warningsOut });
      totalTextLength += text.length;
      out.push({
        ...s,
        text,
        name: s.name ?? s.title ?? "Untitled source",
        title: s.title ?? s.name ?? "Untitled source",
        publicationState: normalizePublicationState(s.publicationState),
        meta: { ...(s.meta || {}), extraction: { ...extraction, warnings: warningsOut, ...x11f, rawBytesLength: null } },
      });
      continue;
    }

    let buffer;
    try {
      buffer = Buffer.from(s.contentBase64, "base64");
    } catch (e) {
      return {
        sources: out,
        error: { code: "invalid_base64", message: `Source ${i + 1}: invalid base64 content` },
      };
    }

    if (buffer.length > maxSizeBytes) {
      return {
        sources: out,
        error: {
          code: "file_too_large",
          message: `Source ${i + 1} exceeds max size (${maxSizeBytes} bytes)`,
        },
      };
    }

    const mimeType = detectFileType(s.mimeType, s.filename || s.name || s.title);
    // X1.2: PDF-specific size guard (MAX_PDF_MB). Return clear non-500 error.
    if (mimeType === SUPPORTED_MIME_TYPES.PDF && buffer.length > MAX_PDF_BYTES) {
      return {
        sources: out,
        error: {
          code: "pdf_too_large",
          message: `PDF too large to process (limit: ${MAX_PDF_MB} MB).`,
        },
      };
    }
    if (!mimeType) {
      return {
        sources: out,
        error: {
          code: "unsupported_type",
          message: `Source ${i + 1}: unsupported file type (use PDF, DOCX, PPTX, or XLSX)`,
        },
      };
    }

    let extracted;
    try {
      extracted = await extractTextFromSource(buffer, mimeType, { timeoutMs });
    } catch (e) {
      const msg = e?.message === "extraction_timeout" ? "extraction_timeout" : (e?.message || "extraction_failed");
      return {
        sources: out,
        error: { code: msg, message: `Source ${i + 1}: ${msg}` },
      };
    }

    const text = extracted?.text != null ? String(extracted.text) : "";
    const extraction = extracted?.extraction || computeExtractionHealth(text, MIME_TO_TYPE[mimeType] || "txt", "extract");
    const method = extraction?.method || "extract";
    // X1.2b PART 3.1: If both raw_file and inline text were present for this PDF, raw_file took precedence — record it
    const extractionWarnings = [...(extraction.warnings || [])];
    if (mimeType === SUPPORTED_MIME_TYPES.PDF && hasText) {
      extractionWarnings.push("pdf_inline_text_ignored");
    }
    const x11f = buildExtractionTraceability(text, "raw_file", { filename: s.filename, name: s.name, title: s.title, mimeType: s.mimeType }, { ...extraction, warnings: extractionWarnings });
    totalTextLength += text.length;

    // X1.2: One line per PDF when parsed server-side (authoritative raw_file path)
    if (mimeType === SUPPORTED_MIME_TYPES.PDF) {
      const name = s.name ?? s.title ?? s.filename ?? "unknown";
      const sizeMB = (buffer.length / (1024 * 1024)).toFixed(2);
      console.log("[X1.2][PDF_RAW]", { name, bytes: buffer.length, sizeMB, extractedLen: text.length, method });
    }

    if (extraction.fileType === "pdf" && (extraction.warnings.includes("very_low_text") || extraction.warnings.includes("empty_text"))) {
      anyPdfVeryLow = true;
    }
    if (text.length === 0) {
      warnings.push(`Source ${i + 1} (${s.name || s.title || "Untitled"}): extracted text is empty`);
    }

    out.push({
      ...s,
      text,
      name: s.name ?? s.title ?? "Untitled source",
      title: s.title ?? s.name ?? "Untitled source",
      publicationState: normalizePublicationState(s.publicationState),
      meta: { ...(s.meta || {}), extraction: { ...extraction, warnings: extractionWarnings, ...x11f, rawBytesLength: buffer.length } },
    });
  }

  let sourceIngestionWarning;
  if (anyPdfVeryLow) {
    sourceIngestionWarning = "One or more PDF sources produced very low extracted text. Results may be incomplete.";
  }
  const totalTextLowWarning = totalTextLength < MIN_TOTAL_TEXT;

  // X1.1c: Expose thresholds for Review response meta.extractionHealth
  const thresholds = {
    minTextLenPdf: MIN_TEXT_LEN_PDF,
    veryLowTextLenPdf: VERY_LOW_TEXT_LEN_PDF,
    minTotalTextLen: MIN_TOTAL_TEXT,
  };

  return {
    sources: out,
    thresholds,
    ...(warnings.length > 0 ? { warnings } : {}),
    ...(sourceIngestionWarning ? { sourceIngestionWarning } : {}),
    ...(totalTextLowWarning ? { totalTextLowWarning: true } : {}),
  };
}
