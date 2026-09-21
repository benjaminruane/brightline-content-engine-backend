#!/usr/bin/env node
/**
 * B163 Part 1 inspect + Part 2 local extract (production extractor, no LLM).
 * Usage: node scripts/diagnostic/delivery-check/b163/inspect-and-extract.mjs
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  EXTRACTION_TIMEOUT_MS,
  MAX_PDF_BYTES,
  prepareUploadedSourcesForPipeline,
  SUPPORTED_MIME_TYPES,
} from "../../../../lib/extract-text-from-source.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const CORPUS = path.join(ROOT, "corpus");
const EXTRACTS = path.join(ROOT, "extracts");
const CATALOG = JSON.parse(await readFile(path.join(ROOT, "catalog.json"), "utf8"));

const MAX_REQUEST_BYTES = 4_200_000;
const REQUEST_JSON_OVERHEAD_BYTES = 8_192;
const VERCEL_EDGE_BODY_BYTES = 4_500_000;

function estimateEncodedSize(n) {
  return 4 * Math.ceil(n / 3);
}

function ceilingReport(rawBytes) {
  const encodedBase64Bytes = estimateEncodedSize(rawBytes);
  const estimatedRequestBytes = encodedBase64Bytes + REQUEST_JSON_OVERHEAD_BYTES;
  const overVercelBy = Math.max(0, estimatedRequestBytes - VERCEL_EDGE_BODY_BYTES);
  const overClientBy = Math.max(0, estimatedRequestBytes - MAX_REQUEST_BYTES);
  return {
    rawBytes,
    encodedBase64Bytes,
    estimatedRequestBytes,
    vercelEdgeBodyBytes: VERCEL_EDGE_BODY_BYTES,
    clientGuardBytes: MAX_REQUEST_BYTES,
    overVercelBy,
    overClientBy,
    exceedsVercel45mb: estimatedRequestBytes > VERCEL_EDGE_BODY_BYTES,
    exceedsClient42mb: estimatedRequestBytes > MAX_REQUEST_BYTES,
    exceedsMaxPdfMb: rawBytes > MAX_PDF_BYTES,
  };
}

function clusterXs(xs) {
  if (xs.length < 20) return { clusters: 0 };
  const sorted = [...xs].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const span = max - min;
  if (span < 120) return { clusters: 1, span };
  const mid = min + span / 2;
  const left = xs.filter((x) => x < mid - 40).length;
  const right = xs.filter((x) => x > mid + 40).length;
  const both = left / xs.length >= 0.18 && right / xs.length >= 0.18;
  return { clusters: both ? 2 : 1, span, left, right, mid };
}

async function inspectPdf(buf) {
  const doc = await getDocument({
    data: new Uint8Array(buf),
    disableWorker: true,
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;
  const meta = await doc.getMetadata();
  const info = meta?.info && typeof meta.info === "object" ? meta.info : {};
  const fonts = new Set();
  let textChars = 0;
  let imagePaintOps = 0;
  let columnPages = 0;
  let tableishPages = 0;
  const pages = doc.numPages;
  const maxPages = Math.min(pages, 40);
  for (let p = 1; p <= maxPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const styles = tc.styles && typeof tc.styles === "object" ? tc.styles : {};
    for (const s of Object.values(styles)) {
      if (s?.fontFamily) fonts.add(String(s.fontFamily));
    }
    const items = Array.isArray(tc.items) ? tc.items : [];
    const xs = [];
    const byY = new Map();
    for (const it of items) {
      const str = typeof it.str === "string" ? it.str : "";
      textChars += str.length;
      const tr = Array.isArray(it.transform) ? it.transform : [];
      const x = Number(tr[4]);
      const y = Number(tr[5]);
      if (str.trim().length > 1 && Number.isFinite(x)) xs.push(x);
      if (str.trim() && Number.isFinite(y)) {
        const key = Math.round(y / 2) * 2;
        const row = byY.get(key) || [];
        row.push(str.trim());
        byY.set(key, row);
      }
    }
    const col = clusterXs(xs);
    if (col.clusters >= 2) columnPages += 1;
    let numericRows = 0;
    for (const row of byY.values()) {
      if (row.length < 4) continue;
      const nums = row.filter((t) => /[\d]/.test(t) && t.replace(/[\d,.\-%£$€CHF]/g, "").length <= 2).length;
      if (nums >= 3) numericRows += 1;
    }
    if (numericRows >= 3) tableishPages += 1;
    const ops = await page.getOperatorList();
    const fns = ops?.fnArray || [];
    for (const fn of fns) {
      if (
        fn === OPS.paintImageXObject ||
        fn === OPS.paintImageXObjectRepeat ||
        fn === OPS.paintInlineImageXObject ||
        fn === OPS.paintJpegXObject
      ) {
        imagePaintOps += 1;
      }
    }
  }
  const textLayer = textChars >= 80 ? "real_text_layer" : imagePaintOps > 0 ? "image_or_empty" : "empty_or_unknown";
  return {
    pageCount: pages,
    pagesInspected: maxPages,
    producer: info.Producer || null,
    creator: info.Creator || null,
    title: info.Title || null,
    pdfVersion: info.PDFFormatVersion || null,
    creationDate: info.CreationDate || null,
    fonts: [...fonts].sort(),
    fontCount: fonts.size,
    inspectTextChars: textChars,
    imagePaintOps,
    columnPages,
    tableishPages,
    hasColumns: columnPages > 0,
    hasTables: tableishPages > 0,
    textLayer,
  };
}

const APOSTROPHE_MANGLE_RE = /\b\w+\s+n\s+[st]\b|\bn\s+t\b|[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\uFFFD]/g;
const CURLY_RE = /[\u2018\u2019\u201C\u201D]/g;
const STRAIGHT_QUOTE_RE = /['"]/g;
const LIGATURE_RE = /[\uFB00-\uFB06]/g;
const HARD_BREAK_RE = /([a-z,;:])\n([a-z])/g;
const HYPHEN_LINE_RE = /([A-Za-z]{3,})-\n([a-z]{2,})/g;
const LONE_PAGE_NUM_RE = /(?:^|\n)\s*(\d{1,3})\s*(?:\n|$)/g;

function takeExamples(re, text, n = 3) {
  const out = [];
  const src = typeof text === "string" ? text : "";
  const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
  const r = new RegExp(re.source, flags);
  let m;
  while ((m = r.exec(src)) && out.length < n) {
    const i = m.index;
    const slice = src.slice(Math.max(0, i - 40), Math.min(src.length, i + (m[0].length) + 40)).replace(/\n/g, "\\n");
    out.push(slice);
  }
  return out;
}

function countAll(re, text) {
  const src = typeof text === "string" ? text : "";
  const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
  const r = new RegExp(re.source, flags);
  return (src.match(r) || []).length;
}

function repeatingLines(text) {
  const lines = String(text || "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length >= 8 && l.length <= 80);
  const freq = new Map();
  for (const l of lines) freq.set(l, (freq.get(l) || 0) + 1);
  const repeats = [...freq.entries()].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]);
  return {
    count: repeats.reduce((s, [, n]) => s + n, 0),
    examples: repeats.slice(0, 3).map(([line, n]) => `${JSON.stringify(line)} x${n}`),
  };
}

function tableFlattenHints(text) {
  const lines = String(text || "").split("\n");
  const hits = [];
  for (const line of lines) {
    const nums = line.match(/[\d]+(?:[.,]\d+)?%?/g) || [];
    if (nums.length >= 5 && line.length < 180) hits.push(line.trim().slice(0, 160));
  }
  return { count: hits.length, examples: hits.slice(0, 3) };
}

function defectScan(text) {
  const t = typeof text === "string" ? text : "";
  const mangle = takeExamples(APOSTROPHE_MANGLE_RE, t);
  const curlyLeft = (t.match(CURLY_RE) || []).length;
  const straight = (t.match(STRAIGHT_QUOTE_RE) || []).length;
  const hard = takeExamples(HARD_BREAK_RE, t);
  const hyphen = takeExamples(HYPHEN_LINE_RE, t);
  const lig = takeExamples(LIGATURE_RE, t);
  const headers = repeatingLines(t);
  const pageNums = countAll(LONE_PAGE_NUM_RE, t);
  const pageNumEx = takeExamples(LONE_PAGE_NUM_RE, t);
  const tables = tableFlattenHints(t);
  return {
    curlyOrMangledQuotes: {
      controlOrReplacementOrNsMangle: countAll(APOSTROPHE_MANGLE_RE, t),
      remainingCurlyQuotes: curlyLeft,
      straightQuotes: straight,
      examples: mangle,
    },
    ligatures: { count: countAll(LIGATURE_RE, t), examples: lig },
    hardLineBreaksInsideSentence: { count: countAll(HARD_BREAK_RE, t), examples: hard },
    hyphenatedAcrossLineEnding: { count: countAll(HYPHEN_LINE_RE, t), examples: hyphen },
    repeatedHeadersFooters: headers,
    pageNumbersInFlow: { count: pageNums, examples: pageNumEx },
    tableFlattenedIntoProse: tables,
  };
}

function pickDraftFromExtract(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  const withNum = t.match(/[^.?!]{40,280}?\d[\d,.]*(?:\s*(?:million|billion|percent|%|pence|m\b|bn\b))?[^.]{0,80}[.?!]/i);
  if (withNum) return withNum[0].trim().slice(0, 500);
  return t.slice(0, 400);
}

function wordCount(text) {
  const t = String(text || "").trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

async function extractOne(filename, buf) {
  const contentBase64 = buf.toString("base64");
  const t0 = Date.now();
  const prep = await prepareUploadedSourcesForPipeline(
    [
      {
        name: filename,
        filename,
        mimeType: SUPPORTED_MIME_TYPES.PDF,
        contentBase64,
      },
    ],
    { timeoutMs: EXTRACTION_TIMEOUT_MS }
  );
  const elapsedMs = Date.now() - t0;
  if (prep.error) {
    return {
      elapsedMs,
      status: prep.error.code === "extraction_timeout" ? "timeout" : "error",
      errorCode: prep.error.code,
      errorMessage: prep.error.message,
      text: "",
      charCount: 0,
      wordCount: 0,
      extractionStatus: null,
      extractionWarnings: [],
      sourceIngestionWarning: prep.sourceIngestionWarning || null,
      totalTextLowWarning: prep.totalTextLowWarning === true,
    };
  }
  const row = Array.isArray(prep.sources) ? prep.sources[0] : null;
  const text = typeof row?.text === "string" ? row.text : "";
  const extraction = row?.meta?.extraction && typeof row.meta.extraction === "object" ? row.meta.extraction : {};
  return {
    elapsedMs,
    status: "ok",
    errorCode: null,
    errorMessage: null,
    text,
    charCount: text.length,
    wordCount: wordCount(text),
    extractionStatus: extraction.status || null,
    extractionWarnings: Array.isArray(extraction.warnings) ? extraction.warnings : [],
    sourceIngestionWarning: prep.sourceIngestionWarning || null,
    totalTextLowWarning: prep.totalTextLowWarning === true,
    meaningfulTextLength: extraction.meaningfulTextLength ?? null,
  };
}

await mkdir(EXTRACTS, { recursive: true });

const rows = [];
for (const doc of CATALOG.documents) {
  const filePath = path.join(CORPUS, doc.filename);
  process.stderr.write(`inspect ${doc.id} ${doc.filename}\n`);
  const buf = await readFile(filePath);
  const sha256 = createHash("sha256").update(buf).digest("hex");
  const ceilings = ceilingReport(buf.length);
  let inspect;
  try {
    inspect = await inspectPdf(buf);
  } catch (err) {
    inspect = { error: err?.message || String(err) };
  }
  process.stderr.write(`extract ${doc.id} ${doc.filename} bytes=${buf.length}\n`);
  const extracted = await extractOne(doc.filename, buf);
  process.stderr.write(
    `  ${extracted.status} chars=${extracted.charCount} words=${extracted.wordCount} ms=${extracted.elapsedMs} err=${extracted.errorCode || "none"}\n`
  );
  const stem = doc.filename.replace(/\.pdf$/i, "");
  await writeFile(path.join(EXTRACTS, `${stem}.txt`), extracted.text || "", "utf8");
  const defects = extracted.text ? defectScan(extracted.text) : null;
  const draftProbe = extracted.text ? pickDraftFromExtract(extracted.text) : "";
  const { text: _omit, ...extractMeta } = extracted;
  const row = {
    ...doc,
    sha256,
    ...ceilings,
    inspect,
    extract: extractMeta,
    draftProbe,
    defects,
  };
  rows.push(row);
  await writeFile(path.join(EXTRACTS, `${doc.id}-row.json`), JSON.stringify(row, null, 2));
}

const manifest = {
  spec: "B163",
  ranAt: new Date().toISOString(),
  extractionTimeoutMs: EXTRACTION_TIMEOUT_MS,
  maxPdfBytes: MAX_PDF_BYTES,
  documents: rows.map((r) => ({
    id: r.id,
    filename: r.filename,
    genre: r.genre,
    sourceKind: r.sourceKind,
    origin: r.origin,
    url: r.url,
    sha256: r.sha256,
    rawBytes: r.rawBytes,
    encodedBase64Bytes: r.encodedBase64Bytes,
    estimatedRequestBytes: r.estimatedRequestBytes,
    overVercelBy: r.overVercelBy,
    overClientBy: r.overClientBy,
    exceedsVercel45mb: r.exceedsVercel45mb,
    exceedsClient42mb: r.exceedsClient42mb,
    pageCount: r.inspect?.pageCount ?? null,
    hasColumns: r.inspect?.hasColumns ?? null,
    hasTables: r.inspect?.hasTables ?? null,
    textLayer: r.inspect?.textLayer ?? null,
    producer: r.inspect?.producer ?? null,
    creator: r.inspect?.creator ?? null,
    pdfVersion: r.inspect?.pdfVersion ?? null,
    fontCount: r.inspect?.fontCount ?? null,
    fonts: r.inspect?.fonts ?? [],
    imagePaintOps: r.inspect?.imagePaintOps ?? null,
    columnPages: r.inspect?.columnPages ?? null,
    tableishPages: r.inspect?.tableishPages ?? null,
    extractStatus: r.extract?.status ?? null,
    extractElapsedMs: r.extract?.elapsedMs ?? null,
    extractCharCount: r.extract?.charCount ?? null,
    extractWordCount: r.extract?.wordCount ?? null,
    extractErrorCode: r.extract?.errorCode ?? null,
    extractErrorMessage: r.extract?.errorMessage ?? null,
  })),
};

await writeFile(path.join(ROOT, "manifest.json"), JSON.stringify(manifest, null, 2));
await writeFile(path.join(ROOT, "inspect-extract-full.json"), JSON.stringify({ catalog: CATALOG, rows }, null, 2));
console.log(`wrote manifest documents=${rows.length} ok=${rows.filter((r) => r.extract?.status === "ok").length}`);
