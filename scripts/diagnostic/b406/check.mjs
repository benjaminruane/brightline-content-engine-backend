/**
 * B406. Read-only. Confirms the B405 furniture regression and compares
 * the card excerpt with the reading-view line on the stored drafts.
 * Does not call a model and does not write a product file.
 *
 *   node scripts/diagnostic/b406/check.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stripLeadingPageFurniture } from "../../../lib/extract-boilerplate.mjs";
import { buildFacts, draftHeader, indexSourceLines, sentenceState, sentenceTier } from "../../../lib/qc/reading-contract.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const DOCS = [
  {
    doc: "3i",
    source: "tests/fixtures/real-runs-2026-09-29/source-3i-hy25-extracted.txt",
    clean: "tests/fixtures/real-runs-2026-09-29/clean-review.json",
  },
  {
    doc: "HICL",
    source: "tests/fixtures/real-runs-2026-10-04-hicl/source-hicl-interim-extracted.txt",
    clean: "tests/fixtures/real-runs-2026-10-04-hicl/clean-review.json",
  },
  {
    doc: "GPI",
    source: "tests/fixtures/real-runs-2026-10-06-gpi/source-gpi-press-release-extracted.txt",
    clean: "tests/fixtures/real-runs-2026-10-06-gpi/clean-run2-review.json",
  },
  {
    doc: "ClearPoint",
    source: "tests/fixtures/real-runs-2026-10-06-clearpoint/source-clearpoint-q1-2026-extracted.txt",
    clean: "tests/fixtures/real-runs-2026-10-06-clearpoint/clean1-review.json",
  },
];

const PRIOR = "scripts/diagnostic/b403c/runs/reading.json";
const LINE_FILES = [
  "scripts/diagnostic/b403c/MEASURE.md",
  "scripts/diagnostic/b403c/runs/reading.json",
  "scripts/diagnostic/b404/WALKTHROUGH.md",
  "scripts/diagnostic/b404/runs/reading.json",
];

function read(rel) {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

function load(rel) {
  return JSON.parse(read(rel));
}

function statementText(row) {
  if (typeof row?.text === "string" && row.text.trim()) return row.text;
  if (typeof row?.qcCard?.statement === "string") return row.qcCard.statement;
  return "";
}

function linesOf(text) {
  return String(text).split("\n");
}

function removedLines(before, after) {
  const a = linesOf(before);
  const b = linesOf(after);
  const removed = [];
  let j = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (j < b.length && a[i] === b[j]) j += 1;
    else removed.push({ line: i + 1, text: a[i] });
  }
  return { removed, matchedTail: j === b.length, before: a.length, after: b.length };
}

function countPhrase(text, phrase) {
  let n = 0;
  let i = 0;
  while (i <= text.length) {
    const at = text.indexOf(phrase, i);
    if (at < 0) break;
    n += 1;
    i = at + phrase.length;
  }
  return n;
}

function lineAt(text, index) {
  const lines = linesOf(text);
  if (index < 1 || index > lines.length) return null;
  return lines[index - 1];
}

function lineSpan(text, start, length) {
  const lines = linesOf(text);
  let cursor = 0;
  const hit = new Set();
  const end = start + length;
  for (let i = 0; i < lines.length; i += 1) {
    const lineEnd = cursor + lines[i].length;
    if (lineEnd > start && cursor < end) hit.add(i + 1);
    cursor = lineEnd + 1;
  }
  return [...hit];
}

function locatePassage(source, passage) {
  const raw = typeof passage === "string" ? passage.trim() : "";
  if (!raw) return { status: "empty", lines: [] };
  const exact = source.indexOf(raw);
  if (exact >= 0) return { status: "exact", lines: lineSpan(source, exact, raw.length) };
  let core = raw.replace(/^\.\.\.\s*/, "").replace(/\s\.\.\.$/, "").replace(/^…/, "").replace(/…$/, "").trim();
  if (core && source.includes(core)) {
    const at = source.indexOf(core);
    return { status: "decorated", lines: lineSpan(source, at, core.length) };
  }
  const parts = core.split(" ... ").map((part) => part.trim()).filter(Boolean);
  if (parts.length > 1 && parts.every((part) => source.includes(part))) {
    const lines = parts.flatMap((part) => {
      const at = source.indexOf(part);
      return lineSpan(source, at, part.length);
    });
    return { status: "gapped", lines: [...new Set(lines)] };
  }
  return { status: "missing", lines: [] };
}

function excerptPassage(value) {
  if (typeof value === "string") return value.trim();
  if (value && typeof value.passage === "string") return value.passage.trim();
  return "";
}

function sourcesViewLine(sourceText, lineId) {
  const n = Number(String(lineId).replace(/^L/, ""));
  const lines = linesOf(sourceText);
  if (!Number.isInteger(n) || n < 1 || n > lines.length) return null;
  return lines[n - 1].replace(/\r$/, "");
}

function walkJson(node, visit) {
  if (Array.isArray(node)) {
    for (const item of node) walkJson(item, visit);
    return;
  }
  if (!node || typeof node !== "object") return;
  visit(node);
  for (const value of Object.values(node)) walkJson(value, visit);
}

function citedLineIds(rel) {
  const text = read(rel);
  const ids = new Set();
  for (const match of text.matchAll(/\bL(\d+)\b/g)) ids.add(Number(match[1]));
  return [...ids].sort((a, b) => a - b);
}

function filesWithLineId(dir) {
  const out = [];
  const abs = path.join(ROOT, dir);
  let entries = [];
  try {
    entries = readdirSync(abs);
  } catch {
    return out;
  }
  for (const name of entries) {
    const rel = path.join(dir, name);
    const full = path.join(ROOT, rel);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...filesWithLineId(rel));
      continue;
    }
    if (!name.endsWith(".json") && !name.endsWith(".md")) continue;
    if (stat.size > 2_000_000) continue;
    const text = readFileSync(full, "utf8");
    if (text.includes("lineId") || /\bL\d+\b/.test(text)) out.push(rel);
  }
  return out;
}

const prior = load(PRIOR);
const priorByKey = new Map();
for (const draft of prior.drafts) {
  for (const row of draft.statements) {
    priorByKey.set(`${draft.doc}|${draft.arm}|${row.index}`, row);
  }
}

console.log("G1 line counts");
const strippedByDoc = new Map();
for (const doc of DOCS) {
  const before = read(doc.source);
  const after = stripLeadingPageFurniture(before);
  const diff = removedLines(before, after);
  strippedByDoc.set(doc.doc, { before, after, diff });
  console.log(
    `${doc.doc} ${diff.before} -> ${diff.after} removed ${diff.removed.length} tailMatched ${diff.matchedTail} chars ${before.length} -> ${after.length}`
  );
  for (const row of diff.removed) {
    console.log(`  removed L${row.line}: ${JSON.stringify(row.text).slice(0, 180)}`);
  }
  if (doc.doc === "HICL") {
    const phrase = "HICL Infrastructure PLC";
    const name = "HICL Infrastructure";
    console.log(
      `  phrase ${JSON.stringify(phrase)} before ${countPhrase(before, phrase)} after ${countPhrase(after, phrase)}`
    );
    console.log(
      `  phrase ${JSON.stringify(name)} before ${countPhrase(before, name)} after ${countPhrase(after, name)}`
    );
  }
}

function factsFor(statement, draftText, sourceText) {
  return buildFacts({ statement, draft: draftText, sourceText });
}

console.log("\nG1 HICL clean missing facts");
const hicl = DOCS.find((doc) => doc.doc === "HICL");
const hiclReview = load(hicl.clean);
const hiclTexts = hiclReview.statements.map(statementText);
const hiclDraft = hiclTexts.join("\n");
const hiclSource = strippedByDoc.get("HICL");
for (const label of ["before", "after"]) {
  const sourceText = label === "before" ? hiclSource.before : hiclSource.after;
  console.log(` ${label}`);
  hiclTexts.forEach((text, index) => {
    const missing = factsFor(text, hiclDraft, sourceText)
      .filter((fact) => fact.status === "not_found")
      .map((fact) => `${fact.kind}:${fact.surface}`);
    if (missing.length) console.log(`  S${index} ${missing.join(", ")}`);
  });
}

console.log("\nG2 clean tiers, notes reused from b403c, matcher on stripped text");
const cleanRows = [];
for (const doc of DOCS) {
  const review = load(doc.clean);
  const texts = review.statements.map(statementText);
  const draftText = texts.join("\n");
  const sourceText = strippedByDoc.get(doc.doc).after;
  const headerInput = [];
  texts.forEach((text, index) => {
    const stored = priorByKey.get(`${doc.doc}|clean|${index}`);
    if (!stored) throw new Error(`no stored note ${doc.doc} clean S${index}`);
    const facts = factsFor(text, draftText, sourceText);
    const note = stored.bucket === "withheld" ? { refused: true } : { bucket: stored.bucket };
    const state = sentenceState(facts, note);
    const tier = sentenceTier(state);
    const missing = facts.filter((fact) => fact.status === "not_found").map((fact) => `${fact.kind}:${fact.surface}`);
    const changed = state !== stored.sentenceState || tier !== stored.tier;
    if (changed || missing.length) {
      console.log(
        `${doc.doc} S${index} ledger ${stored.ledger} ${stored.sentenceState}/${stored.tier} -> ${state}/${tier} missing ${missing.join(", ") || "none"}`
      );
    }
    headerInput.push({ facts, sentenceState: state, note: note.refused ? null : note, ledger: stored.ledger });
    cleanRows.push({ doc: doc.doc, index, ledger: stored.ledger, state, tier, was: stored.tier });
  });
  if (doc.doc === "HICL") {
    const header = draftHeader(headerInput);
    const storedDraft = prior.drafts.find((row) => row.doc === "HICL" && row.arm === "clean");
    console.log(`HICL clean header stored: ${storedDraft.header.numbers} | ${storedDraft.header.line}`);
    console.log(`HICL clean header strip:  ${header.numbers} | ${header.line}`);
    console.log(
      `HICL clean tiers stored ${JSON.stringify(storedDraft.tiers)} strip ${JSON.stringify(header.counts.tiers)}`
    );
  }
}

const tiers = { demands: 0, light: 0, quiet: 0 };
let noiseDemands = 0;
for (const row of cleanRows) {
  tiers[row.tier] += 1;
  if (row.tier === "demands" && (row.ledger === "correct" || row.ledger === "rejected")) noiseDemands += 1;
}
console.log(
  `clean statements ${cleanRows.length} demands ${tiers.demands} light ${tiers.light} quiet ${tiers.quiet} noise in demands ${noiseDemands}`
);
console.log("B403C bar: demands 3, light 5, quiet 30, noise in demands 0");

console.log("\nG3 cited line ids against stripped text");
for (const rel of LINE_FILES) {
  const doc = rel.includes("b404") || rel.toLowerCase().includes("hicl") ? "HICL" : null;
  const ids = citedLineIds(rel);
  const pair = strippedByDoc.get("HICL");
  const shifted = [];
  for (const id of ids) {
    const oldText = lineAt(pair.before, id);
    const newText = lineAt(pair.after, id);
    if (oldText !== newText) shifted.push(id);
  }
  console.log(`${rel} distinct L-ids ${ids.length} HICL-shifted-if-applied ${shifted.length} ids ${shifted.join(",")}`);
}

const hiclPair = strippedByDoc.get("HICL");
const hiclJsonIds = [];
function collectHicl(rel, node) {
  walkJson(node, (row) => {
    if (typeof row.lineId === "string" && typeof row.extract === "string") hiclJsonIds.push(row);
  });
}
const b403 = load("scripts/diagnostic/b403c/runs/reading.json");
collectHicl("b403c", (b403.drafts || []).filter((row) => row.doc === "HICL"));
collectHicl("b403c-benchmarks", (b403.benchmarks || []).filter((row) => row.doc === "HICL"));
collectHicl("b404", load("scripts/diagnostic/b404/runs/reading.json"));
let extractMismatch = 0;
const mismatchSample = [];
for (const row of hiclJsonIds) {
  const id = Number(row.lineId.replace(/^L/, ""));
  const now = lineAt(hiclPair.after, id);
  if (now == null || !now.includes(row.extract.slice(0, 40))) {
    extractMismatch += 1;
    if (mismatchSample.length < 8) mismatchSample.push(`${row.lineId} ${JSON.stringify(row.extract).slice(0, 80)}`);
  }
}
console.log(`b403c reading.json lineId+extract rows ${hiclJsonIds.length} whose extract is not on that line after a HICL strip ${extractMismatch}`);
for (const row of mismatchSample) console.log(`  ${row}`);

console.log("files under b403c, b404, and tests/fixtures that mention lineId or an L-id");
for (const dir of ["scripts/diagnostic/b403c", "scripts/diagnostic/b404", "tests/fixtures"]) {
  const found = filesWithLineId(dir);
  console.log(` ${dir} ${found.length}`);
}

console.log("\nA1 card excerpt vs reading-view fact lines, source text stored on the review");
for (const doc of DOCS.filter((row) => row.doc === "HICL" || row.doc === "3i")) {
  const review = load(doc.clean);
  const texts = review.statements.map(statementText);
  const draftText = texts.join("\n");
  const embedded = review.sources?.[0]?.text;
  const sourceText = typeof embedded === "string" && embedded.trim() ? embedded : strippedByDoc.get(doc.doc).before;
  const sameAsFixture = sourceText === strippedByDoc.get(doc.doc).before;
  console.log(`${doc.doc} review source equals fixture file ${sameAsFixture} chars ${sourceText.length}`);
  let withExcerpt = 0;
  let agree = 0;
  let disagree = 0;
  texts.forEach((text, index) => {
    const card = review.statements[index]?.qcCard || {};
    const passage = excerptPassage(card.primaryExcerpt);
    if (!passage) return;
    withExcerpt += 1;
    const start = Number(card.primaryExcerptStart);
    const end = Number(card.primaryExcerptEnd);
    const offsetSlice = Number.isFinite(start) && Number.isFinite(end) ? sourceText.slice(start, end) : "";
    const offsetHolds = offsetSlice === passage;
    const located = offsetHolds
      ? { status: "offset", lines: lineSpan(sourceText, start, end - start) }
      : locatePassage(sourceText, passage);
    const factRows = factsFor(text, draftText, sourceText);
    const problems = [];
    if (located.status === "missing") problems.push("excerpt not in source");
    for (const fact of factRows) {
      const occ = Array.isArray(fact.occurrences) ? fact.occurrences.map((row) => Number(String(row.lineId).replace(/^L/, ""))) : [];
      const overlap = occ.filter((line) => located.lines.includes(line));
      if (fact.status === "not_found") {
        problems.push(`${fact.kind}:${fact.surface} not_found`);
        continue;
      }
      if (!overlap.length) {
        problems.push(
          `${fact.kind}:${fact.surface} lines ${occ.map((n) => `L${n}`).join("/") || "none"} excerpt ${located.lines.map((n) => `L${n}`).join("/") || "none"} (${located.status})`
        );
      }
    }
    if (problems.length) {
      disagree += 1;
      console.log(`${doc.doc} S${index} DISAGREE offsetHolds ${offsetHolds} ${problems.join(" | ")}`);
    } else {
      agree += 1;
    }
  });
  console.log(`${doc.doc} statements with a primary excerpt ${withExcerpt} agree ${agree} disagree ${disagree}`);
}

console.log("\nA2 three line ids, reading path vs sources-view split of the same string");
for (const doc of DOCS.filter((row) => row.doc === "HICL" || row.doc === "3i")) {
  const review = load(doc.clean);
  const embedded = review.sources?.[0]?.text;
  const sourceText = typeof embedded === "string" && embedded.trim() ? embedded : strippedByDoc.get(doc.doc).before;
  const reading = indexSourceLines(sourceText);
  const picks = [1, 12, reading.length].filter((n) => n >= 1 && n <= reading.length);
  for (const n of picks) {
    const id = `L${n}`;
    const fromReading = reading.find((row) => row.id === id)?.text ?? null;
    const fromSources = sourcesViewLine(sourceText, id);
    const same = fromReading === fromSources;
    console.log(`${doc.doc} ${id} same ${same} ${JSON.stringify(fromReading).slice(0, 120)}`);
  }
}

console.log("\nA3 excerpts that are not a contiguous slice of the source stored on the review");
for (const doc of DOCS.filter((row) => row.doc === "HICL" || row.doc === "3i")) {
  const review = load(doc.clean);
  const embedded = review.sources?.[0]?.text;
  const sourceText = typeof embedded === "string" && embedded.trim() ? embedded : strippedByDoc.get(doc.doc).before;
  review.statements.forEach((row, index) => {
    const card = row.qcCard || {};
    for (const field of ["primaryExcerpt", "conflictExcerpt"]) {
      const passage = excerptPassage(card[field]);
      if (!passage) continue;
      const located = locatePassage(sourceText, passage);
      if (located.status === "exact") continue;
      console.log(`${doc.doc} S${index} ${field} ${located.status} chars ${passage.length}`);
    }
  });
}
