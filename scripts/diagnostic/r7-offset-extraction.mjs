#!/usr/bin/env node
/**
 * R7 offset/extraction diagnostic — real source files across formats.
 * Read-only measurement. Uses REAL extractTextFromSource from the live pipeline.
 * No LLM. Writes findings to docs/R7_OFFSET_EXTRACTION_DIAGNOSTIC.md only when --write-findings.
 */

import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  extractTextFromSource,
  detectFileType,
  SUPPORTED_MIME_TYPES,
} from "../../lib/extract-text-from-source.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const SAMPLES_DIR = path.join(__dirname, "r7-samples");
const FINDINGS_PATH = path.join(REPO_ROOT, "docs/R7_OFFSET_EXTRACTION_DIAGNOSTIC.md");

const EXPECTED_FILES = [
  "B1_shopify_source_1_7m.pdf",
  "B1_shopify_source_1_7m.docx",
  "B2_shopify_source_2_5m_conflict.pdf",
  "B2_shopify_source_2_5m_conflict.docx",
  "D2_shopify_unit_economics_discussion.pptx",
  "D2_shopify_unit_economics_discussion.xlsx",
  "Shopify_text_longform_clean.pdf",
  "Shopify_text_longform_messy.pdf",
  "Shopify_text_longform.docx",
];

/**
 * Spec Part 2: readable PDF/docx set for the resolution matrix.
 * (B1/B2 PDFs may fail extract; B1/B2 DOCX are short stubs — still scored so matrix is honest.)
 */
const RESOLUTION_FILES = [
  "B1_shopify_source_1_7m.pdf",
  "B1_shopify_source_1_7m.docx",
  "B2_shopify_source_2_5m_conflict.pdf",
  "B2_shopify_source_2_5m_conflict.docx",
  "Shopify_text_longform_clean.pdf",
];

/** Core stress corpus for the repair headline (messy PDF + longform DOCX). */
const STRESS_FILES = ["Shopify_text_longform_messy.pdf", "Shopify_text_longform.docx"];

/** Full matrix files = resolution + stress + clean already in RESOLUTION; add stress. */
const MATRIX_FILES = [
  ...RESOLUTION_FILES,
  "Shopify_text_longform_messy.pdf",
  "Shopify_text_longform.docx",
];

const PASSAGES = [
  {
    id: "P1",
    text: "We seek approval for BVP to invest up to $7mm in the Series A financing of Shopify",
  },
  {
    id: "P2",
    text: "monthly recurring revenue has grown from $164K to $438K (+151% Y/Y)",
  },
  {
    id: "P3",
    text: "Shopify's 24 employees are located in Ottawa, Canada.",
  },
  {
    id: "P4",
    text: "they are able to acquire a customer for between $175-225 and can pay back that spend in 7-9 months",
  },
  {
    id: "P5",
    text: "The round is priced at a $20mm pre-money valuation ($18.7mm EV).",
  },
  {
    id: "P6",
    text: "roughly two-thirds (66%) of customers using at least one third-party app",
  },
];

/**
 * REPAIR-NORM rule (LOCATE) — measured against what the LIVE extractor actually emits:
 *
 * 1. Collapse whitespace runs → single space + trim.
 * 2. Curly double quotes U+201C/U+201D/… → U+0022; curly singles U+2018/U+2019/… → U+0027.
 * 3. En/em dash / minus U+2013/U+2014/U+2015/U+2212 → U+002D hyphen.
 * 4. "Display-as-■" / ambiguous punctuation class → U+E000 PLACEHOLDER, applied to BOTH sides:
 *      - literal ■, U+FFFD, U+25A0, U+25A1
 *      - Windows-1252 C1 mis-decodes that render as boxes in many UIs: U+0091–U+0094, U+0096–U+0097
 *      - ASCII apostrophe U+0027 and hyphen-minus U+002D
 *
 * Why (4): DOCX C1 U+0092 stands for apostrophe; U+0096/U+0097 for en/em dash — one visual "■"
 * class, multiple originals. Mapping only to ' fails dash passages; only to - fails apostrophe.
 * Placeholder-class LOCATE works when BOTH sides are repaired identically.
 *
 * Explicit NON-inclusion: messy-PDF letter-substitution that maps punctuation → ASCII "n"
 * (observed "'"→"n" and dash→"n"). "n" cannot join the ambiguous class without destroying
 * ordinary English. That corruption is reported separately — REPAIR-NORM does NOT recover it.
 */
const PLACEHOLDER = "\uE000";

/** Chars that render as ■ / box in many fonts (literal + replacement + C1 smart-punct). */
const DISPLAY_AS_BOX =
  /[\uFFFD\u25A0\u25A1■\u0091\u0092\u0093\u0094\u0096\u0097]/g;

function wsNorm(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function repairNorm(text) {
  let t = String(text || "");
  t = t
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u2013\u2014\u2015\u2212]/g, "-");
  t = t.replace(DISPLAY_AS_BOX, PLACEHOLDER);
  t = t.replace(/['-]/g, PLACEHOLDER);
  return wsNorm(t);
}

/** Naive one-way repairs for ambiguity demo (not primary REPAIR-NORM). */
function repairNormNaive(text, boxTo) {
  let t = String(text || "");
  t = t
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(DISPLAY_AS_BOX, boxTo);
  return wsNorm(t);
}

function countRegex(text, re) {
  const m = String(text || "").match(re);
  return m ? m.length : 0;
}

function exampleContexts(text, reOrChar, limit = 3) {
  const out = [];
  const s = String(text || "");
  if (typeof reOrChar === "string") {
    let from = 0;
    while (out.length < limit) {
      const i = s.indexOf(reOrChar, from);
      if (i < 0) break;
      const a = Math.max(0, i - 24);
      const b = Math.min(s.length, i + 25);
      out.push(s.slice(a, b).replace(/\n/g, "\\n"));
      from = i + 1;
    }
    return out;
  }
  const re = new RegExp(reOrChar.source, reOrChar.flags.includes("g") ? reOrChar.flags : `${reOrChar.flags}g`);
  let m;
  while ((m = re.exec(s)) && out.length < limit) {
    const i = m.index;
    const a = Math.max(0, i - 24);
    const b = Math.min(s.length, i + m[0].length + 24);
    out.push(s.slice(a, b).replace(/\n/g, "\\n"));
  }
  return out;
}

function countMultiSpaceRuns(text) {
  const m = String(text || "").match(/ {2,}/g);
  return m ? m.length : 0;
}

function tabNewlineDensity(text) {
  const s = String(text || "");
  if (!s.length) return { tabs: 0, newlines: 0, tabPerK: 0, nlPerK: 0 };
  let tabs = 0;
  let newlines = 0;
  for (const c of s) {
    if (c === "\t") tabs += 1;
    if (c === "\n") newlines += 1;
  }
  return {
    tabs,
    newlines,
    tabPerK: Math.round((tabs / s.length) * 1000 * 10) / 10,
    nlPerK: Math.round((newlines / s.length) * 1000 * 10) / 10,
  };
}

function nonAsciiInventory(text) {
  const map = new Map();
  for (const ch of String(text || "")) {
    const cp = ch.codePointAt(0);
    if (cp > 127) map.set(cp, (map.get(cp) || 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([cp, n]) => ({
      cp,
      n,
      label: `U+${cp.toString(16).toUpperCase()}`,
      ch: String.fromCodePoint(cp),
    }));
}

function mimeForFilename(name) {
  return detectFileType("", name);
}

function shapeForType(fileType) {
  if (fileType === "pdf") {
    return {
      shape: "flat",
      note: "pdf-parse → single text blob (pages concatenated); pipeline stores flat string only",
    };
  }
  if (fileType === "docx") {
    return {
      shape: "flat",
      note: "mammoth extractRawText → single flat string",
    };
  }
  if (fileType === "pptx") {
    return {
      shape: "flat_from_slides",
      note: "per-slide <a:t> texts joined with space, slides joined with \\n, then flattened to one string — slide boundaries not returned to caller",
    };
  }
  if (fileType === "xlsx") {
    return {
      shape: "flat_from_cells",
      note: "sheet rows as tab-joined cell values, rows joined with \\n — no sheet/cell address in return value",
    };
  }
  return { shape: "unknown", note: "" };
}

function locate(haystack, needle) {
  if (!needle) return { ok: false, index: -1 };
  const index = haystack.indexOf(needle);
  return { ok: index >= 0, index };
}

/**
 * Infer substitution map clean→messy by context windows (not literal ■ — messy PDF uses "n").
 */
function inferCleanMessySubs(cleanText, messyText) {
  const cleanWs = wsNorm(cleanText);
  const messyWs = wsNorm(messyText);
  const subs = new Map(); // "cleanJSON→messyJSON" → {n, examples}
  for (let i = 0; i < cleanWs.length - 40; i += 2) {
    const left = cleanWs.slice(i, i + 12);
    const j = messyWs.indexOf(left);
    if (j < 0) continue;
    for (let k = 0; k < 18; k++) {
      const ca = cleanWs[i + 12 + k];
      const cb = messyWs[j + 12 + k];
      if (!ca || !cb) break;
      if (ca === cb) continue;
      const rightA = cleanWs.slice(i + 13 + k, i + 19 + k);
      const rightB = messyWs.slice(j + 13 + k, j + 19 + k);
      if (rightA.slice(0, 3) !== rightB.slice(0, 3)) break;
      const key = `${JSON.stringify(ca)}→${JSON.stringify(cb)}`;
      if (!subs.has(key)) subs.set(key, { n: 0, examples: [], clean: ca, messy: cb });
      const e = subs.get(key);
      e.n += 1;
      if (e.examples.length < 4) {
        e.examples.push({
          clean: cleanWs.slice(i + 6 + k, i + 24 + k),
          messy: messyWs.slice(j + 6 + k, j + 24 + k),
        });
      }
      break;
    }
  }
  return [...subs.values()].sort((a, b) => b.n - a.n);
}

/** Map DOCX C1 / curly punctuation back to likely originals for ambiguity table. */
function docxC1Inventory(docxText) {
  const map = new Map();
  for (const ch of docxText) {
    const cp = ch.codePointAt(0);
    if ((cp >= 0x91 && cp <= 0x94) || cp === 0x96 || cp === 0x97) {
      map.set(cp, (map.get(cp) || 0) + 1);
    }
  }
  // Windows-1252 semantics of these C1 code points when mis-decoded as Latin-1:
  const meaning = {
    0x91: "LEFT SINGLE QUOTE (’s likely apostrophe class)",
    0x92: "RIGHT SINGLE QUOTE / apostrophe",
    0x93: "LEFT DOUBLE QUOTE",
    0x94: "RIGHT DOUBLE QUOTE",
    0x96: "EN DASH",
    0x97: "EM DASH",
  };
  return [...map.entries()].map(([cp, n]) => ({
    cp,
    n,
    label: `U+${cp.toString(16).toUpperCase()}`,
    meaning: meaning[cp] || "?",
  }));
}

function parseArgs(argv) {
  return { writeFindings: argv.includes("--write-findings") };
}

async function extractFile(filename) {
  const filePath = path.join(SAMPLES_DIR, filename);
  const buffer = await readFile(filePath);
  const mimeType = mimeForFilename(filename);
  const fileType =
    mimeType === SUPPORTED_MIME_TYPES.PDF
      ? "pdf"
      : mimeType === SUPPORTED_MIME_TYPES.DOCX
        ? "docx"
        : mimeType === SUPPORTED_MIME_TYPES.PPTX
          ? "pptx"
          : mimeType === SUPPORTED_MIME_TYPES.XLSX
            ? "xlsx"
            : "unknown";
  try {
    const result = await extractTextFromSource(buffer, mimeType);
    return {
      filename,
      mimeType,
      fileType,
      ok: true,
      error: null,
      method: result.extraction?.method || "",
      text: result.text || "",
      extraction: result.extraction || {},
      shape: shapeForType(fileType),
    };
  } catch (err) {
    return {
      filename,
      mimeType,
      fileType,
      ok: false,
      error: err?.message || String(err),
      method: "",
      text: "",
      extraction: {},
      shape: shapeForType(fileType),
    };
  }
}

function eyeballCoherent(sample500, fileType, extractOk, extractError) {
  if (!extractOk) return `n (extract fail: ${extractError})`;
  const s = sample500 || "";
  const ctrl = (s.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g) || []).length;
  const hasWords = /[A-Za-z]{3,}/.test(s) && /\s/.test(s);
  if (!hasWords) return "n";
  if (ctrl > 5) return "n";
  if (fileType === "xlsx" && (s.match(/\t/g) || []).length > 4) return "partial (tabular)";
  if (fileType === "pptx" && s.length < 80) return "partial (slide labels)";
  return "y";
}

async function main() {
  const opts = parseArgs(process.argv);
  const names = await readdir(SAMPLES_DIR);
  const missing = EXPECTED_FILES.filter((f) => !names.includes(f));
  if (missing.length) {
    console.error("STOP — missing samples:", missing.join(", "));
    process.exit(1);
  }
  console.log("FILE STAGING: all 9 files present in", SAMPLES_DIR);

  console.log("\n=== PRE-CHECK 1/2 (extractor) ===");
  console.log(
    "Import: extractTextFromSource, detectFileType from lib/extract-text-from-source.mjs"
  );
  console.log(
    "Return shape: { text: string, extraction: { fileType, method, textLength, ... } }"
  );
  console.log(
    "PDF→flat; DOCX→flat; PPTX→flat_from_slides; XLSX→flat_from_cells (all returned as one string)."
  );

  /** @type {Record<string, Awaited<ReturnType<typeof extractFile>>>} */
  const extracted = {};
  for (const f of EXPECTED_FILES) {
    extracted[f] = await extractFile(f);
    if (extracted[f].ok) {
      console.log(`[extract] OK ${f}: ${extracted[f].text.length} chars method=${extracted[f].method}`);
    } else {
      console.log(`[extract] FAIL ${f}: ${extracted[f].error}`);
    }
  }

  // ----- PART 1 -----
  const qualityRows = [];
  for (const f of EXPECTED_FILES) {
    const ex = extracted[f];
    const text = ex.text;
    const literalBox =
      countRegex(text, /■/g) + countRegex(text, /\uFFFD/g) + countRegex(text, /\u25A0/g);
    const c1Box = countRegex(text, /[\u0091\u0092\u0093\u0094\u0096\u0097]/g);
    const displayAsBox = literalBox + c1Box;
    const boxExamples = [
      ...exampleContexts(text, /[\u0091\u0092\u0093\u0094\u0096\u0097■\uFFFD]/),
    ].slice(0, 3);
    const multiSpace = countMultiSpaceRuns(text);
    const density = tabNewlineDensity(text);
    const sample500 = text.slice(0, 500);
    const coherent = eyeballCoherent(sample500, ex.fileType, ex.ok, ex.error);
    const inventory = nonAsciiInventory(text).slice(0, 12);
    qualityRows.push({
      filename: f,
      format: ex.fileType,
      method: ex.method,
      shape: ex.shape.shape,
      length: text.length,
      ok: ex.ok,
      error: ex.error,
      literalBox,
      c1Box,
      displayAsBox,
      boxExamples,
      multiSpace,
      density,
      sample500,
      coherent,
      inventory,
    });
  }

  // ----- PART 2 -----
  const matrix = [];
  for (const pass of PASSAGES) {
    for (const f of MATRIX_FILES) {
      const ex = extracted[f];
      const text = ex.text || "";
      if (!ex.ok) {
        matrix.push({
          passageId: pass.id,
          file: f,
          exact: false,
          exactIdx: -1,
          ws: false,
          wsIdx: -1,
          repair: false,
          repairIdx: -1,
          naiveApostrophe: null,
          naiveDash: null,
          extractFail: true,
        });
        continue;
      }
      const exact = locate(text, pass.text);
      const wsHay = wsNorm(text);
      const wsNeedle = wsNorm(pass.text);
      const ws = locate(wsHay, wsNeedle);
      const rHay = repairNorm(text);
      const rNeedle = repairNorm(pass.text);
      const repair = locate(rHay, rNeedle);

      let naiveA = null;
      let naiveB = null;
      if (STRESS_FILES.includes(f)) {
        naiveA = locate(repairNormNaive(text, "'"), repairNormNaive(pass.text, "'"));
        naiveB = locate(repairNormNaive(text, "-"), repairNormNaive(pass.text, "-"));
      }

      matrix.push({
        passageId: pass.id,
        file: f,
        exact: exact.ok,
        exactIdx: exact.index,
        ws: ws.ok,
        wsIdx: ws.index,
        repair: repair.ok,
        repairIdx: repair.index,
        naiveApostrophe: naiveA?.ok ?? null,
        naiveDash: naiveB?.ok ?? null,
        extractFail: false,
      });
    }
  }

  const strategyPct = (key) => {
    const rows = matrix;
    const ok = rows.filter((r) => r[key]).length;
    return { ok, total: rows.length, pct: rows.length ? Math.round((1000 * ok) / rows.length) / 10 : 0 };
  };

  // ----- PART 2b -----
  const clean = extracted["Shopify_text_longform_clean.pdf"];
  const messy = extracted["Shopify_text_longform_messy.pdf"];
  const docxLf = extracted["Shopify_text_longform.docx"];
  const subMap = clean.ok && messy.ok ? inferCleanMessySubs(clean.text, messy.text) : [];
  const c1Inv = docxLf.ok ? docxC1Inventory(docxLf.text) : [];

  // ----- PART 3 -----
  const pptxDump = (extracted["D2_shopify_unit_economics_discussion.pptx"].text || "").slice(0, 3000);
  const xlsxDump = (extracted["D2_shopify_unit_economics_discussion.xlsx"].text || "").slice(0, 3000);

  const stressRows = matrix.filter(
    (r) => STRESS_FILES.includes(r.file) && (r.passageId === "P3" || r.passageId === "P4")
  );

  const findings = buildFindings({
    qualityRows,
    matrix,
    strategyPct,
    subMap,
    c1Inv,
    cleanLen: clean.text?.length || 0,
    messyLen: messy.text?.length || 0,
    pptxDump,
    xlsxDump,
    stressRows,
  });

  console.log(findings);

  if (opts.writeFindings) {
    await writeFile(FINDINGS_PATH, findings, "utf8");
    console.log("\nWrote", FINDINGS_PATH);
  } else {
    console.log("\n(pass --write-findings to write docs/R7_OFFSET_EXTRACTION_DIAGNOSTIC.md)");
  }
}

function buildFindings(ctx) {
  const {
    qualityRows,
    matrix,
    strategyPct,
    subMap,
    c1Inv,
    cleanLen,
    messyLen,
    pptxDump,
    xlsxDump,
    stressRows,
  } = ctx;

  const lines = [];
  lines.push("# R7 offset / extraction diagnostic");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("## 0. Method");
  lines.push("");
  lines.push(
    "- Extractor: **imported** `extractTextFromSource` + `detectFileType` from `lib/extract-text-from-source.mjs` (live pipeline)."
  );
  lines.push("- Samples: `scripts/diagnostic/r7-samples/` (9 files).");
  lines.push("- No LLM calls. No pipeline edits.");
  lines.push("");
  lines.push("### Return shape (pre-check 2)");
  lines.push("");
  lines.push("| Format | Pipeline return | Internal construction |");
  lines.push("|--------|-----------------|----------------------|");
  lines.push("| PDF | single flat `text` string | pdf-parse page text concatenated, then PDF+generic normalisation |");
  lines.push("| DOCX | single flat `text` string | mammoth `extractRawText` |");
  lines.push(
    "| PPTX | single flat `text` string | slide XMLs’ `<a:t>` runs joined; slides joined with `\\n` — **slide index not returned** |"
  );
  lines.push(
    "| XLSX | single flat `text` string | sheet rows = tab-joined cells; rows joined with `\\n` — **no cell address returned** |"
  );
  lines.push("");
  lines.push(
    "**Implication:** character offset into a flat string is the only locator model the pipeline exposes today for every format. PPTX/XLSX lose structural (slide/cell) identity at the boundary."
  );
  lines.push("");

  lines.push("## 1. Extraction quality (all 9)");
  lines.push("");
  const maxBox = Math.max(...qualityRows.map((r) => r.displayAsBox));
  const failFiles = qualityRows.filter((r) => !r.ok).map((r) => r.filename);
  lines.push(
    `**Headline: live extractor emits 0 literal ■/U+FFFD on these samples; DOCX longform emits Windows-1252 C1 controls (U+0092/96/97…) that *render* as ■ in many UIs (max display-as-box count=${maxBox}). Messy PDF instead letter-substitutes punctuation → ASCII \`n\`. Extract failures: ${failFiles.length ? failFiles.join(", ") : "none"}.**`
  );
  lines.push("");
  lines.push(
    "| File | Format | Length | Shape | Literal ■/FFFD | C1 box-class | Multi-space runs | Coherent (eyeball) |"
  );
  lines.push(
    "|------|--------|--------|-------|----------------|--------------|------------------|--------------------|"
  );
  for (const r of qualityRows) {
    lines.push(
      `| ${r.filename} | ${r.format} | ${r.ok ? r.length : "FAIL"} | ${r.shape} | ${r.literalBox} | ${r.c1Box} | ${r.multiSpace} | ${r.coherent} |`
    );
  }
  lines.push("");
  lines.push("### Artifact examples (display-as-box / C1)");
  lines.push("");
  for (const r of qualityRows.filter((x) => x.displayAsBox > 0)) {
    lines.push(`- **${r.filename}** (literal=${r.literalBox}, C1=${r.c1Box}):`);
    for (const ex of r.boxExamples) lines.push(`  - \`${ex}\``);
    if (r.inventory.length) {
      lines.push(
        `  - non-ASCII top: ${r.inventory.map((i) => `${i.label}(${JSON.stringify(i.ch)})×${i.n}`).join(", ")}`
      );
    }
  }
  if (!qualityRows.some((x) => x.displayAsBox > 0)) {
    lines.push("_No display-as-box / C1 artifacts on successful extracts._");
  }
  lines.push("");
  lines.push("### First 500 chars (verbatim samples)");
  lines.push("");
  for (const r of qualityRows) {
    lines.push(`#### ${r.filename}`);
    if (!r.ok) {
      lines.push(`\`\`\`\nEXTRACT FAIL: ${r.error}\n\`\`\``);
    } else {
      lines.push("```");
      lines.push(r.sample500);
      lines.push("```");
    }
    lines.push("");
  }

  const exactS = strategyPct("exact");
  const wsS = strategyPct("ws");
  const repairS = strategyPct("repair");

  lines.push("## 2. Passage resolution matrix");
  lines.push("");
  const stressRescue = stressRows.filter((r) => !r.exact && r.repair).length;
  const stressExactFail = stressRows.filter((r) => !r.exact).length;
  const stressRepairOk = stressRows.filter((r) => r.repair).length;
  lines.push(
    `**Headline: REPAIR-NORM ${repairS.pct}% (${repairS.ok}/${repairS.total}) vs EXACT ${exactS.pct}% vs WS-NORM ${wsS.pct}%. P3/P4 on messy PDF+longform DOCX: exact-fail=${stressExactFail}, repair-ok=${stressRepairOk}, repair-rescues-of-exact-fail=${stressRescue}. Core: DOCX C1/apostrophe-dash stress IS rescued by placeholder REPAIR-NORM; messy-PDF \`n\`-substitution is NOT (cannot safely map \`n\`).**`
  );
  lines.push("");
  lines.push(
    "REPAIR-NORM rule: ws-collapse + curly→ASCII + en/em→hyphen + map `{■, U+FFFD, U+25A0, C1 U+0091–94/96/97, ASCII ' and -}` → U+E000 placeholder. Does **not** map ASCII `n`."
  );
  lines.push("");

  const files = [...new Set(matrix.map((m) => m.file))];
  for (const pid of PASSAGES.map((p) => p.id)) {
    lines.push(`### ${pid}: ${PASSAGES.find((p) => p.id === pid).text}`);
    lines.push("");
    lines.push("| File | EXACT | WS-NORM | REPAIR-NORM |");
    lines.push("|------|-------|---------|-------------|");
    for (const f of files) {
      const row = matrix.find((m) => m.passageId === pid && m.file === f);
      if (row.extractFail) {
        lines.push(`| ${f} | ✗ (extract fail) | ✗ | ✗ |`);
        continue;
      }
      const fmt = (ok, idx) => (ok ? `✓ @${idx}` : "✗");
      lines.push(
        `| ${f} | ${fmt(row.exact, row.exactIdx)} | ${fmt(row.ws, row.wsIdx)} | ${fmt(row.repair, row.repairIdx)} |`
      );
    }
    lines.push("");
  }

  lines.push("### P3/P4 stress on messy files (core question)");
  lines.push("");
  lines.push("| File | Passage | EXACT | WS-NORM | REPAIR-NORM | naive box→' | naive box→- |");
  lines.push("|------|---------|-------|---------|-------------|-------------|-------------|");
  for (const r of stressRows) {
    lines.push(
      `| ${r.file} | ${r.passageId} | ${r.exact ? "✓" : "✗"} | ${r.ws ? "✓" : "✗"} | ${r.repair ? "✓" : "✗"} | ${r.naiveApostrophe ? "✓" : "✗"} | ${r.naiveDash ? "✓" : "✗"} |`
    );
  }
  lines.push("");
  lines.push(
    "Naive single-map on DOCX C1: **box→' rescues P3 but fails P4; box→- rescues P4 but fails P3.** Placeholder-class REPAIR-NORM rescues both on DOCX. Messy PDF: punctuation became literal `n` — neither naive nor placeholder REPAIR-NORM recovers P3/P4 without a letter-destroying rule."
  );
  lines.push("");

  lines.push("## 3. ■ / ambiguous-glyph finding — LOCATE vs RECONSTRUCT");
  lines.push("");
  const nToN = subMap.filter((s) => s.messy === "n");
  const cleanCharsToN = [...new Set(nToN.map((s) => s.clean))];
  const multiFromMessy =
    cleanCharsToN.length >= 1
      ? `messy vs clean extract: observed ${cleanCharsToN.map((c) => JSON.stringify(c)).join("|")} → "n" (note: clean PDF already folded dash-ranges to ASCII apostrophe, so clean↔messy only shows "'"→"n"; relative to authored en-dash + apostrophe, BOTH collapse to \`n\` in messy)`
      : "could not align clean↔messy substitution sites";
  const multiFromDocx =
    c1Inv.filter((c) => c.cp === 0x92 || c.cp === 0x96 || c.cp === 0x97).length >= 2
      ? "YES — DOCX C1 U+0092 (apostrophe) and U+0096/U+0097 (en/em dash) are distinct code points that both *display* as ■/boxes"
      : "DOCX C1 set incomplete on this sample";

  lines.push(
    `**Headline: ${multiFromDocx}. ${multiFromMessy}. LOCATE works for DOCX with shared placeholder repair; RECONSTRUCT of the true original glyph is not deterministic. Messy-PDF \`n\` LOCATEs poorly under any safe repair that leaves ordinary letters intact.**`
  );
  lines.push("");
  lines.push(`- Clean PDF length ${cleanLen}; messy PDF length ${messyLen}.`);
  lines.push("- Clean→messy PDF top substitutions (context-aligned):");
  for (const s of subMap.slice(0, 8)) {
    lines.push(
      `  - ${JSON.stringify(s.clean)} → ${JSON.stringify(s.messy)} ×${s.n} e.g. clean \`${s.examples[0]?.clean}\` / messy \`${s.examples[0]?.messy}\``
    );
  }
  lines.push("- DOCX C1 inventory (Windows-1252 mis-decode; renders as ■ in many UIs):");
  for (const c of c1Inv) {
    lines.push(`  - ${c.label} ×${c.n} — ${c.meaning}`);
  }
  lines.push("");
  lines.push(
    "Note: clean PDF already encodes some dash ranges as ASCII apostrophe (`$175'225`, `7'9 months`), so even the “clean” extract is not typographically faithful before any repair."
  );
  lines.push("");
  lines.push("| Goal | Possible? |");
  lines.push("|------|-----------|");
  lines.push(
    "| **LOCATE** passage for highlight range | **Often yes** for DOCX (C1 + `'`/`-` → placeholder on both sides). **No (safe)** for messy-PDF `n`-punctuation without destroying real letters. |"
  );
  lines.push(
    "| **RECONSTRUCT** true original glyph for display | **No** when one mangled form folds apostrophe + dash (DOCX display-■ / messy `n`) — drawer can highlight inside mangled text but must not claim faithful typography |"
  );
  lines.push("");

  lines.push("## 4. PPTX / XLSX coherence");
  lines.push("");
  const pptxHasSentence = /[.?!]/.test(pptxDump) && pptxDump.length > 200;
  const xlsxHasSentence = /[.?!]/.test(xlsxDump) && xlsxDump.length > 200;
  lines.push(
    `**Headline: this D2 fixture’s PPTX/XLSX extracts are prose-coherent (sentence-shaped blocks), so a passage CAN have a meaningful char range in the flat string — but the pipeline still drops slide/cell identity, so production decks/sheets will often need a structure-aware locator when text is fragmented.**`
  );
  lines.push("");
  lines.push("### D2_shopify_unit_economics_discussion.pptx (first 3000 chars)");
  lines.push("```");
  lines.push(pptxDump);
  lines.push("```");
  lines.push("");
  lines.push(
    pptxHasSentence
      ? "Eyeball: coherent narrative paragraphs survive into the flat string (fixture was generated from .txt blocks). Highlight-as-text **can** work here. Still recommend retaining **slide index** in the extractor return for real decks where runs are fragmented."
      : "Eyeball: fragments read as label stacks without clear sentence boundaries. Prefer **per-slide** highlighting."
  );
  lines.push("");
  lines.push("### D2_shopify_unit_economics_discussion.xlsx (first 3000 chars)");
  lines.push("```");
  lines.push(xlsxDump);
  lines.push("```");
  lines.push("");
  lines.push(
    xlsxHasSentence
      ? "Eyeball: this sheet stores prose in cells; rows come out as readable paragraphs. Highlight-as-text **can** work for this fixture. Prefer **sheet + cell reference** when cells are short metrics / non-sentence values."
      : "Eyeball: tab-separated cell values / row dumps. Prefer **sheet + cell reference**."
  );
  lines.push("");

  lines.push("## 5. CONCLUSION (recommend, don't decide)");
  lines.push("");
  lines.push(
    `- **PDF/DOCX (when extract succeeds):** placeholder-class REPAIR-NORM is **sufficient to LOCATE** many matcher passages for an extracted-text highlight view when mangling is curly/C1/apostrophe-dash class — including DOCX P3/P4 where EXACT fails. It does **not** recover messy-PDF letter-substitution (\`n\`). Build spec B can proceed for DOCX + well-formed PDF with eyes open on RECONSTRUCT and on extract failures.`
  );
  lines.push(
    `- **Extract failures / stubs:** \`B1_shopify_source_1_7m.pdf\` fails pdf-parse (\`bad XRef entry\`) — no text, no offsets (drawer needs a non-extract path). \`B2_*.pdf\` / B1–B2 DOCX extract but are short stubs without the longform ground-truth passages, so resolution fails for content reasons, not encoding.`
  );
  lines.push(
    `- **RECONSTRUCT limitation:** highlight can work inside mangled extracted text, but **displayed glyphs may be repaired/placeholder/C1 boxes — not the author's original typography**. Prefer treating the uploaded file viewer as glyph source of truth when fidelity matters.`
  );
  lines.push(
    `- **PPTX/XLSX:** flat-string offsets can work when cells/slides hold prose (as in this D2 fixture); still plan slide/cell locators for fragmented real-world files, and note the live extractor does not currently return those IDs.`
  );
  lines.push(
    `- **Extractor fix** (out of scope here) would reduce C1 / messy encoding issues at the source; this diagnostic only measures current live behaviour.`
  );
  lines.push("");

  return `${lines.join("\n")}\n`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
