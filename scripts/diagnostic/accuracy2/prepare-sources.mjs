#!/usr/bin/env node
/**
 * Deterministic corpus 2 source rename. No LLM. Reads the gitignored PDF extracts,
 * applies name-map.json, writes accuracy2/sources/. Exits non-zero if residual
 * candidate proper nouns remain after substitution.
 *
 *   node scripts/diagnostic/accuracy2/prepare-sources.mjs [--allow-list path]
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "../../..");

export const DEFAULT_MAP_PATH = path.join(__dirname, "sources/name-map.json");
export const DEFAULT_ALLOW_LIST_PATH = path.join(__dirname, "sources/allow-list.json");
export const DEFAULT_IN_DIR = path.join(ROOT, "scripts/diagnostic/extraction-check/outputs");
export const DEFAULT_OUT_DIR = path.join(__dirname, "sources");

export const SOURCE_FILES = [
  {
    inputName: "3i-press-release-fy25-highlights.txt",
    outputName: "press-release-fy25-highlights.txt",
  },
  {
    inputName: "hpif-factsheet-march-2026.txt",
    outputName: "fund-factsheet-march-2026.txt",
  },
];

const MONTHS = new Set([
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Sept",
  "Oct",
  "Nov",
  "Dec",
]);

const WEEKDAYS = new Set([
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
]);

const CURRENCY_CODES = new Set(["GBP", "USD", "EUR", "CHF", "JPY", "CAD", "AUD", "SEK", "NOK", "DKK"]);

const SENTENCE_INITIAL = new Set([
  "A",
  "An",
  "The",
  "This",
  "These",
  "That",
  "Those",
  "Our",
  "We",
  "For",
  "In",
  "At",
  "As",
  "If",
  "It",
  "Its",
  "On",
  "Of",
  "To",
  "And",
  "Or",
  "But",
  "With",
  "From",
  "By",
  "About",
  "Unless",
  "Although",
  "When",
  "Where",
  "What",
  "Which",
  "Who",
  "How",
  "No",
  "Not",
  "All",
  "Any",
  "Each",
  "Such",
  "There",
  "These",
  "After",
  "Before",
  "During",
  "Under",
  "Over",
  "Into",
  "Upon",
  "Within",
  "Without",
  "Between",
  "Among",
  "Through",
  "Against",
  "Despite",
  "Because",
  "While",
  "Since",
  "Until",
  "Once",
  "Also",
  "Then",
  "Thus",
  "Therefore",
  "However",
  "Accordingly",
  "Sometimes",
  "Current",
  "See",
  "Based",
  "Assessed",
  "Holdings",
  "Copies",
  "Subject",
  "Past",
  "Read",
  "Investors",
  "Important",
  "Although",
  "Diversification",
  "Underlying",
  "Use",
  "Derivative",
  "Investment",
  "The",
]);

function runningAsMain() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(path.resolve(entry)).href;
  } catch {
    return false;
  }
}

export function parsePrepareArgs(argv) {
  const out = { allowList: null, map: null, inDir: null, outDir: null };
  const args = Array.isArray(argv) ? argv : [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--allow-list" && args[i + 1]) out.allowList = args[++i];
    else if (args[i] === "--map" && args[i + 1]) out.map = args[++i];
    else if (args[i] === "--in-dir" && args[i + 1]) out.inDir = args[++i];
    else if (args[i] === "--out-dir" && args[i + 1]) out.outDir = args[++i];
  }
  return out;
}

export function sortReplacements(replacements) {
  return [...(Array.isArray(replacements) ? replacements : [])].sort(
    (a, b) => String(b.from).length - String(a.from).length || String(a.from).localeCompare(String(b.from))
  );
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function applyDeletions(text, deletions, { requiredIds = [] } = {}) {
  let out = String(text ?? "");
  const applied = [];
  for (const row of Array.isArray(deletions) ? deletions : []) {
    const before = row?.before;
    const after = row?.after ?? "";
    if (typeof before !== "string" || before.length === 0) {
      throw new Error(`Deletion ${row?.id ?? "?"} is missing exact before text`);
    }
    if (!out.includes(before)) continue;
    out = out.split(before).join(after);
    applied.push(row.id);
  }
  for (const id of requiredIds) {
    if (!applied.includes(id)) {
      throw new Error(`Deletion ${id} before-text not found in this file`);
    }
  }
  return out;
}

export function applyReplacements(text, replacements) {
  let out = String(text ?? "");
  for (const row of sortReplacements(replacements)) {
    const from = row?.from;
    const to = row?.to;
    if (typeof from !== "string" || from.length === 0 || typeof to !== "string") continue;
    if (from === to) continue;
    out = out.split(from).join(to);
  }
  return out;
}

export function prepareText(raw, nameMap, options = {}) {
  const deleted = applyDeletions(raw, nameMap?.deletions, options);
  return applyReplacements(deleted, nameMap?.replacements);
}

export function loadAllowTerms(allowListDoc) {
  if (Array.isArray(allowListDoc)) return allowListDoc.map((t) => String(t));
  const terms = Array.isArray(allowListDoc?.terms) ? allowListDoc.terms : [];
  return terms.map((t) => String(t));
}

export function introducedValues(nameMap) {
  const out = new Set();
  for (const row of Array.isArray(nameMap?.replacements) ? nameMap.replacements : []) {
    const to = String(row?.to ?? "").trim();
    if (!to) continue;
    out.add(to);
    for (const tok of to.split(/[\s,]+/)) {
      const t = tok.replace(/^[("'[]+|[)"'\].]+$/g, "");
      if (t) out.add(t);
    }
  }
  return out;
}

function allowSet(terms, nameMap) {
  const set = new Set();
  for (const t of terms) {
    if (t) set.add(t);
  }
  for (const v of introducedValues(nameMap)) set.add(v);
  for (const m of MONTHS) set.add(m);
  for (const d of WEEKDAYS) set.add(d);
  for (const c of CURRENCY_CODES) set.add(c);
  return set;
}

function isAllowedTerm(term, allowed) {
  if (!term) return true;
  if (allowed.has(term)) return true;
  const lower = term.toLowerCase();
  for (const a of allowed) {
    if (a.toLowerCase() === lower) return true;
  }
  return false;
}

function stripAllowedPrefix(tokens, allowed) {
  const out = [...tokens];
  while (out.length > 0) {
    const first = out[0];
    if (SENTENCE_INITIAL.has(first) || isAllowedTerm(first, allowed) || MONTHS.has(first) || WEEKDAYS.has(first)) {
      out.shift();
      continue;
    }
    break;
  }
  return out;
}

function isLetterSpacedLine(line) {
  const tokens = String(line)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length < 8) return false;
  const singles = tokens.filter((t) => /^[A-Za-z]$/.test(t)).length;
  return singles / tokens.length >= 0.5;
}

const TOKEN_RE = /[A-Z][A-Za-zÀ-ÿ]*(?:-[A-Z][A-Za-zÀ-ÿ]*)*(?:['’]s)?|\p{Lu}{2,}(?:\/\p{Lu}+)?/gu;
const PARTICLE = /^(?:van|von|der|den|de|da|di|du|la|le|lo|of|and|the)$/i;

function tokenRunsOnLine(line) {
  const runs = [];
  const re = new RegExp(TOKEN_RE.source, TOKEN_RE.flags);
  let match;
  const tokens = [];
  while ((match = re.exec(line))) {
    tokens.push({ text: match[0], index: match.index, end: match.index + match[0].length });
  }
  if (tokens.length === 0) return runs;
  let current = [tokens[0]];
  for (let i = 1; i < tokens.length; i += 1) {
    const prev = current[current.length - 1];
    const gap = line.slice(prev.end, tokens[i].index);
    if (/^(\s+|(?:\s+(?:van|von|der|den|de|da|di|du|la|le|lo|of|and|the)\s+))$/i.test(gap) || PARTICLE.test(gap.trim())) {
      if (gap.trim() && PARTICLE.test(gap.trim())) {
        current.push({ text: gap.trim(), index: prev.end, end: tokens[i].index, particle: true });
      }
      current.push(tokens[i]);
    } else if (/^\s+$/.test(gap)) {
      current.push(tokens[i]);
    } else {
      runs.push(current);
      current = [tokens[i]];
    }
  }
  runs.push(current);
  return runs.map((run) => ({
    text: line.slice(run[0].index, run[run.length - 1].end),
    tokens: run.filter((t) => !t.particle).map((t) => t.text.replace(/['’]s$/, "")),
  }));
}

function leftoverFromHits(text, replacements, fileLabel) {
  const hits = [];
  const lines = String(text ?? "").split("\n");
  const ordered = sortReplacements(replacements);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    for (const row of ordered) {
      const from = String(row?.from ?? "");
      if (!from) continue;
      const re = new RegExp(`(?<![A-Za-z0-9])${escapeRegex(from)}(?![A-Za-z0-9])`, "i");
      if (re.test(line)) {
        hits.push({ file: fileLabel, line: i + 1, text: from });
      }
    }
  }
  return hits;
}

/**
 * Over-report residual candidate proper nouns. Pasteable lines: file:line:text
 */
export function scanUnmappedNames(text, { nameMap, allowTerms = [], fileLabel = "input" } = {}) {
  const allowed = allowSet(allowTerms, nameMap);
  const hits = [];
  const seen = new Set();
  const push = (hit) => {
    const key = `${hit.file}:${hit.line}:${hit.text}`;
    if (seen.has(key)) return;
    seen.add(key);
    hits.push(hit);
  };

  for (const hit of leftoverFromHits(text, nameMap?.replacements, fileLabel)) push(hit);

  const lines = String(text ?? "").split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\[Image:/.test(line.trim())) continue;
    if (isLetterSpacedLine(line)) continue;
    for (const run of tokenRunsOnLine(line)) {
      if (run.tokens.every((t) => t.length < 2) && run.tokens.length <= 1) continue;
      const stripped = stripAllowedPrefix(run.tokens, allowed);
      if (stripped.length === 0) continue;
      const remaining = stripped.filter(
        (t) =>
          t.length >= 2 &&
          !isAllowedTerm(t, allowed) &&
          !MONTHS.has(t) &&
          !WEEKDAYS.has(t) &&
          !CURRENCY_CODES.has(t)
      );
      if (remaining.length === 0) continue;
      if (isAllowedTerm(run.text, allowed)) continue;
      push({ file: fileLabel, line: i + 1, text: run.text });
    }
  }
  return hits;
}

export function formatUnmappedReport(hits) {
  const rows = Array.isArray(hits) ? hits : [];
  const lines = ["UNMAPPED_NAMES"];
  for (const h of rows) {
    lines.push(`${h.file}:${h.line}:${h.text}`);
  }
  return `${lines.join("\n")}\n`;
}

export function numericTokens(text) {
  const re = /(?<![A-Za-z0-9])\d+(?:,\d{3})*(?:\.\d+)?(?:%|x|[BMKbp])?(?![A-Za-z0-9])/g;
  const counts = new Map();
  const src = String(text ?? "");
  let m;
  while ((m = re.exec(src))) {
    counts.set(m[0], (counts.get(m[0]) || 0) + 1);
  }
  return counts;
}

export function lineCount(text) {
  return String(text ?? "").split("\n").length;
}

export async function prepareSources({
  mapPath = DEFAULT_MAP_PATH,
  allowListPath = DEFAULT_ALLOW_LIST_PATH,
  inDir = DEFAULT_IN_DIR,
  outDir = DEFAULT_OUT_DIR,
  write = true,
} = {}) {
  const nameMap = JSON.parse(await readFile(mapPath, "utf8"));
  const allowDoc = JSON.parse(await readFile(allowListPath, "utf8"));
  const allowTerms = loadAllowTerms(allowDoc);
  if (write) await mkdir(outDir, { recursive: true });
  const files = [];
  const allHits = [];
  for (const spec of SOURCE_FILES) {
    const inputPath = path.join(inDir, spec.inputName);
    const outputPath = path.join(outDir, spec.outputName);
    const raw = await readFile(inputPath, "utf8");
    const requiredIds = raw.includes("ten23 health") ? ["ten23-health"] : [];
    const prepared = prepareText(raw, nameMap, { requiredIds });
    if (write) await writeFile(outputPath, prepared, "utf8");
    const hits = scanUnmappedNames(prepared, {
      nameMap,
      allowTerms,
      fileLabel: spec.outputName,
    });
    allHits.push(...hits);
    files.push({
      inputName: spec.inputName,
      outputName: spec.outputName,
      inputPath,
      outputPath,
      input: raw,
      output: prepared,
      unmapped: hits,
    });
  }
  return { nameMap, allowTerms, files, unmapped: allHits, report: formatUnmappedReport(allHits) };
}

async function main() {
  const args = parsePrepareArgs(process.argv.slice(2));
  const result = await prepareSources({
    mapPath: args.map ? path.resolve(args.map) : DEFAULT_MAP_PATH,
    allowListPath: args.allowList ? path.resolve(args.allowList) : DEFAULT_ALLOW_LIST_PATH,
    inDir: args.inDir ? path.resolve(args.inDir) : DEFAULT_IN_DIR,
    outDir: args.outDir ? path.resolve(args.outDir) : DEFAULT_OUT_DIR,
    write: true,
  });
  if (result.unmapped.length > 0) {
    process.stderr.write(result.report);
    process.stderr.write(
      `Unmapped-name scan failed: ${result.unmapped.length} candidate(s). Not a complete rename.\n`
    );
    process.exit(1);
  }
  for (const f of result.files) {
    console.log(`wrote ${f.outputPath}`);
  }
}

if (runningAsMain()) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
