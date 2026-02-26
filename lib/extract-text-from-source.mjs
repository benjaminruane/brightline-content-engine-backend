/**
 * X1.1: Multi-format source ingestion — deterministic text extraction layer.
 * Converts PDF, DOCX, PPTX, XLSX into plain text for the existing pipeline.
 * No changes to QC, canonicalClaims, or reliabilityScore.
 */

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

/** Extraction timeout (ms). */
export const EXTRACTION_TIMEOUT_MS = 60_000;

// X1.1b: PDF quality thresholds (configurable via env)
const MIN_TEXT_LEN_PDF = Math.max(50, parseInt(process.env.X1_1B_MIN_TEXT_LEN_PDF || "200", 10) || 200);
const VERY_LOW_TEXT_LEN_PDF = 50;
/** Minimum total text length across all sources to avoid silent empty-source behaviour. */
export const MIN_TOTAL_TEXT = Math.max(100, parseInt(process.env.X1_1B_MIN_TOTAL_TEXT || "300", 10) || 300);

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
 * Prepare sources for pipeline: resolve contentBase64 + mimeType/filename to .text.
 * X1.1b: Attaches source.meta.extraction (fileType, method, textLength, numLines, hasCurrencyToken, hasDigits, warnings).
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
      out.push({
        id: null,
        name: "Untitled source",
        title: "Untitled source",
        text: "",
        meta: { extraction },
      });
      continue;
    }

    const hasText = typeof s.text === "string";
    const hasContent = typeof s.contentBase64 === "string" && s.contentBase64.length > 0;

    if (hasText && !hasContent) {
      const text = String(s.text);
      const extraction = computeExtractionHealth(text, "txt", "inline");
      totalTextLength += text.length;
      out.push({
        ...s,
        text,
        name: s.name ?? s.title ?? "Untitled source",
        title: s.title ?? s.name ?? "Untitled source",
        meta: { ...(s.meta || {}), extraction },
      });
      continue;
    }

    if (!hasContent) {
      const text = hasText ? String(s.text) : "";
      const extraction = computeExtractionHealth(text, "txt", "inline");
      totalTextLength += text.length;
      out.push({
        ...s,
        text,
        name: s.name ?? s.title ?? "Untitled source",
        title: s.title ?? s.name ?? "Untitled source",
        meta: { ...(s.meta || {}), extraction },
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
    totalTextLength += text.length;

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
      meta: { ...(s.meta || {}), extraction },
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
