/**
 * B379 Parts 2 and 3. Read-only. How much of the author's wording is
 * shared with the passage matched to the statement, and does that
 * line up with the verdict?
 *
 * Content words only. Stopwords dropped. Case and punctuation
 * normalised. The fraction is a measurement of these stored cards.
 * It is not a threshold and it is not a matcher.
 *
 * Passage used: confirmed supportSpans, plus primaryExcerpt when that
 * excerpt is under 2000 characters. A longer primaryExcerpt on these
 * payloads is the source pasted whole, and is reported separately
 * rather than treated as the matched passage.
 *
 * Run: node scripts/diagnostic/b379/paraphrase-axis.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const CLEAN = [
  ["2026-09-29/clean", "tests/fixtures/real-runs-2026-09-29/clean-review.json"],
  ["2026-10-04-hicl/clean", "tests/fixtures/real-runs-2026-10-04-hicl/clean-review.json"],
  ["2026-10-06-gpi/clean-run2", "tests/fixtures/real-runs-2026-10-06-gpi/clean-run2-review.json"],
  ["2026-10-06-gpi/clean-run3", "tests/fixtures/real-runs-2026-10-06-gpi/clean-run3-review.json"],
  ["2026-10-06-gpi/clean-run4", "tests/fixtures/real-runs-2026-10-06-gpi/clean-run4-review.json"],
  ["2026-10-06-gpi/clean-run5", "tests/fixtures/real-runs-2026-10-06-gpi/clean-run5-review.json"],
  ["2026-10-06-clearpoint/clean1", "tests/fixtures/real-runs-2026-10-06-clearpoint/clean1-review.json"],
  ["2026-10-06-clearpoint/clean2", "tests/fixtures/real-runs-2026-10-06-clearpoint/clean2-review.json"],
  ["2026-10-06-clearpoint/clean3", "tests/fixtures/real-runs-2026-10-06-clearpoint/clean3-review.json"],
];

const DOCTORED = [
  ["2026-09-29/doc", "tests/fixtures/real-runs-2026-09-29/doc-review.json"],
  ["2026-10-02/doc", "tests/fixtures/real-runs-2026-10-02/doc-review.json"],
  ["2026-10-04-hicl/doc", "tests/fixtures/real-runs-2026-10-04-hicl/doc-review.json"],
  ["2026-10-06-gpi/doc", "tests/fixtures/real-runs-2026-10-06-gpi/doc-review.json"],
  ["2026-10-06-clearpoint/dirty1", "tests/fixtures/real-runs-2026-10-06-clearpoint/dirty1-review.json"],
];

const PLANTED = [
  ["2026-09-29/doc", "8", "Action renamed to MAIT"],
  ["2026-09-29/doc", "12", "gains widened from TCR to essentially all investments"],
  ["2026-09-29/doc", "14", "management rewritten as the UK government"],
  ["2026-10-02/doc", "14", "management rewritten as the UK government"],
  ["2026-10-04-hicl/doc", "0", "HCIL, and six months to 31 December 2025"],
  ["2026-10-04-hicl/doc", "1", "average 30% EBITDA growth"],
  ["2026-10-04-hicl/doc", "2", "significantly outperform budgets"],
  ["2026-10-04-hicl/doc", "7", "new CFO, French government, electricity sector"],
  ["2026-10-06-gpi/doc", "0", "October 2025, 75% of capacity, escalating oil prices"],
  ["2026-10-06-gpi/doc", "2", "enhancing site security"],
  ["2026-10-06-clearpoint/dirty1", "3", "segment called the vast majority of total revenue"],
  ["2026-10-06-clearpoint/dirty1", "8", "FDA for Health Canada, and commenced for completed"],
  ["2026-10-06-clearpoint/dirty1", "9", "USD 56 million for 2027"],
];

const STOP = new Set(
  "a an the of to for in on at as from with and or by its their this that is are was were be been has have had will would can which while into over than also it not but these those per via within across about after before during between under our his her they them we you your such both more most other only just may might should shall do does did being its".split(
    " ",
  ),
);

const LONG_EXCERPT = 2000;

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9%.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function contentWords(s) {
  const seen = [];
  const bag = new Set();
  for (const w of norm(s).split(" ")) {
    if (!w || w.length < 2 || STOP.has(w) || bag.has(w)) continue;
    bag.add(w);
    seen.push(w);
  }
  return seen;
}

function overlap(statement, passage) {
  const left = contentWords(statement);
  const right = new Set(contentWords(passage));
  if (!left.length || !passage) return { shared: 0, total: left.length, ratio: null };
  const shared = left.filter((w) => right.has(w));
  return { shared: shared.length, total: left.length, ratio: shared.length / left.length, words: shared };
}

function load(rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));
}

function passageParts(card) {
  const spans = (card.supportSpans || []).filter((span) => span.classification === "confirmed");
  const spanText = spans.map((span) => span.passage || "").filter(Boolean).join("\n");
  const excerpt = card.primaryExcerpt || "";
  const long = excerpt.length >= LONG_EXCERPT;
  const used = [spanText, !long && excerpt ? excerpt : ""].filter(Boolean).join("\n");
  return { spanText, excerpt, long, used, confirmedSpans: spans.length };
}

function measureCard(payload, row) {
  const card = row.qcCard || {};
  const statement = card.statement || row.text || "";
  const parts = passageParts(card);
  const used = overlap(statement, parts.used);
  const spanOnly = overlap(statement, parts.spanText);
  const excerptOnly = overlap(statement, parts.excerpt);
  return {
    payload,
    statementId: String(row.id),
    verdict: card.displayVerdict || null,
    supportState: card.supportState || null,
    statement,
    comment: card.evidenceSummary || "",
    confirmedSpans: parts.confirmedSpans,
    excerptChars: (card.primaryExcerpt || "").length,
    longExcerpt: parts.long,
    noTightPassage: !parts.used,
    overlap: used.ratio,
    shared: used.shared,
    contentWords: used.total,
    sharedWords: used.words || [],
    spanOverlap: spanOnly.ratio,
    excerptOverlap: excerptOnly.ratio,
    spanPassage: parts.spanText,
    excerpt: parts.long ? "" : parts.excerpt,
  };
}

const cleanRows = [];
for (const [id, rel] of CLEAN) {
  for (const row of load(rel).statements || []) cleanRows.push(measureCard(id, row));
}

const byId = new Map();
for (const [id, rel] of DOCTORED) {
  for (const row of load(rel).statements || []) byId.set(id + "#" + row.id, measureCard(id, row));
}

const misses = [];
for (const [payload, statementId, fault] of PLANTED) {
  const row = byId.get(payload + "#" + statementId);
  if (!row) {
    console.error("MISSING PLANTED", payload, statementId);
    process.exitCode = 1;
    continue;
  }
  if (row.verdict === "conflict") {
    console.error("PLANTED WAS A CONFLICT", payload, statementId, row.verdict);
    process.exitCode = 1;
  }
  misses.push({ ...row, side: "doctored-miss", fault });
}

function band(verdict) {
  if (verdict === "supported_full") return "green";
  if (verdict === "supported_partial") return "amber";
  if (verdict === "unverifiable") return "unverifiable";
  if (verdict === "conflict" || verdict === "not_supported") return "red";
  return "other";
}

function fmt(ratio) {
  if (ratio == null) return "none";
  return ratio.toFixed(2);
}

function median(values) {
  const nums = values.filter((n) => n != null).sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

const summary = {};
for (const row of cleanRows) {
  const key = band(row.verdict);
  if (!summary[key]) summary[key] = [];
  summary[key].push(row.overlap);
}

const axis = [
  ...cleanRows.map((row) => ({ ...row, side: "clean", fault: null })),
  ...misses,
].sort((a, b) => {
  const av = a.overlap == null ? -1 : a.overlap;
  const bv = b.overlap == null ? -1 : b.overlap;
  return av - bv || a.payload.localeCompare(b.payload) || Number(a.statementId) - Number(b.statementId);
});

const namedIds = new Set([
  "2026-10-06-clearpoint/clean1#2",
  "2026-10-06-clearpoint/clean2#2",
  "2026-10-06-clearpoint/clean3#2",
  "2026-10-06-clearpoint/clean1#5",
  "2026-10-06-clearpoint/clean2#5",
  "2026-10-06-clearpoint/clean3#5",
  "2026-10-04-hicl/clean#6",
]);

const named = [...cleanRows, ...misses].filter((row) => namedIds.has(row.payload + "#" + row.statementId));

const out = {
  cleanStatements: cleanRows.length,
  doctoredMisses: misses.length,
  longExcerptRule: "primaryExcerpt of 2000 characters or more is the source pasted whole and is left out of the passage used for the fraction",
  byBand: Object.fromEntries(
    Object.entries(summary).map(([key, values]) => [
      key,
      {
        n: values.length,
        withPassage: values.filter((n) => n != null).length,
        min: values.filter((n) => n != null).length ? Math.min(...values.filter((n) => n != null)) : null,
        median: median(values),
        max: values.filter((n) => n != null).length ? Math.max(...values.filter((n) => n != null)) : null,
      },
    ]),
  ),
  axis,
  named,
  misses,
};

const outPath = path.join(root, "scripts/diagnostic/b379/paraphrase-axis.json");
fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");

console.log("clean statements", cleanRows.length);
console.log("doctored misses (planted, not called conflict)", misses.length);
console.log("\nCLEAN BY BAND");
for (const [key, stats] of Object.entries(out.byBand)) {
  console.log(
    `${key}\tn=${stats.n}\twithPassage=${stats.withPassage}\tmin=${fmt(stats.min)}\tmedian=${fmt(stats.median)}\tmax=${fmt(stats.max)}`,
  );
}

console.log("\nAXIS overlap | shared/words | side | payload | S | verdict | note");
for (const row of axis) {
  const note = row.fault || (row.longExcerpt ? "long excerpt excluded" : row.noTightPassage ? "no tight passage" : "");
  console.log(
    `${fmt(row.overlap)}\t${row.shared}/${row.contentWords}\t${row.side}\t${row.payload}\tS${row.statementId}\t${row.verdict}\t${note}`,
  );
}

console.log("\nNAMED");
for (const row of named) {
  console.log("\n==", row.payload, "S" + row.statementId, row.verdict, "overlap", fmt(row.overlap), `${row.shared}/${row.contentWords}`);
  console.log("statement:", row.statement);
  console.log("comment:", row.comment);
  console.log("spanOverlap", fmt(row.spanOverlap), "excerptOverlap", fmt(row.excerptOverlap), "excerptChars", row.excerptChars, "spans", row.confirmedSpans);
  console.log("SPAN:", (row.spanPassage || "").replace(/\s+/g, " ").slice(0, 500));
  console.log("EXCERPT:", (row.excerpt || "").replace(/\s+/g, " ").slice(0, 500));
  console.log("shared:", (row.sharedWords || []).join(" "));
}

console.log("\nMISSES");
for (const row of misses) {
  console.log(
    `${fmt(row.overlap)}\t${row.shared}/${row.contentWords}\t${row.payload} S${row.statementId} ${row.verdict}\t${row.fault}`,
  );
}
