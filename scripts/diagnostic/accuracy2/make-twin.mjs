#!/usr/bin/env node
/**
 * Deterministic clean twins of the two ugly corpus 2 extracts. No LLM.
 *
 *   node scripts/diagnostic/accuracy2/make-twin.mjs
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_SOURCES_DIR = path.join(__dirname, "sources");
export const DEFAULT_RULES_PATH = path.join(__dirname, "sources/twin-rules.json");

export const TWIN_SPECS = [
  {
    inputName: "press-release-fy25-highlights.txt",
    outputName: "press-release-fy25-highlights.clean.txt",
    documentTitle: "Kelvedge Group plc announces results for the year",
    kind: "press",
  },
  {
    inputName: "fund-factsheet-march-2026.txt",
    outputName: "fund-factsheet-march-2026.clean.txt",
    documentTitle: "Cravenford Private Investments Fund",
    kind: "factsheet",
  },
];

const MONTHS =
  "January|February|March|April|May|June|July|August|September|October|November|December";

const OBJECTIVE_WORDS = [
  "Investment",
  "objective",
  "Seek",
  "to",
  "generate",
  "capital",
  "growth",
  "over",
  "the",
  "long-term",
  "long",
  "term",
];

const SPLIT_WORDS = [
  [/S hare/g, "Share"],
  [/Y ear/g, "Year"],
  [/V intage/g, "Vintage"],
  [/T erm/g, "Term"],
  [/Repu rchases/g, "Repurchases"],
];

function runningAsMain() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(path.resolve(entry)).href;
  } catch {
    return false;
  }
}

export function isImageMarker(line) {
  return /^\[Image:/i.test(String(line).trim());
}

export function isStandalonePageNumber(line) {
  return /^\d+$/.test(String(line).trim());
}

export function isLetterSpacedLine(line) {
  const tokens = String(line)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length < 8) return false;
  const singles = tokens.filter((t) => /^[A-Za-z]$/.test(t)).length;
  return singles / tokens.length >= 0.5;
}

function pushEvent(report, repair, where, note = "") {
  if (!report.repairs[repair]) report.repairs[repair] = { id: repair, count: 0, where: [] };
  report.repairs[repair].count += 1;
  report.repairs[repair].where.push(note ? `${where} ${note}` : where);
}

export function stripImageMarkers(lines, report) {
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (isImageMarker(lines[i])) {
      pushEvent(report, 2, `L${i + 1}`, lines[i].trim());
      continue;
    }
    out.push({ text: lines[i], src: i + 1 });
  }
  return out;
}

function isRepeatedTitle(text, title, seenTitle) {
  const t = text.trim();
  if (!title || !seenTitle) return false;
  if (t === title) return true;
  if (t === "For the period ended March 31, 2026") return true;
  return false;
}

export function stripPageFurniture(rows, { documentTitle }, report) {
  const out = [];
  let seenTitle = false;
  for (const row of rows) {
    const t = row.text.trim();
    if (t === documentTitle) {
      if (seenTitle) {
        pushEvent(report, 3, `L${row.src}`, "repeated title");
        continue;
      }
      seenTitle = true;
    } else if (isRepeatedTitle(row.text, documentTitle, seenTitle) && t !== documentTitle) {
      pushEvent(report, 3, `L${row.src}`, "running header");
      continue;
    }
    if (isStandalonePageNumber(row.text)) {
      pushEvent(report, 3, `L${row.src}`, "page number");
      continue;
    }
    out.push(row);
  }
  return out;
}

function lexiconFromRows(rows) {
  const set = new Set(OBJECTIVE_WORDS.map((w) => w.toLowerCase()));
  for (const row of rows) {
    if (isLetterSpacedLine(row.text)) continue;
    for (const tok of row.text.match(/[A-Za-z][A-Za-z'-]*/g) || []) {
      if (tok.length >= 3) set.add(tok.toLowerCase());
      if (/ing$/i.test(tok) && tok.length > 5) set.add(tok.slice(0, -3).toLowerCase());
    }
  }
  return [...set].sort((a, b) => b.length - a.length);
}

function segmentCollapsed(collapsed, lexicon) {
  let i = 0;
  const parts = [];
  while (i < collapsed.length) {
    const ch = collapsed[i];
    if (!/[A-Za-z]/.test(ch)) {
      parts.push(ch);
      i += 1;
      continue;
    }
    const rest = collapsed.slice(i);
    const lower = rest.toLowerCase();
    let hit = null;
    for (const w of lexicon) {
      if (lower.startsWith(w) && w.length >= 2) {
        const next = rest[w.length];
        if (next == null || !/[A-Za-z]/.test(next) || w.length >= 3) {
          hit = rest.slice(0, w.length);
          if (w.length >= 3 || next == null || !/[A-Za-z]/.test(next)) break;
        }
      }
    }
    if (!hit) {
      for (const w of lexicon) {
        if (lower.startsWith(w) && w.length >= 2) {
          hit = rest.slice(0, w.length);
          break;
        }
      }
    }
    if (hit) {
      parts.push(hit);
      i += hit.length;
    } else {
      parts.push(ch);
      i += 1;
    }
  }
  let out = "";
  for (let p = 0; p < parts.length; p += 1) {
    const cur = parts[p];
    const prev = parts[p - 1];
    if (/^[A-Za-z]/.test(cur) && prev && /[A-Za-z]/.test(prev)) out += ` ${cur}`;
    else if (cur === "." && prev && /[A-Za-z]/.test(prev)) out += cur;
    else if (cur === ":" && prev) out += `${cur} `;
    else out += cur;
  }
  return out.replace(/\s+/g, " ").replace(/\s+([.,)])/g, "$1").trim();
}

export function collapseLetterSpacing(line, lexicon) {
  const raw = String(line);
  if (isLetterSpacedLine(raw)) {
    const collapsed = raw.replace(/\s+/g, "");
    return segmentCollapsed(collapsed, lexicon);
  }
  let next = raw;
  for (const [re, to] of SPLIT_WORDS) next = next.replace(re, to);
  return next;
}

export function applyLetterSpacing(rows, report) {
  const lexicon = lexiconFromRows(rows);
  return rows.map((row) => {
    const next = collapseLetterSpacing(row.text, lexicon);
    if (next !== row.text) {
      pushEvent(report, 5, `L${row.src}`);
      return { ...row, text: next };
    }
    return row;
  });
}

function isHighlightHeaderBlock(rows, i) {
  return (
    rows[i]?.text.trim() === "Year to/as at Year to/as at" &&
    rows[i + 1]?.text.trim() === "31 March 31 March" &&
    rows[i + 2]?.text.trim() === "2025 2024"
  );
}

function isNetPerfHeaderBlock(rows, i) {
  const a = rows[i]?.text.trim() ?? "";
  const b = rows[i + 1]?.text.trim() ?? "";
  const c = rows[i + 2]?.text.trim() ?? "";
  return a.startsWith("Share Class Share class NAV") && b.includes("1YR Since") && c === "Inception";
}

function isMonthlyHeaderBlock(rows, i) {
  const a = rows[i]?.text.trim() ?? "";
  const b = rows[i + 1]?.text.trim() ?? "";
  const c = rows[i + 2]?.text.trim() ?? "";
  return (
    (/^Share$/i.test(a) || /^S hare$/i.test(a)) &&
    /Jan Feb Mar/.test(b) &&
    /^Return/.test(c)
  );
}

function isClassLetter(line) {
  return /^[ADI]$/.test(String(line).trim());
}

function isYearDataRow(line) {
  return /^(2025|2026)\s/.test(String(line).trim());
}

export function rebuildTables(rows, report) {
  const out = [];
  for (let i = 0; i < rows.length; i += 1) {
    if (isHighlightHeaderBlock(rows, i)) {
      const joined = [rows[i].text.trim(), rows[i + 1].text.trim(), rows[i + 2].text.trim()].join(" ");
      pushEvent(report, 7, `L${rows[i].src}-L${rows[i + 2].src}`, "highlights header");
      out.push({ text: joined, src: rows[i].src });
      i += 2;
      continue;
    }
    if (isNetPerfHeaderBlock(rows, i)) {
      const joined = [rows[i].text.trim(), rows[i + 1].text.trim(), rows[i + 2].text.trim()].join(" ");
      pushEvent(report, 6, `L${rows[i].src}-L${rows[i + 2].src}`, "net performance header");
      out.push({ text: joined, src: rows[i].src });
      i += 2;
      continue;
    }
    if (isMonthlyHeaderBlock(rows, i)) {
      const joined = [rows[i].text.trim(), rows[i + 1].text.trim(), rows[i + 2].text.trim()].join(" ");
      pushEvent(report, 6, `L${rows[i].src}-L${rows[i + 2].src}`, "monthly header");
      out.push({ text: joined, src: rows[i].src });
      i += 2;
      continue;
    }
    if (isYearDataRow(rows[i].text) && isClassLetter(rows[i + 1]?.text) && isYearDataRow(rows[i + 2]?.text)) {
      const letter = rows[i + 1].text.trim();
      out.push({ text: `${letter} ${rows[i].text.trim()}`, src: rows[i].src });
      out.push({ text: `${letter} ${rows[i + 2].text.trim()}`, src: rows[i + 2].src });
      pushEvent(report, 6, `L${rows[i].src}-L${rows[i + 2].src}`, `monthly class ${letter}`);
      i += 2;
      continue;
    }
    out.push(rows[i]);
  }
  return out;
}

function isHeadingLine(text) {
  const t = String(text).trim();
  if (/^Note \d$/.test(t)) return true;
  if (/^ENDS$/.test(t)) return true;
  if (/^Notes to /.test(t)) return true;
  if (/^Financial highlights$/.test(t)) return true;
  if (/^Important Risk Information$/.test(t)) return true;
  if (/^Key fund attributes$/.test(t)) return true;
  if (/^About Cravenford/.test(t)) return true;
  if (/^Summary of key fund terms$/.test(t)) return true;
  if (/^Largest 10/.test(t)) return true;
  if (/^Net performance/.test(t)) return true;
  if (/^CPIF portfolio/.test(t)) return true;
  if (/^March 2026 Factsheet$/.test(t)) return true;
  if (/^\("CPIF"\)$/.test(t)) return true;
  if (/^Group$/.test(t)) return true;
  if (/^A year of consistently strong growth$/.test(t)) return true;
  if (new RegExp(`^\\d{1,2} (?:${MONTHS}) \\d{4}$`).test(t)) return true;
  return false;
}

function isBlockStart(text) {
  const t = String(text).trim();
  if (!t) return true;
  if (/^•/.test(t)) return true;
  if (/^[“"]/.test(t)) return true;
  if (/^\d+\. /.test(t)) return true;
  if (/^\d+ [A-Z][a-z]/.test(t) && /[.!?]$/.test(t)) return true;
  return isHeadingLine(t);
}

function isTableRow(text) {
  const t = String(text).trim();
  if (/^[ADI] (Apr |20(?:25|26) )/.test(t)) return true;
  if (/^Share Class\b/.test(t) && /(?:1YR|Jan Feb)/.test(t)) return true;
  if (/^Year to\/as at /.test(t)) return true;
  if (/^– As a percentage/.test(t)) return true;
  if (/^Gearing 1 /.test(t)) return true;
  if (/\bBuyout\b/.test(t) && /%/.test(t) && !/million/.test(t)) return true;
  if (/million/.test(t)) return false;
  if (/£\(?[\d,]+\)?m\s+£\(?[\d,]+\)?m/.test(t)) return true;
  if (/\d[\d,.]*p\s+\d[\d,.]*p$/.test(t)) return true;
  if (/\d+\s*%\s+\d+\s*%$/.test(t)) return true;
  return false;
}

export function rejoinRows(rows, report) {
  const out = [];
  for (const row of rows) {
    const t = row.text.trim();
    if (out.length === 0) {
      out.push({ ...row, text: t });
      continue;
    }
    const prev = out[out.length - 1];
    const p = prev.text;
    const n = t;
    if (!p || !n) {
      out.push({ ...row, text: t });
      continue;
    }
    if (isTableRow(p) || isTableRow(n)) {
      out.push({ ...row, text: t });
      continue;
    }
    const nextContinues =
      /^[a-z,.)\]£€]/.test(n) ||
      /^\([a-z]/.test(n) ||
      /^[,.)]/.test(n) ||
      (/^\d/.test(n) && /[a-z]$/.test(p)) ||
      (/^[A-Z][A-Za-z-]+(?: \d+)?$/.test(n) && !/[.!?]$/.test(p) && !isHeadingLine(p));
    const prevOpen = !/[.!?]["”']?$/.test(p) && !isBlockStart(n) && !isHeadingLine(p);
    const nextIsNewBlock = /^(Investment objective:)/.test(n) || /^\$[\d.]+[BMK]/.test(n);
    const prevIsStats = /^\$[\d.]+[BMK]/.test(p) || /675\+/.test(p);
    const longWrap = prevOpen && !nextIsNewBlock && !prevIsStats && (p.startsWith("•") || p.length > 40);
    if (nextContinues || longWrap) {
      const gap = /^[,.)]/.test(n) ? "" : " ";
      prev.text = `${p}${gap}${n}`;
      pushEvent(report, 1, `L${prev.src}+L${row.src}`);
      continue;
    }
    out.push({ ...row, text: t });
  }
  return out;
}

export function stripPrePunctuationSpaces(rows, report) {
  return rows.map((row) => {
    const next = row.text.replace(/ +([,.)\]])/g, "$1");
    if (next !== row.text) {
      const n = (row.text.match(/ +([,.)\]])/g) || []).length;
      for (let k = 0; k < n; k += 1) pushEvent(report, 4, `L${row.src}`);
      return { ...row, text: next };
    }
    return row;
  });
}

export function makeTwin(raw, options = {}) {
  const report = {
    inputName: options.inputName ?? "input",
    outputName: options.outputName ?? "output",
    repairs: {
      1: { id: 1, name: "rejoin-mid-sentence", count: 0, where: [] },
      2: { id: 2, name: "remove-image-markers", count: 0, where: [] },
      3: { id: 3, name: "remove-page-furniture", count: 0, where: [] },
      4: { id: 4, name: "strip-pre-punctuation-spaces", count: 0, where: [] },
      5: { id: 5, name: "undo-letter-spacing", count: 0, where: [] },
      6: { id: 6, name: "rebuild-factsheet-tables", count: 0, where: [] },
      7: { id: 7, name: "rebuild-highlights-table", count: 0, where: [] },
    },
  };
  const lines = String(raw ?? "").split("\n");
  let rows = lines.map((text, i) => ({ text, src: i + 1 }));
  rows = stripImageMarkers(rows.map((r) => r.text), report).map((r, idx) => ({
    text: r.text,
    src: r.src ?? idx + 1,
  }));
  rows = stripPageFurniture(rows, { documentTitle: options.documentTitle ?? "" }, report);
  rows = applyLetterSpacing(rows, report);
  rows = rebuildTables(rows, report);
  rows = rejoinRows(rows, report);
  rows = stripPrePunctuationSpaces(rows, report);
  const text = rows.map((r) => r.text).join("\n");
  return { text, report };
}

export function monthlyGridRows(text) {
  const lines = String(text ?? "").split("\n");
  const start = lines.findIndex((l) => /Jan Feb Mar Apr May Jun/.test(l));
  if (start < 0) return [];
  const rows = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const t = lines[i].trim();
    if (!t) continue;
    if (/^Largest 10/.test(t) || /^Net performance/.test(t) || /^Important /.test(t)) break;
    if (/^A 20(25|26)\b/.test(t) || /^D 20(25|26)\b/.test(t) || /^I 20(25|26)\b/.test(t) || /^(2025|2026)\b/.test(t) || /^[ADI]$/.test(t)) {
      rows.push(t);
      continue;
    }
    if (rows.length > 0) break;
  }
  return rows;
}

export async function writeTwins({
  sourcesDir = DEFAULT_SOURCES_DIR,
  rulesPath = DEFAULT_RULES_PATH,
} = {}) {
  const files = [];
  for (const spec of TWIN_SPECS) {
    const inputPath = path.join(sourcesDir, spec.inputName);
    const outputPath = path.join(sourcesDir, spec.outputName);
    const raw = await readFile(inputPath, "utf8");
    const { text, report } = makeTwin(raw, spec);
    await writeFile(outputPath, text, "utf8");
    files.push({ ...spec, inputPath, outputPath, report, input: raw, output: text });
  }
  const rules = {
    generatedAt: "2026-09-09",
    note: "Audit log of the seven twin repairs. Twins are generated by make-twin.mjs, not hand-edited.",
    files: files.map((f) => ({
      input: f.inputName,
      output: f.outputName,
      repairs: Object.values(f.report.repairs),
    })),
  };
  await writeFile(rulesPath, `${JSON.stringify(rules, null, 2)}\n`, "utf8");
  return { files, rules };
}

async function main() {
  const result = await writeTwins();
  for (const f of result.files) {
    console.log(`wrote ${f.outputPath}`);
  }
  console.log(`wrote ${DEFAULT_RULES_PATH}`);
}

if (runningAsMain()) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
