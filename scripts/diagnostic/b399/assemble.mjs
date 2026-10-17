// B399 rule A1. Turns an extracted source into sentences.
// The rule text is scripts/diagnostic/b399/ASSEMBLY.md. Do not retune it from a count.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const OUT = path.join(root, "scripts/diagnostic/b399/runs/assembled");

export const SOURCES = [
  "tests/fixtures/real-runs-2026-09-29/source-3i-hy25-extracted.txt",
  "tests/fixtures/real-runs-2026-10-04-hicl/source-hicl-interim-extracted.txt",
  "tests/fixtures/real-runs-2026-10-06-gpi/source-gpi-press-release-extracted.txt",
  "tests/fixtures/real-runs-2026-10-06-clearpoint/source-clearpoint-q1-2026-extracted.txt",
];

function isTableRow(line) {
  if (line.includes("|")) return true;
  const gaps = line.match(/ {3,}/g);
  return Boolean(gaps && gaps.length >= 2);
}

function stripFurniture(line) {
  let text = line.replace(/\|/g, " ");
  text = text.replace(/[•·]/g, " ");
  text = text.replace(/(^|\s)[oO](?=\s+\S)/g, " ");
  return text.replace(/[ \t]+/g, " ").trim();
}

function endsSentence(text) {
  return /[.!?:;]["'”’)\]]*$/.test(text);
}

function joinPair(left, right) {
  if (left.endsWith("-") && /^[a-z]/.test(right)) return `${left}${right}`;
  return `${left} ${right}`;
}

function splitSentences(text) {
  const out = [];
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch !== "." && ch !== "!" && ch !== "?") continue;
    const prev = text[i - 1] || "";
    const next = text[i + 1] || "";
    if (ch === "." && /\d/.test(prev) && /\d/.test(next)) continue;
    let j = i + 1;
    while (j < text.length && /["'”’)\]]/.test(text[j])) j += 1;
    while (j < text.length && text[j] === " ") j += 1;
    if (j >= text.length || /[A-Z]/.test(text[j])) {
      const piece = text.slice(start, j).trim();
      if (piece) out.push(piece);
      start = j;
      i = j - 1;
    }
  }
  const rest = text.slice(start).trim();
  if (rest) out.push(rest);
  return out;
}

const ABBREV = new Set(["st", "mr", "dr", "inc", "ltd", "co", "corp"]);
const UNFINISHED = /(?:\b(?:of|the|a|an|and|or|to|in|for|with|from|by|on|at|as|its|our|their|into|including|than|per|after|before|over|under|between|within|across|during|without)|\()$/;

function abbrevWord(text) {
  const word = text.match(/([A-Za-z]+)\.["'”’)\]]*$/);
  return word && ABBREV.has(word[1].toLowerCase()) ? word[1] : "";
}

function endsBoundaryA2(text) {
  if (/[:;]["'”’)\]]*$/.test(text)) {
    const opens = (text.match(/\(/g) || []).length;
    const closes = (text.match(/\)/g) || []).length;
    return opens <= closes;
  }
  if (!/[.!?]["'”’)\]]*$/.test(text)) return false;
  if (/[!?]["'”’)\]]*$/.test(text)) return true;
  if (abbrevWord(text)) return false;
  return true;
}

function isPageMarker(text) {
  return /^Page \d+ of \d+$/.test(text);
}

function splitSentencesA2(text) {
  const out = [];
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch !== "." && ch !== "!" && ch !== "?") continue;
    const prev = text[i - 1] || "";
    const next = text[i + 1] || "";
    if (ch === "." && /\d/.test(prev) && /\d/.test(next)) continue;
    if (ch === "." && abbrevWord(text.slice(0, i + 1))) continue;
    let j = i + 1;
    while (j < text.length && /["'”’)\]]/.test(text[j])) j += 1;
    while (j < text.length && text[j] === " ") j += 1;
    const nxt = text[j] || "";
    if (j >= text.length || /[A-Z]/.test(nxt) || /\d/.test(nxt)) {
      const piece = text.slice(start, j).trim();
      if (piece) out.push(piece);
      start = j;
      i = j - 1;
    }
  }
  const rest = text.slice(start).trim();
  if (rest) out.push(rest);
  return out;
}

export function assembleA2(raw) {
  const normalised = raw.replace(/\u00a0/g, " ").replace(/\f/g, "\n");
  const segments = [];
  let buf = "";
  const flush = () => {
    if (!buf) return;
    segments.push(...splitSentencesA2(buf));
    buf = "";
  };
  const take = (piece) => {
    if (!buf) {
      buf = piece;
      return;
    }
    const continues = !endsBoundaryA2(buf) && (
      /^[a-z]/.test(piece) || UNFINISHED.test(buf) || Boolean(abbrevWord(buf)) || /[:;]["'”’)\]]*$/.test(buf)
    );
    if (continues) buf = joinPair(buf, piece);
    else {
      flush();
      buf = piece;
    }
  };
  for (const line of normalised.split("\n")) {
    if (isTableRow(line)) {
      flush();
      const cell = stripFurniture(line);
      if (cell) segments.push(...splitSentencesA2(cell));
      continue;
    }
    const piece = stripFurniture(line);
    if (!piece) {
      flush();
      continue;
    }
    if (isPageMarker(piece)) {
      segments.push(piece);
      continue;
    }
    take(piece);
  }
  flush();
  return `${segments.join("\n")}\n`;
}

export function assemble(raw) {
  const normalised = raw.replace(/\u00a0/g, " ").replace(/\f/g, "\n");
  const segments = [];
  let buf = "";
  const flush = () => {
    if (!buf) return;
    segments.push(...splitSentences(buf));
    buf = "";
  };
  for (const line of normalised.split("\n")) {
    if (isTableRow(line)) {
      flush();
      const cell = stripFurniture(line);
      if (cell) segments.push(...splitSentences(cell));
      continue;
    }
    const piece = stripFurniture(line);
    if (!piece) {
      flush();
      continue;
    }
    if (!buf) {
      buf = piece;
      continue;
    }
    if (!endsSentence(buf) && /^[a-z]/.test(piece)) buf = joinPair(buf, piece);
    else {
      flush();
      buf = piece;
    }
  }
  flush();
  return `${segments.join("\n")}\n`;
}

function lettersAndDigits(text) {
  return (text.match(/\p{L}|\p{N}/gu) || []).length;
}

function furnitureStripped(raw) {
  const normalised = raw.replace(/\u00a0/g, " ").replace(/\f/g, "\n");
  return normalised
    .split("\n")
    .map((line) => stripFurniture(line))
    .join(" ");
}

function words(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

function noEnding(text) {
  return !/[.!?]/.test(text);
}

export function lineStats(raw) {
  const lines = raw.split(/\n/).map((line) => line.trim()).filter(Boolean);
  const barren = lines.filter(noEnding).length;
  const totalWords = lines.reduce((sum, line) => sum + words(line), 0);
  return {
    segments: lines.length,
    noEndingShare: lines.length ? barren / lines.length : 0,
    meanWords: lines.length ? totalWords / lines.length : 0,
  };
}

export function assembledStats(text) {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const barren = lines.filter(noEnding).length;
  const totalWords = lines.reduce((sum, line) => sum + words(line), 0);
  return {
    segments: lines.length,
    noEndingShare: lines.length ? barren / lines.length : 0,
    meanWords: lines.length ? totalWords / lines.length : 0,
  };
}

function bindingSegments(text) {
  const out = [];
  for (const part of String(text).split(/\n+/)) {
    for (const bit of part.split(/(?<=[.!?])\s+(?=[A-Z“"])/)) {
      const trimmed = bit.trim();
      if (trimmed) out.push(trimmed);
    }
  }
  return out;
}

function endingStats(text) {
  const lines = bindingSegments(text);
  const barren = lines.filter((line) => !/[.!?]["'”’)\]]*$/.test(line)).length;
  const totalWords = lines.reduce((sum, line) => sum + words(line), 0);
  return {
    segments: lines.length,
    noEndingShare: lines.length ? barren / lines.length : 0,
    meanWords: lines.length ? totalWords / lines.length : 0,
  };
}

function reportOne(name, raw, out, label) {
  const before = endingStats(raw);
  const after = endingStats(out);
  const kept = lettersAndDigits(furnitureStripped(raw));
  const got = lettersAndDigits(out);
  console.log(
    [
      label,
      name,
      `segs ${before.segments} -> ${after.segments}`,
      `no-ending ${(before.noEndingShare * 100).toFixed(1)}% -> ${(after.noEndingShare * 100).toFixed(1)}%`,
      `mean ${before.meanWords.toFixed(1)} -> ${after.meanWords.toFixed(1)}`,
      `letters+digits ${kept} -> ${got} delta ${got - kept}`,
    ].join(" | "),
  );
}

function main() {
  const a2dir = path.join(root, "scripts/diagnostic/b399/runs/assembled-a2");
  mkdirSync(OUT, { recursive: true });
  mkdirSync(a2dir, { recursive: true });
  for (const rel of SOURCES) {
    const raw = readFileSync(path.join(root, rel), "utf8");
    const name = path.basename(rel);
    const a1 = assemble(raw);
    const a2 = assembleA2(raw);
    writeFileSync(path.join(OUT, name), a1);
    writeFileSync(path.join(a2dir, name), a2);
    reportOne(name, raw, a1, "A1");
    reportOne(name, raw, a2, "A2");
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
