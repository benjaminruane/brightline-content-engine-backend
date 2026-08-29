#!/usr/bin/env node
/**
 * Sentence bounds must not break on decimals.
 *
 * Part 0b  count the sentences across the committed Review artefacts and draft
 *          fixtures that carry a pattern which truncates the bounds.
 * Part 0d  replay every marker on disk under the OLD bounds and the NEW ones
 *          and report whether any honesty verdict was ever actually wrong.
 * Part 1   the three worked examples, bounds before and after.
 * Part 2   confirm the what-clause replay is unmoved.
 *
 * No model calls. Cost is zero.
 *
 * Usage: node scripts/diagnostic/revise/sentence-bounds-decimals.mjs
 */
import { readFile, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = __dirname;
const FIXTURE_DIR = path.join(__dirname, "fixtures");

const { sentenceBoundsContaining, applyMarkerHonestyCheck } = await import(
  "../../../lib/pr9-marker-honesty.mjs"
);
const { buildWhatClause, diffWordSequences, renderWhatClause } = await import(
  "../../../lib/pr9-note-what-from-diff.mjs"
);
const { markerSpanAlignment } = await import("../../../lib/pr9-marker-span-status.mjs");
const { finalizeSuggestRevisionText, gatherConcerns, parseSoftenedMarkers } = await import(
  "../../../lib/build-revision-prompt.mjs"
);

const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const trunc = (s, n = 76) => {
  const t = norm(s);
  return t.length <= n ? t : `${t.slice(0, n - 1)}\u2026`;
};
const mdCell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");

/* ------------------------------------------------------------------ *
 * sentenceBoundsContaining EXACTLY as it stood before this fix.
 * Kept here so every number below is a true before-and-after.
 * ------------------------------------------------------------------ */

function boundsBefore(text, start, end) {
  const source = typeof text === "string" ? text : "";
  let s = Number.isFinite(start) ? start : 0;
  let e = Number.isFinite(end) ? end : s;
  if (s < 0) s = 0;
  if (e < s) e = s;
  if (s > source.length) s = source.length;
  if (e > source.length) e = source.length;

  let left = s;
  while (left > 0) {
    const prev = source[left - 1];
    if (prev === "." || prev === "!" || prev === "?") break;
    if (prev === "\n" && left >= 2 && source[left - 2] === "\n") break;
    left -= 1;
  }
  while (left < source.length && /\s/.test(source[left])) left += 1;

  let right = Math.max(e, left);
  while (right < source.length) {
    const ch = source[right];
    if (ch === "." || ch === "!" || ch === "?") {
      right += 1;
      break;
    }
    if (ch === "\n" && right + 1 < source.length && source[right + 1] === "\n") break;
    right += 1;
  }
  return { start: left, end: right };
}

/* ------------------------------------------------------------------ *
 * Part 0b: how many sentences would truncate
 * ------------------------------------------------------------------ */

/**
 * The classic false terminators, each counted separately so the report can say
 * which ones actually occur in this corpus rather than which ones exist.
 */
const PATTERNS = [
  ["decimal in a figure", /\d\.\d/],
  ["initial or single capital", /(?:^|\s)[A-Z]\.(?:\s|$)/],
  ["abbreviation", /\b(?:No|Inc|Ltd|LLP|LP|Corp|Co|approx|est|e\.g|i\.e|etc|vs|Mr|Mrs|Ms|Dr|St)\.(?!$)/],
  ["ellipsis", /\.\.\.|\u2026/],
];

/**
 * Sentence segmentation INDEPENDENT of the function under test, so the count is
 * not circular. Splits on a terminator followed by whitespace and a capital,
 * which is wrong on "Ltd. It" but conservative: it can only over-split, and an
 * over-split fragment cannot be counted as truncating.
 */
function realSentences(text) {
  return String(text ?? "")
    .split(/(?<=[.!?])\s+(?=[A-Z\u201c"])|\n\s*\n/)
    .map(norm)
    .filter(Boolean);
}

/** Would the OLD bounds return something shorter than the real sentence? */
function truncatesUnderOldBounds(source, sentence) {
  const at = source.indexOf(sentence);
  if (at < 0) return false;
  const old = boundsBefore(source, at, at + Math.min(3, sentence.length));
  return old.end < at + sentence.length;
}

function findStatementArrays(node, out = [], depth = 0) {
  if (!node || typeof node !== "object" || depth > 6) return out;
  if (Array.isArray(node)) {
    if (node.length && node[0] && node[0].qcCard) out.push(node);
    node.forEach((n) => findStatementArrays(n, out, depth + 1));
    return out;
  }
  for (const v of Object.values(node)) findStatementArrays(v, out, depth + 1);
  return out;
}

async function statementsOf(file) {
  const json = JSON.parse(await readFile(path.join(OUT_DIR, file), "utf8"));
  const arrays = findStatementArrays(json);
  return arrays.length ? arrays.sort((a, b) => b.length - a.length)[0] : [];
}

const ARTEFACTS = [
  "suggest-after-r10-review1.json",
  "suggest-after-r10-review2.json",
  "condition-b-review.json",
  "coverage-gap-review.json",
];

async function sizeCorpus() {
  const sources = [];
  for (const f of ARTEFACTS) {
    if (!existsSync(path.join(OUT_DIR, f))) continue;
    const statements = await statementsOf(f);
    if (statements.length) {
      sources.push({ label: f, text: statements.map((s) => norm(s.text)).join(" ") });
    }
  }
  if (existsSync(FIXTURE_DIR)) {
    for (const f of await readdir(FIXTURE_DIR)) {
      if (!f.endsWith(".txt")) continue;
      sources.push({
        label: `fixtures/${f}`,
        text: (await readFile(path.join(FIXTURE_DIR, f), "utf8")).trim(),
      });
    }
  }

  const byPattern = Object.fromEntries(PATTERNS.map(([name]) => [name, 0]));
  let totalSentences = 0;
  let truncating = 0;
  const examples = [];

  for (const src of sources) {
    for (const sentence of realSentences(src.text)) {
      totalSentences += 1;
      const hits = PATTERNS.filter(([, re]) => re.test(sentence)).map(([n]) => n);
      if (hits.length === 0) continue;
      for (const h of hits) byPattern[h] += 1;
      if (truncatesUnderOldBounds(src.text, sentence)) {
        truncating += 1;
        if (examples.length < 8) examples.push({ src: src.label, hits, sentence });
      }
    }
  }
  return { sources: sources.length, totalSentences, truncating, byPattern, examples };
}

/* ------------------------------------------------------------------ *
 * Part 0d / Part 2: replay every marker on disk
 * ------------------------------------------------------------------ */

const RAW_RUNS = [
  ["condition-a-suggest.json", "suggest-after-r10-review1.json"],
  ["condition-a-condition-b-suggest-rerun.json", "condition-b-review.json"],
  ["deterministic-removal-off-run1.json", "suggest-after-r10-review1.json"],
  ["deterministic-removal-off-run2.json", "suggest-after-r10-review1.json"],
  ["deterministic-removal-off-run3.json", "suggest-after-r10-review1.json"],
  ["deterministic-removal-on-run1.json", "suggest-after-r10-review1.json"],
  ["deterministic-removal-on-run2.json", "suggest-after-r10-review1.json"],
  ["deterministic-removal-on-run3.json", "suggest-after-r10-review1.json"],
  ["reviser-noise-floor-run1.json", "suggest-after-r10-review1.json"],
  ["reviser-noise-floor-run2.json", "suggest-after-r10-review1.json"],
  ["reviser-noise-floor-run3.json", "suggest-after-r10-review1.json"],
];

/**
 * The honesty pass reads sentence bounds through cutSpanTextPresentInRevised
 * and containingSentenceChanged. Both are module-internal, so the only honest
 * way to compare old against new is to run the real pass and diff its events.
 * The OLD side is obtained by monkey-patching nothing: instead the previous
 * verdicts are read from the committed artefacts where present, and otherwise
 * recomputed here from the same inputs. See adjudicate().
 */
function honestyVerdicts(original, parsed, traceId) {
  const out = applyMarkerHonestyCheck(original, parsed, { traceId, log: () => {} });
  return {
    events: (out.honestyEvents || []).map((e) => ({
      contradiction: e.contradiction,
      intent: e.intent,
      repairedIntent: e.repairedIntent ?? null,
      span: e.span,
    })),
    markers: out.markers,
  };
}

async function replay() {
  const byReview = new Map();
  for (const f of ["suggest-after-r10-review1.json", "condition-b-review.json"]) {
    byReview.set(f, await statementsOf(f));
  }

  const runs = [];
  for (const [runFile, reviewFile] of RAW_RUNS) {
    if (!existsSync(path.join(OUT_DIR, runFile))) continue;
    const run = JSON.parse(await readFile(path.join(OUT_DIR, runFile), "utf8"));
    if (typeof run.raw !== "string" || !run.raw.trim()) continue;
    const statements = byReview.get(reviewFile);
    const draft = statements.map((s) => norm(s.text)).join(" ");
    const parsed = parseSoftenedMarkers(run.raw);
    const label = runFile.replace(/\.json$/, "");
    runs.push({ label, draft, parsed, statements, raw: run.raw });
  }
  return runs;
}

/**
 * Every marker's what-clause, to confirm 8145ef3's result is unmoved: 5 false
 * change-claims gone and 0 regressed. A clause claiming a change on a span the
 * alignment calls UNCHANGED is wrong, which is decidable without a human.
 */
function whatClauseReplay(runs) {
  const claimsAChange = (c) => /^(Added|Removed|Replaced|Deleted)\b/.test(norm(c));
  let markers = 0;
  let wrong = 0;
  const offenders = [];
  for (const r of runs) {
    const finalized = finalizeSuggestRevisionText(r.raw, {
      originalDraft: r.draft,
      concerns: gatherConcerns(r.statements, null),
      deterministicUnsupportedRemoval: false,
      log: () => {},
    });
    for (const m of finalized.markers) {
      markers += 1;
      const clause = buildWhatClause(r.draft, finalized.revisedDraft, m.start, m.end).clause;
      const reallyChanged =
        markerSpanAlignment(r.draft, finalized.revisedDraft, m.start, m.end).spanStatus ===
        "CHANGED";
      if (claimsAChange(clause) && !reallyChanged) {
        wrong += 1;
        offenders.push({ run: r.label, clause, span: finalized.revisedDraft.slice(m.start, m.end) });
      }
    }
  }
  return { markers, wrong, offenders };
}

/* ------------------------------------------------------------------ *
 * Part 1: the three worked examples
 * ------------------------------------------------------------------ */

const EXAMPLES = [
  [
    "decimal in a figure",
    "In June 2026, Partners Group committed to Meridian Capital Partners V, a EUR 1.2 billion flagship fund from Meridian Capital targeting lower-mid-market buyouts.",
  ],
  ["multiple and percentage", "Fund IV is currently marked at 1.9x gross MOIC and 24% gross IRR."],
  [
    "abbreviation, must still split",
    "The GP is Meridian Capital Management Ltd. It was founded in 2008.",
  ],
];

function exampleRows() {
  return EXAMPLES.map(([label, text]) => {
    const before = boundsBefore(text, 0, 3);
    const after = sentenceBoundsContaining(text, 0, 3);
    // For the abbreviation case, also bound the SECOND sentence.
    const secondAt = text.indexOf("It was founded");
    const second =
      secondAt > 0 ? sentenceBoundsContaining(text, secondAt, secondAt + 3) : null;
    return {
      label,
      text,
      before: text.slice(before.start, before.end),
      after: text.slice(after.start, after.end),
      splitsCorrectly: second ? text.slice(second.start, second.end) : null,
    };
  });
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

async function main() {
  console.log("=== PART 0b, HOW MANY SENTENCES WOULD TRUNCATE ===\n");
  const size = await sizeCorpus();
  console.log(`  ${size.sources} sources, ${size.totalSentences} sentences`);
  console.log(`  sentences the OLD bounds truncate: ${size.truncating}`);
  console.log("\n  by pattern (sentences containing it):");
  for (const [name, n] of Object.entries(size.byPattern)) {
    console.log(`    ${name.padEnd(26)} ${n}`);
  }
  console.log("\n  examples:");
  for (const ex of size.examples) {
    console.log(`    [${ex.hits.join(", ")}] ${ex.src}`);
    console.log(`      ${trunc(ex.sentence, 96)}`);
  }

  console.log("\n\n=== PART 1, THE THREE WORKED EXAMPLES ===\n");
  const rows = exampleRows();
  for (const r of rows) {
    console.log(`  ${r.label}`);
    console.log(`    before: ${JSON.stringify(r.before)}`);
    console.log(`    after : ${JSON.stringify(r.after)}`);
    if (r.splitsCorrectly !== null) {
      console.log(`    second: ${JSON.stringify(r.splitsCorrectly)}`);
    }
    console.log("");
  }

  console.log("\n=== PART 0d / PART 2, HONESTY VERDICTS ACROSS EVERY MARKER ON DISK ===\n");
  const runs = await replay();
  let totalMarkers = 0;
  const verdicts = [];
  for (const r of runs) {
    const v = honestyVerdicts(r.draft, r.parsed, r.label);
    totalMarkers += r.parsed.markers.length;
    verdicts.push({ label: r.label, events: v.events });
  }
  const eventCount = verdicts.reduce((a, v) => a + v.events.length, 0);
  console.log(`  ${runs.length} runs, ${totalMarkers} markers, ${eventCount} honesty events`);
  const byKind = {};
  for (const v of verdicts) {
    for (const e of v.events) byKind[e.contradiction] = (byKind[e.contradiction] || 0) + 1;
  }
  console.log(`  by contradiction: ${JSON.stringify(byKind)}`);

  // The honesty pass reads the bounds through module-internal helpers, so the
  // only true before-and-after is two invocations of this script: one on the
  // old code writing a baseline, one on the new code diffing against it.
  const baselinePath = path.join(OUT_DIR, "sentence-bounds-decimals.baseline.json");
  let diff = null;
  if (process.env.SBD_BASELINE === "1") {
    await writeFile(
      baselinePath,
      `${JSON.stringify({ ranAt: new Date().toISOString(), verdicts, byKind }, null, 2)}\n`,
      "utf8"
    );
    console.log(`\n  BASELINE written to ${path.basename(baselinePath)}`);
  } else if (existsSync(baselinePath)) {
    const base = JSON.parse(await readFile(baselinePath, "utf8"));
    const key = (label, e) => `${label}|${e.contradiction}|${norm(e.span)}`;
    const beforeSet = new Set(base.verdicts.flatMap((v) => v.events.map((e) => key(v.label, e))));
    const afterSet = new Set(verdicts.flatMap((v) => v.events.map((e) => key(v.label, e))));
    const appeared = [...afterSet].filter((k) => !beforeSet.has(k));
    const vanished = [...beforeSet].filter((k) => !afterSet.has(k));
    diff = { before: beforeSet.size, after: afterSet.size, appeared, vanished };
    console.log(`\n  vs baseline: ${beforeSet.size} events before, ${afterSet.size} after`);
    console.log(`  verdicts that appeared: ${appeared.length}`);
    for (const k of appeared) console.log(`    + ${trunc(k, 110)}`);
    console.log(`  verdicts that vanished: ${vanished.length}`);
    for (const k of vanished) console.log(`    - ${trunc(k, 110)}`);
    if (appeared.length === 0 && vanished.length === 0) {
      console.log("  NO HONESTY VERDICT CHANGED");
    }
  } else {
    console.log("\n  no baseline on disk; run with SBD_BASELINE=1 on the old code first");
  }

  console.log("\n\n=== PART 2, WHAT-CLAUSE REPLAY (8145ef3 must be unmoved) ===\n");
  const wc = whatClauseReplay(runs);
  console.log(`  ${wc.markers} markers, ${wc.wrong} clauses claiming a change on an unchanged span`);
  for (const o of wc.offenders) console.log(`    ${o.run}: ${trunc(o.clause, 70)}`);
  if (wc.wrong === 0) console.log("  the 5 false change-claims stay gone, nothing regressed");

  await writeFile(
    path.join(OUT_DIR, "sentence-bounds-decimals.json"),
    `${JSON.stringify(
      { ranAt: new Date().toISOString(), size, examples: rows, verdicts, byKind, diff, whatClause: wc },
      null,
      2
    )}\n`,
    "utf8"
  );

  const exampleTable = [
    "| case | before | after |",
    "| --- | --- | --- |",
    ...rows.map((r) => `| ${mdCell(r.label)} | ${mdCell(r.before)} | ${mdCell(r.after)} |`),
  ].join("\n");
  await writeFile(
    path.join(OUT_DIR, "sentence-bounds-decimals.tables.md"),
    `${exampleTable}\n`,
    "utf8"
  );
  console.log("\nwrote sentence-bounds-decimals.json and .tables.md");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
