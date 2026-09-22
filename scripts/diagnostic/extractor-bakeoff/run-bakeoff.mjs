#!/usr/bin/env node
/**
 * B319. Extractor bake-off. Diagnostic only. No LLM.
 *
 *   node scripts/diagnostic/extractor-bakeoff/run-bakeoff.mjs
 *
 * Arms:
 *   A = production extractTextFromSource (officeparser text convert)
 *   B = pdfjs getTextContent, items in returned order
 *   C = pdfjs items grouped by page, y-band, then x
 *
 * Defect census is copied from scripts/diagnostic/delivery-check/b163/inspect-and-extract.mjs
 * (HARD_BREAK_RE, tableFlattenHints, repeatingLines, LONE_PAGE_NUM_RE). Not a new census.
 */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  SUPPORTED_MIME_TYPES,
  extractTextFromSource,
} from "../../../lib/extract-text-from-source.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const B163 = path.resolve(ROOT, "../delivery-check/b163");
const CORPUS = path.join(B163, "corpus");
const REVIEWS = path.join(B163, "reviews");
const OUT = path.join(ROOT, "outputs");
const SCANNED_FIXTURE = path.resolve(ROOT, "../../../tests/extraction-corpus/files/image_only.pdf");

const PDFJS_OPTS = {
  disableWorker: true,
  isEvalSupported: false,
  useSystemFonts: true,
};

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
    const slice = src.slice(Math.max(0, i - 40), Math.min(src.length, i + m[0].length + 40)).replace(/\n/g, "\\n");
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

function censusSlice(d) {
  if (!d) return { midSentenceHardWraps: 0, linesWithFivePlusNumberTokens: 0, linesRepeatingThreePlus: 0, lone1to3DigitLines: 0 };
  return {
    midSentenceHardWraps: d.hardLineBreaksInsideSentence?.count || 0,
    linesWithFivePlusNumberTokens: d.tableFlattenedIntoProse?.count || 0,
    linesRepeatingThreePlus: d.repeatedHeadersFooters?.count || 0,
    lone1to3DigitLines: d.pageNumbersInFlow?.count || 0,
  };
}

function wsNorm(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function quoteHit(text, quote) {
  const q = wsNorm(quote);
  if (!q) return null;
  return wsNorm(text).includes(q);
}

function snippetAround(text, quote, radius = 180) {
  const t = String(text || "");
  const q = wsNorm(quote);
  if (!q) return t.slice(0, radius * 2);
  const n = wsNorm(t);
  const i = n.indexOf(q);
  if (i < 0) return null;
  const start = Math.max(0, i - radius);
  return n.slice(start, i + q.length + radius);
}

function firstLines(text, n = 18) {
  return String(text || "")
    .split("\n")
    .slice(0, n)
    .join("\n");
}

function missingKind(armA, other) {
  const a = typeof armA === "string" ? armA : "";
  const b = typeof other === "string" ? other : "";
  const delta = b.length - a.length;
  if (delta >= 0) return { deltaChars: delta, deltaPct: a.length ? (delta / a.length) * 100 : 0, missing: null };
  const aN = wsNorm(a).length;
  const bN = wsNorm(b).length;
  const missing = bN >= aN - 2 ? "whitespace" : "content";
  return { deltaChars: delta, deltaPct: a.length ? (delta / a.length) * 100 : 0, missing };
}

function itemRecord(it, styles) {
  const tr = Array.isArray(it?.transform) ? it.transform : [];
  const fontName = typeof it?.fontName === "string" ? it.fontName : null;
  const style = fontName && styles && styles[fontName] ? styles[fontName] : null;
  return {
    str: typeof it?.str === "string" ? it.str : "",
    x: Number(tr[4]),
    y: Number(tr[5]),
    width: Number.isFinite(Number(it?.width)) ? Number(it.width) : null,
    height: Number.isFinite(Number(it?.height)) ? Number(it.height) : null,
    hasEOL: it?.hasEOL === true,
    fontName,
    fontFamily: style?.fontFamily || null,
    fontSize: Number.isFinite(Number(tr[0])) ? Number(tr[0]) : null,
  };
}

async function loadPdfjsPages(buf) {
  const doc = await getDocument({ data: new Uint8Array(buf), ...PDFJS_OPTS }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const styles = tc.styles && typeof tc.styles === "object" ? tc.styles : {};
    const items = (Array.isArray(tc.items) ? tc.items : []).map((it) => itemRecord(it, styles));
    pages.push({ page: p, items });
  }
  return pages;
}

function armBText(pages) {
  let out = "";
  for (const pg of pages) {
    for (const it of pg.items) {
      out += it.str;
      if (it.hasEOL) out += "\n";
    }
    out += "\n";
  }
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

function armCText(pages) {
  const parts = [];
  for (const pg of pages) {
    const bands = new Map();
    for (const it of pg.items) {
      if (!it.str) continue;
      const y = Number.isFinite(it.y) ? it.y : 0;
      const key = Math.round(y);
      const row = bands.get(key) || [];
      row.push(it);
      bands.set(key, row);
    }
    const yKeys = [...bands.keys()].sort((a, b) => b - a);
    for (const y of yKeys) {
      const row = bands.get(y).slice().sort((a, b) => (a.x || 0) - (b.x || 0));
      parts.push(row.map((it) => it.str).join(" "));
    }
    parts.push("");
  }
  return parts.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function armA(buf) {
  const t0 = Date.now();
  const extracted = await extractTextFromSource(buf, SUPPORTED_MIME_TYPES.PDF);
  const wallMs = Date.now() - t0;
  const text = typeof extracted?.text === "string" ? extracted.text : "";
  const ex = extracted?.extraction && typeof extracted.extraction === "object" ? extracted.extraction : {};
  return {
    wallMs,
    text,
    charCount: text.length,
    textConvertMs: Number.isFinite(ex.textConvertMs) ? ex.textConvertMs : null,
    chunkConvertMs: Number.isFinite(ex.chunkConvertMs) ? ex.chunkConvertMs : null,
    status: ex.status || null,
    warnings: Array.isArray(ex.warnings) ? ex.warnings : [],
    structurePages: Array.isArray(ex.structure?.pages) ? ex.structure.pages.length : 0,
    meaningfulTextLength: ex.meaningfulTextLength ?? null,
  };
}

async function loadQuotes() {
  const names = await readdir(REVIEWS);
  const byId = new Map();
  for (const name of names) {
    const m = name.match(/^(d\d+)-review-extract\.json$/);
    if (!m) continue;
    const raw = JSON.parse(await readFile(path.join(REVIEWS, name), "utf8"));
    const quote = raw?.verdictWithQuote?.quote;
    const statement = raw?.verdictWithQuote?.statement;
    byId.set(m[1], {
      quote: typeof quote === "string" ? quote : "",
      statement: typeof statement === "string" ? statement : "",
      file: name,
    });
  }
  return byId;
}

function pct(n) {
  if (!Number.isFinite(n)) return "n/a";
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function mdFence(s) {
  return String(s || "").replace(/```/g, "'''");
}

async function maybeScanned() {
  try {
    const buf = await readFile(SCANNED_FIXTURE);
    const a = await armA(buf);
    const t0 = Date.now();
    const pages = await loadPdfjsPages(buf);
    const pdfjsMs = Date.now() - t0;
    const bText = armBText(pages);
    const cText = armCText(pages);
    return {
      fixture: "tests/extraction-corpus/files/image_only.pdf",
      armA: { wallMs: a.wallMs, charCount: a.charCount, status: a.status, warnings: a.warnings, textPreview: a.text.slice(0, 200) },
      armB: { wallMs: pdfjsMs, charCount: bText.length, textPreview: bText.slice(0, 200) },
      armC: { charCount: cText.length, textPreview: cText.slice(0, 200) },
    };
  } catch (e) {
    return { error: e?.message || String(e) };
  }
}

function buildReport(manifest, rows, scanned, quotes) {
  const tot = { A: 0, B: 0, C: 0 };
  let quoteA = 0;
  let quoteB = 0;
  let quoteC = 0;
  let quoteN = 0;
  const missB = [];
  const missC = [];
  for (const r of rows) {
    tot.A += r.armA.wallMs;
    tot.B += r.armB.wallMs;
    tot.C += r.armC.wallMs;
    if (r.quote) {
      quoteN += 1;
      if (r.quoteHits.A) quoteA += 1;
      if (r.quoteHits.B) quoteB += 1;
      else missB.push(r.id);
      if (r.quoteHits.C) quoteC += 1;
      else missC.push(r.id);
    }
  }
  const four = ["d01", "d02", "d03", "d04"];
  const fourRows = rows.filter((r) => four.includes(r.id));

  const lines = [];
  lines.push("# B319. Extractor bake-off");
  lines.push("");
  lines.push("Read-only diagnostic. No model calls. Same twenty B163 PDFs. Defect census copied from `scripts/diagnostic/delivery-check/b163/inspect-and-extract.mjs`. Ran locally 2026-09-22.");
  lines.push("");
  lines.push("Arms: A = officeparser text convert (production). B = pdfjs item order. C = pdfjs grouped by page, y-band, then x.");
  lines.push("");

  lines.push("## S1. The verdict");
  lines.push("");
  const bHits = quoteN ? quoteB / quoteN : 0;
  const cHits = quoteN ? quoteC / quoteN : 0;
  const aHits = quoteN ? quoteA / quoteN : 0;
  const speed = tot.B > 0 ? tot.A / tot.B : 0;
  let verdictArm = "A";
  if (bHits >= aHits && cHits >= aHits && speed > 10) verdictArm = cHits >= bHits ? "C" : "B";
  if (verdictArm === "A") {
    lines.push(
      `Put arm A in front of a reviewer. Gate 7 quote hit rate is ${quoteA}/${quoteN} on A, ${quoteB}/${quoteN} on B, ${quoteC}/${quoteN} on C, so the fast path does not keep every passage the product already quoted.`
    );
    lines.push(
      `The one thing that would stop a swap is a missed Gate 7 quote: the matcher would no longer be able to cite that sentence.`
    );
    lines.push(
      `Speed is not the stopper. Combined wall is ${tot.A} ms on A versus ${tot.B} ms on B (${speed.toFixed(0)}x). Quality of reading order is.`
    );
  } else {
    const arm = verdictArm;
    lines.push(
      `Put arm ${arm} in front of a reviewer. Gate 7 quotes still appear whitespace-normalised at ${arm === "B" ? quoteB : quoteC}/${quoteN}, matching or beating arm A at ${quoteA}/${quoteN}, and combined wall is ${speed.toFixed(0)}x faster than officeparser.`
    );
    lines.push(
      `The one thing that would stop you is honesty: arms B and C do not emit scanned status, sourceIngestionWarning, or extraction.structure, and a scanned PDF can come back as empty text with no warning.`
    );
    lines.push(
      `Tables are still flattened into prose on every arm. Position data is there if a later spec wants to detect that. It is not detected today.`
    );
  }
  lines.push("");

  lines.push("## S2. Speed");
  lines.push("");
  lines.push("| id | file | wallMs A | wallMs B | wallMs C | A/B |");
  lines.push("|----|------|--------:|--------:|--------:|----:|");
  for (const r of rows) {
    const ratio = r.armB.wallMs > 0 ? (r.armA.wallMs / r.armB.wallMs).toFixed(0) : "n/a";
    lines.push(`| ${r.id} | ${r.filename} | ${r.armA.wallMs} | ${r.armB.wallMs} | ${r.armC.wallMs} | ${ratio}x |`);
  }
  const totRatio = tot.B > 0 ? (tot.A / tot.B).toFixed(0) : "n/a";
  lines.push(`| | **total** | **${tot.A}** | **${tot.B}** | **${tot.C}** | **${totRatio}x** |`);
  lines.push("");
  lines.push("The 21 September 500x figure was officeparser wall (text plus chunks) against a raw-pdfjs probe on a handful of files. B312 text convert on `3i-press-release-fy2025.pdf` was 103,639 ms. This pass, same file, arm A (text convert only, structure flag off) versus arm B:");
  lines.push("");
  for (const r of fourRows) {
    const ratio = r.armB.wallMs > 0 ? (r.armA.wallMs / r.armB.wallMs).toFixed(1) : "n/a";
    lines.push(`- ${r.id} ${r.filename}: A ${r.armA.wallMs} ms, B ${r.armB.wallMs} ms, ${ratio}x. textConvertMs ${r.armA.textConvertMs}.`);
  }
  lines.push("");
  lines.push("396 ms was the stated 21 September pdfjs figure for d01. It is not in a committed artefact. This pass measured arm B on d01 as recorded in the table. Combined A/B on these four is the correction to \"500x\": it is the ratio of officeparser text convert to pdfjs getTextContent, not a second convert.");
  lines.push("");

  lines.push("## S3. Reading order");
  lines.push("");
  lines.push(`Gate 7 quotes (whitespace-normalised substring). Probe set: \`reviews/dNN-review-extract.json\` \`verdictWithQuote.quote\`. n=${quoteN}.`);
  lines.push("");
  lines.push(`- Arm A hits: ${quoteA}/${quoteN}`);
  lines.push(`- Arm B hits: ${quoteB}/${quoteN}${missB.length ? ` misses: ${missB.join(", ")}` : ""}`);
  lines.push(`- Arm C hits: ${quoteC}/${quoteN}${missC.length ? ` misses: ${missC.join(", ")}` : ""}`);
  lines.push("");
  lines.push("A miss means the product could no longer quote that passage from this extract.");
  lines.push("");
  for (const id of ["d03", "d04"]) {
    const r = rows.find((x) => x.id === id);
    if (!r) continue;
    const q = r.quote || "";
    lines.push(`### ${id} ${r.filename}`);
    lines.push("");
    lines.push(`Gate 7 quote: ${JSON.stringify(q)}`);
    lines.push("");
    for (const arm of ["A", "B", "C"]) {
      const hit = r.quoteHits[arm];
      const text = r[`text${arm}`];
      const snip = hit ? snippetAround(text, q, 160) : firstLines(text, 8);
      lines.push(`**Arm ${arm}** hit=${hit}`);
      lines.push("");
      lines.push("```");
      lines.push(mdFence(snip || "(empty)"));
      lines.push("```");
      lines.push("");
    }
  }

  lines.push("## S4. The three flattened-table letters (d10, d11, d12)");
  lines.push("");
  lines.push("Opening region from each arm. The 19 September ruling requires the product to detect a tables-first region. None of these arms emit a table structure. The question is whether any arm makes the table distinguishable from prose.");
  lines.push("");
  for (const id of ["d10", "d11", "d12"]) {
    const r = rows.find((x) => x.id === id);
    if (!r) continue;
    lines.push(`### ${id} ${r.filename}`);
    lines.push("");
    for (const arm of ["A", "B", "C"]) {
      lines.push(`**Arm ${arm}** census five-plus-number lines: ${r.census[arm].linesWithFivePlusNumberTokens}`);
      lines.push("");
      lines.push("```");
      lines.push(mdFence(firstLines(r[`text${arm}`], 16)));
      lines.push("```");
      lines.push("");
    }
  }
  const tableDistinguishable = rows
    .filter((r) => ["d10", "d11", "d12"].includes(r.id))
    .some((r) => r.census.B.linesWithFivePlusNumberTokens === 0 && r.census.A.linesWithFivePlusNumberTokens > 0);
  lines.push(
    tableDistinguishable
      ? "Arm B or C drops the five-plus-number-token lines that arm A still shows. That is not the same as detecting a table. It is a different flattening."
      : "No arm makes the opening table distinguishable from prose. Numbers sit in the same stream as sentences. The census still fires `linesWithFivePlusNumberTokens` on the flatten. Detection is not present."
  );
  lines.push("");

  lines.push("## S5. What position data would fix");
  lines.push("");
  for (const r of rows) {
    const worse = [];
    if (r.charVsA.B.missing === "content") worse.push("B loses content characters versus A");
    if (r.charVsA.C.missing === "content") worse.push("C loses content characters versus A");
    if (r.quote && r.quoteHits.A && !r.quoteHits.B) worse.push("B misses the Gate 7 quote that A keeps");
    if (r.quote && r.quoteHits.A && !r.quoteHits.C) worse.push("C misses the Gate 7 quote that A keeps");
    const aC = r.census.A;
    const bC = r.census.B;
    const cC = r.census.C;
    if (bC.midSentenceHardWraps > aC.midSentenceHardWraps) worse.push("B has more mid-sentence hard wraps");
    if (cC.midSentenceHardWraps > aC.midSentenceHardWraps) worse.push("C has more mid-sentence hard wraps");
    if (bC.linesWithFivePlusNumberTokens > aC.linesWithFivePlusNumberTokens) worse.push("B has more five-plus-number lines");
    if (cC.linesWithFivePlusNumberTokens > aC.linesWithFivePlusNumberTokens) worse.push("C has more five-plus-number lines");
    r._worse = worse;
  }
  const worseRows = rows.filter((r) => r._worse.length);
  if (worseRows.length === 0) {
    lines.push("No arm B/C row is worse than arm A on content-character loss, Gate 7 quote miss, extra hard wraps, or extra flattened-number lines. Remaining gaps are whitespace and the honesty surfaces in S6.");
    lines.push("");
  } else {
    for (const r of worseRows) {
      lines.push(`**${r.id} ${r.filename}.** ${r._worse.join("; ")}.`);
      lines.push("");
    }
  }
  const sampleDoc = rows.find((r) => r.id === "d03") || rows[0];
  const sampleItems = sampleDoc?.positionSample || [];
  lines.push("Worked example. pdfjs `getTextContent` items already carry `transform` (index 4 is x, 5 is y), `width`, `fontName`, and `hasEOL`. Arm C uses only y-band then x. A later pass could use the same fields to mark a row as tabular when several items share a y-band and three or more have digit-heavy `str`, without a new engine.");
  lines.push("");
  if (sampleItems.length) {
    lines.push(`Values from ${sampleDoc.id} page 1, first items:`);
    lines.push("");
    lines.push("| str | x | y | width | fontName | hasEOL |");
    lines.push("|-----|--:|--:|------:|----------|--------|");
    for (const it of sampleItems.slice(0, 8)) {
      lines.push(
        `| ${JSON.stringify(it.str).slice(0, 40)} | ${Number.isFinite(it.x) ? it.x.toFixed(1) : ""} | ${Number.isFinite(it.y) ? it.y.toFixed(1) : ""} | ${it.width ?? ""} | ${it.fontName || ""} | ${it.hasEOL} |`
      );
    }
    lines.push("");
    lines.push("Those x/y pairs are what would close a column-interleave: items with similar y and far-apart x belong to one visual row, not to the naive stream. Arm C already groups that way. It does not then tag the row as a table.");
    lines.push("");
  }

  lines.push("## S6. Honesty surfaces");
  lines.push("");
  lines.push("From C6. What a direct-engine path would have to produce to keep each surface truthful.");
  lines.push("");
  lines.push("- **scanned status (`ok` / `unsupported_scanned`).** Production reads extracted text after stripping officeparser `[Image:...]` placeholders (`meaningfulExtractedCharCount`), then compares to `SCANNED_NEAR_EMPTY_CHARS` 50 (`lib/extract-text-from-source.mjs`). A pdfjs path would have to run the same length test on its own text. It would not see `[Image:]` tokens. Empty text must still stamp `unsupported_scanned`, not `ok`.");
  lines.push("- **computeGuardrailForSource.** Reads the extract string plus `extractedTextLength`, `rawBytesLength`, `fileType`, token probes. Not engine-specific. A direct path keeps this if it still passes the same text and the decoded PDF byte length.");
  lines.push("- **sourceIngestionWarning.** Fires when a PDF extract has `very_low_text` or `empty_text` from `computeExtractionHealth` on that text. Same requirement: do not skip the health object.");
  lines.push("- **extraction.structure.** Built from officeparser chunks metadata (`pageNumber` / `slideNumber` / `sheetName`). Default off since B317. Empty `{pages:[],slides:[],sheets:[]}` is not a failure. A pdfjs path can fill `pages` from `doc.numPages` plus per-page item text. Slides and sheets have no pdfjs equivalent; those stay officeparser for pptx/xlsx.");
  lines.push("");
  if (scanned && !scanned.error) {
    lines.push(
      `Scanned fixture \`${scanned.fixture}\`: arm A chars=${scanned.armA.charCount} status=${scanned.armA.status} warnings=${JSON.stringify(scanned.armA.warnings)}; arm B chars=${scanned.armB.charCount}; arm C chars=${scanned.armC.charCount}.`
    );
    lines.push("");
    if ((scanned.armB.charCount || 0) < 50 && (scanned.armC.charCount || 0) < 50) {
      lines.push("**A scanned PDF returns empty or near-empty text on arms B and C, with no warning field at all.** The diagnostic arms do not stamp `unsupported_scanned`. A product swap that returned this string without the status would look like a successful empty source.");
      lines.push("");
    }
  } else if (scanned?.error) {
    lines.push(`Scanned fixture was not run: ${scanned.error}`);
    lines.push("");
  }

  lines.push("## S7. What this does not settle");
  lines.push("");
  lines.push("- Whether a production Review's matcher scores change. Quotes were probed as substrings, not re-matched.");
  lines.push("- Docx, pptx, xlsx. pdfjs cannot read them. officeparser stays for those types.");
  lines.push("- OCR. Both stacks have OCR off in production.");
  lines.push("- Function payload size if `@napi-rs/canvas` is added or dropped on Linux.");
  lines.push("- A table detector. Position data exists. No arm implements the 19 September detect-and-refuse rule.");
  lines.push("- Upload-time extraction. This pass does not move the convert off the Review request.");
  lines.push("");
  lines.push("## Recommendation");
  lines.push("");
  if (verdictArm === "A") {
    lines.push(
      "Do not swap the production PDF extractor to raw pdfjs on the strength of speed alone. Keep officeparser on the PDF path until a direct-engine extract can show the same Gate 7 quotes, stamp scanned status on empty text, and either detect flattened tables or accept that limitation in the open. Speed is already available; it is not the missing piece."
    );
  } else {
    lines.push(
      `A PDF-only pdfjs path (arm ${verdictArm}) is fast enough and keeps the Gate 7 quotes on this twenty. Do not ship it in this spec. The next spec, if any, is PDF-only, leaves officeparser on docx/pptx/xlsx, and must stamp scanned status on empty text before a reviewer ever sees it. Tables stay flattened until a later detect-and-refuse pass that reads the x/y already on the items.`
    );
  }
  lines.push("");
  lines.push("## Appendix. Characters versus arm A");
  lines.push("");
  lines.push("| id | chars A | chars B | B vs A | B missing | chars C | C vs A | C missing |");
  lines.push("|----|--------:|--------:|-------:|-----------|--------:|-------:|-----------|");
  for (const r of rows) {
    lines.push(
      `| ${r.id} | ${r.armA.charCount} | ${r.armB.charCount} | ${pct(r.charVsA.B.deltaPct)} | ${r.charVsA.B.missing || "-"} | ${r.armC.charCount} | ${pct(r.charVsA.C.deltaPct)} | ${r.charVsA.C.missing || "-"} |`
    );
  }
  lines.push("");
  lines.push("## Appendix. Defect census (B163 code)");
  lines.push("");
  lines.push("| id | arm | hard wraps | 5+ number lines | repeating lines | lone 1-3 digit |");
  lines.push("|----|-----|----------:|----------------:|----------------:|---------------:|");
  for (const r of rows) {
    for (const arm of ["A", "B", "C"]) {
      const c = r.census[arm];
      lines.push(`| ${r.id} | ${arm} | ${c.midSentenceHardWraps} | ${c.linesWithFivePlusNumberTokens} | ${c.linesRepeatingThreePlus} | ${c.lone1to3DigitLines} |`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const manifest = JSON.parse(await readFile(path.join(B163, "manifest.json"), "utf8"));
  const docs = Array.isArray(manifest.documents) ? manifest.documents : [];
  if (docs.length !== 20) {
    throw new Error(`expected 20 B163 documents, got ${docs.length}`);
  }
  const quotes = await loadQuotes();
  const rows = [];

  for (const doc of docs) {
    const filename = doc.filename;
    const id = doc.id;
    const filePath = path.join(CORPUS, filename);
    console.log(`bakeoff ${id} ${filename}`);
    const buf = await readFile(filePath);
    if (buf.length !== doc.rawBytes) {
      throw new Error(`${id} byte length ${buf.length} != manifest ${doc.rawBytes}; refusing to substitute`);
    }

    const a = await armA(buf);
    const tB0 = Date.now();
    const pages = await loadPdfjsPages(buf);
    const pdfjsLoadMs = Date.now() - tB0;
    const tB1 = Date.now();
    const textB = armBText(pages);
    const assembleB = Date.now() - tB1;
    const tC1 = Date.now();
    const textC = armCText(pages);
    const assembleC = Date.now() - tC1;

    const quoteInfo = quotes.get(id) || { quote: "", statement: "", file: null };
    const quote = quoteInfo.quote;
    const hits = {
      A: quoteHit(a.text, quote),
      B: quoteHit(textB, quote),
      C: quoteHit(textC, quote),
    };

    const row = {
      id,
      filename,
      rawBytes: buf.length,
      pageCount: doc.pageCount,
      quote,
      quoteFile: quoteInfo.file,
      quoteHits: hits,
      armA: {
        wallMs: a.wallMs,
        charCount: a.charCount,
        textConvertMs: a.textConvertMs,
        chunkConvertMs: a.chunkConvertMs,
        status: a.status,
        warnings: a.warnings,
      },
      armB: { wallMs: pdfjsLoadMs + assembleB, loadMs: pdfjsLoadMs, assembleMs: assembleB, charCount: textB.length },
      armC: { wallMs: pdfjsLoadMs + assembleC, loadMs: pdfjsLoadMs, assembleMs: assembleC, charCount: textC.length },
      charVsA: { B: missingKind(a.text, textB), C: missingKind(a.text, textC) },
      census: {
        A: censusSlice(defectScan(a.text)),
        B: censusSlice(defectScan(textB)),
        C: censusSlice(defectScan(textC)),
      },
      positionSample: (pages[0]?.items || []).slice(0, 12),
      textA: a.text,
      textB,
      textC,
    };
    rows.push(row);
    await writeFile(path.join(OUT, `${id}-A.txt`), a.text, "utf8");
    await writeFile(path.join(OUT, `${id}-B.txt`), textB, "utf8");
    await writeFile(path.join(OUT, `${id}-C.txt`), textC, "utf8");
    console.log(
      `  A ${a.wallMs}ms chars=${a.charCount}  B ${row.armB.wallMs}ms chars=${textB.length}  C ${row.armC.wallMs}ms chars=${textC.length} quote A/B/C ${hits.A}/${hits.B}/${hits.C}`
    );
  }

  console.log("scanned fixture");
  const scanned = await maybeScanned();
  const slimRows = rows.map(({ textA, textB, textC, ...rest }) => rest);
  await writeFile(
    path.join(OUT, "summary.json"),
    JSON.stringify({ ranAt: new Date().toISOString(), scanned, rows: slimRows }, null, 2)
  );

  const report = buildReport(manifest, rows, scanned, quotes);
  await writeFile(path.join(ROOT, "REPORT.md"), report, "utf8");
  console.log(`done docs=${rows.length} wrote REPORT.md`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
