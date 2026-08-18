#!/usr/bin/env node
/**
 * Source-recency / temporal-context detector — PROTOTYPE, read-only.
 * Does NOT call the pipeline, does NOT write qcCard fields, does NOT change verdicts.
 *
 * Usage:
 *   node scripts/diagnostic/r7-source-recency-prototype.mjs
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { extractStatementFeatures } from "../../lib/qc/materiality.mjs";
import { loadAllFixtures } from "./lib/fixtures.mjs";
import { RUNS_DIR, SOURCES_DIR, SOURCES_EXTRACTED_DIR } from "./lib/paths.mjs";

const TODAY = new Date("2026-08-18T00:00:00Z");
const THRESHOLD_MONTHS = 18;

const MONTHS =
  "January|February|March|April|May|June|July|August|September|October|November|December";
const MONTHS_ABBR = "Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec";
const MONTH = `(?:${MONTHS}|${MONTHS_ABBR})`;
const DATE_CORE = new RegExp(
  `(?:(?:${MONTH})\\s+\\d{1,2},?\\s+(?:19|20)\\d{2}|\\d{1,2}\\s+(?:${MONTH})\\s+(?:19|20)\\d{2}|(?:19|20)\\d{2}-\\d{2}-\\d{2}|(?:${MONTH})\\s+(?:19|20)\\d{2})`,
  "i"
);

const B13_METRIC_FEATURES = new Set(["monetary_figure", "percentage_metric"]);

const SIZE_STAGE_RE =
  /\b(?:small startup|startup|early[- ]stage|scale[- ]up|category leader|market leader|leading|dominant|largest|number one|#1)\b/i;
const COUNT_RE =
  /\b[\d,'’]+(?:\s*(?:to|-)\s*[\d,'’]+)?\s+(?:customers?|employees?|people|staff|users|merchants|stores?|professionals)\b/i;
const DURATION_RE =
  /(?:~|approximately|roughly|about)?\s*[\d,'’.]+(?:\.\d+)?\s*(?:minutes?|hours?|days?|weeks?|months?|seconds?)\b/i;
const FRACTION_RE =
  /\b(?:two[- ]thirds|three[- ]quarters|four[- ]fifths|one[- ]third|a third|one[- ]half|a half|half|one[- ]quarter|a quarter|\d+\s*\/\s*\d+)\b/i;
const OPERATING_UNIT_RE =
  /\b[\d,'’]+(?:\.\d+)?\s+(?:times(?:\s+per\s+(?:week|day|month))?|sessions?|pins?|items?(?:\s+per\s+(?:week|day|month))?|sign[- ]?ups?)\b/i;
const EVENT_VERB_RE =
  /\b(?:invested|acquired|launched|raised|completed|sold|exited|closed)\b/i;
const DURABLE_RE =
  /\b(?:headquartered|founded(?:\s+in)?)\b|\bis an?\s+(?:[\w'-]+\s+){0,5}(?:platform|company|provider|manufacturer|firm|business|software)\b/i;
const PRESENT_RE =
  /\b(?:is|are|has|have|serves|serving|operates|operating|employs|employing|continues|remain(?:s|ing)?|holds?|represents?|accounts?\s+for|stands?\s+at|averages?|numbers\s+\d)\b/i;
const EXPLICIT_TIMEFRAME_RE =
  /\b(?:last year|this year|next year|a year ago|to date|today|yesterday|since\s+(?:19|20)\d{2}|in\s+(?:19|20)\d{2}|over the(?: same)? period|trailing twelve|year[- ]to[- ]date|YTD|as of|as at)\b/i;

const CORPUS_RUN = "2026-08-16-172115";
const ADVERSARIAL_RUNS = {
  "90": "2026-08-18-124010",
  "91": "2026-08-18-124030",
  "92": "2026-08-18-124044",
};

function parseDateLoose(raw) {
  const s = String(raw || "").trim().replace(/,/g, "");
  if (!s) return null;
  const iso = s.match(/^((?:19|20)\d{2})-(\d{2})-(\d{2})$/);
  if (iso) return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
  const m1 = s.match(new RegExp(`^(${MONTH})\\s+(\\d{1,2})\\s+((?:19|20)\\d{2})$`, "i"));
  if (m1) return new Date(`${m1[1]} ${m1[2]}, ${m1[3]} UTC`);
  const m2 = s.match(new RegExp(`^(\\d{1,2})\\s+(${MONTH})\\s+((?:19|20)\\d{2})$`, "i"));
  if (m2) return new Date(`${m2[2]} ${m2[1]}, ${m2[3]} UTC`);
  const m3 = s.match(new RegExp(`^(${MONTH})\\s+((?:19|20)\\d{2})$`, "i"));
  if (m3) return new Date(`${m3[1]} 1, ${m3[2]} UTC`);
  const d = new Date(`${s} UTC`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function monthsBetween(from, to) {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

function formatAsOf(d) {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** High-confidence as-of from source header cues only (Date:, dateline, As of). */
export function extractSourceAsOfDate(sourceText) {
  const lines = String(sourceText || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const header = lines.slice(0, 15).join("\n");
  const cues = [];

  const push = (cue, raw) => {
    const d = parseDateLoose(raw);
    if (d) cues.push({ cue, raw: String(raw).trim(), date: d });
  };

  let m = header.match(new RegExp(`\\bDate:\\s*(${DATE_CORE.source})`, "i"));
  if (m) push("Date: label", m[1]);
  m = header.match(new RegExp(`\\bDated:\\s*(${DATE_CORE.source})`, "i"));
  if (m) push("Dated: label", m[1]);
  m = header.match(new RegExp(`\\bAs of\\s+(${DATE_CORE.source})`, "i"));
  if (m) push("As of [date] (header)", m[1]);
  m = header.match(new RegExp(`\\bAs at\\s+(${DATE_CORE.source})`, "i"));
  if (m) push("As at [date] (header)", m[1]);
  m = header.match(new RegExp(`(?:^|\\n)[A-Z][^\\n]{2,80}\\s+[—\\-–]\\s+(${DATE_CORE.source})\\b`));
  if (m) push("dateline (city — date)", m[1]);
  m = header.match(new RegExp(`(?:^|\\n)[A-Z][^\\n]{2,80};\\s+(${DATE_CORE.source})\\b`));
  if (m) push("location; date header", m[1]);
  for (const ln of lines.slice(0, 6)) {
    const stripped = ln.replace(/[.;]$/, "");
    if (DATE_CORE.test(stripped) && stripped.length < 40) push("standalone header date line", stripped);
  }

  if (cues.length === 0) return { found: false, confidence: "none", date: null, raw: null, cue: null };
  const prefer = ["Date: label", "Dated: label", "As of [date] (header)", "As at [date] (header)"];
  cues.sort((a, b) => {
    const ia = prefer.indexOf(a.cue);
    const ib = prefer.indexOf(b.cue);
    return (ia === -1 ? 9 : ia) - (ib === -1 ? 9 : ib);
  });
  const hit = cues[0];
  return { found: true, confidence: "high", date: hit.date, raw: hit.raw, cue: hit.cue };
}

function asOfFromMatcherText(text) {
  const t = String(text || "");
  const m = t.match(new RegExp(`\\bas of\\s+(${DATE_CORE.source})`, "i"));
  if (!m) return null;
  const d = parseDateLoose(m[1]);
  if (!d) return null;
  return { found: true, confidence: "high", date: d, raw: m[1], cue: "matcher 'as of [date]'" };
}

export function recencySensitiveReasons(statement, features) {
  const t = String(statement || "");
  const feats = Array.isArray(features) ? features : extractStatementFeatures(t);
  const reasons = [];
  if (feats.some((f) => B13_METRIC_FEATURES.has(f))) reasons.push("b13_metric");
  if (COUNT_RE.test(t)) reasons.push("headcount_or_customer_count");
  if (DURATION_RE.test(t)) reasons.push("duration_metric");
  if (FRACTION_RE.test(t)) reasons.push("fraction_or_ratio");
  if (OPERATING_UNIT_RE.test(t)) reasons.push("operating_unit_metric");
  if (SIZE_STAGE_RE.test(t)) reasons.push("size_stage_or_market_position");
  if (EVENT_VERB_RE.test(t)) reasons.push("datable_event_verb");

  const durableOnly = DURABLE_RE.test(t) && reasons.length === 0;
  return { sensitive: reasons.length > 0 && !durableOnly, reasons, durableOnly, features: feats };
}

export function presentedAsCurrent(statement, features) {
  const t = String(statement || "");
  const feats = Array.isArray(features) ? features : extractStatementFeatures(t);
  const present = PRESENT_RE.test(t);
  const explicitDate = feats.includes("date_period_claim") || EXPLICIT_TIMEFRAME_RE.test(t);
  return { present, explicitDate, asCurrent: present && !explicitDate };
}

/**
 * Pure detector. Returns a fire object or null.
 * @param {{ statement: string, sourceText: string, matcherBlob?: string, today?: Date, thresholdMonths?: number }} args
 */
export function detectSourceRecency(args) {
  const statement = args.statement || "";
  const today = args.today || TODAY;
  const threshold = args.thresholdMonths ?? THRESHOLD_MONTHS;
  const features = extractStatementFeatures(statement);

  let asOf = extractSourceAsOfDate(args.sourceText);
  if (!asOf.found) {
    const fromMatcher = asOfFromMatcherText(args.matcherBlob || "");
    if (fromMatcher) asOf = fromMatcher;
  }

  const cond1 = asOf.found && asOf.confidence === "high" && monthsBetween(asOf.date, today) > threshold;
  const ageMonths = asOf.found ? monthsBetween(asOf.date, today) : null;
  const sensitive = recencySensitiveReasons(statement, features);
  const current = presentedAsCurrent(statement, features);

  const fire = Boolean(cond1 && sensitive.sensitive && current.asCurrent);
  const ageYears = ageMonths != null ? ageMonths / 12 : null;
  const note = fire
    ? `This claim rests on a source dated ${formatAsOf(asOf.date)} (${ageYears >= 2 ? `${Math.round(ageYears)} years` : `${ageYears.toFixed(1)} years`} old) and is presented as current — confirm it's still accurate or add the timeframe.`
    : null;

  return {
    fire,
    asOf,
    ageMonths,
    ageYears,
    cond1_staleSource: Boolean(cond1),
    cond2_recencySensitive: sensitive.sensitive,
    cond2_reasons: sensitive.reasons,
    cond2_durableOnly: sensitive.durableOnly,
    cond3_asCurrent: current.asCurrent,
    cond3_present: current.present,
    cond3_explicitDate: current.explicitDate,
    features,
    note,
  };
}

function sourceFilename(entry) {
  if (typeof entry === "string") return entry;
  return entry?.file || entry?.filename || "";
}

async function loadSourceText(fname) {
  const base = path.basename(fname);
  if (base.toLowerCase().endsWith(".pdf")) {
    const p = path.join(SOURCES_EXTRACTED_DIR, base.replace(/\.pdf$/i, ".txt"));
    try {
      return await readFile(p, "utf8");
    } catch {
      return "";
    }
  }
  try {
    return await readFile(path.join(SOURCES_DIR, base), "utf8");
  } catch {
    return "";
  }
}

async function loadRun(ts) {
  const root = path.isAbsolute(ts) ? ts : path.join(RUNS_DIR, ts);
  const names = (await readdir(root, { withFileTypes: true })).filter((d) => d.isDirectory());
  const byId = new Map();
  for (const dir of names) {
    try {
      const data = JSON.parse(await readFile(path.join(root, dir.name, "result.json"), "utf8"));
      byId.set(String(data.fixtureId).padStart(2, "0"), data);
    } catch {
      /* skip */
    }
  }
  return byId;
}

function trunc(s, n = 88) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
}

function matchedSourceIndices(entry) {
  const matches = Array.isArray(entry.sourceMatches) ? entry.sourceMatches : [];
  const contrib = entry?.verdictResult?.contributingSourceIndices;
  if (Array.isArray(contrib) && contrib.length) return contrib;
  return matches.filter((m) => m.classification && m.classification !== "no_support").map((m) => m.sourceIndex);
}

async function evaluateFixture(fx, runData) {
  const fid = String(fx.data.id).padStart(2, "0");
  const entries = fx.data.sources || [];
  const sourceTexts = [];
  for (const entry of entries) {
    const fname = sourceFilename(entry);
    sourceTexts.push({ fname, text: await loadSourceText(fname) });
  }
  const data = runData.get(fid);
  if (!data) return { fid, label: fx.data.label, missing: true, rows: [] };
  const stage2 = data?.pipelineResult?.stage2 || [];
  const rows = [];
  for (const e of stage2) {
    const idxs = matchedSourceIndices(e);
    const matcherBlob = (e.sourceMatches || [])
      .map((m) => `${m.explanation || ""} ${m.passage || ""}`)
      .join(" ");
    // Oldest confidently dated contributing source (stale-evidence risk).
    let chosen = sourceTexts[idxs[0] ?? 0] || sourceTexts[0];
    let chosenAsOf = chosen ? extractSourceAsOfDate(chosen.text) : { found: false };
    for (const i of idxs) {
      const src = sourceTexts[i];
      if (!src) continue;
      const a = extractSourceAsOfDate(src.text);
      if (!a.found) continue;
      if (!chosenAsOf.found || a.date < chosenAsOf.date) {
        chosen = src;
        chosenAsOf = a;
      }
    }
    const det = detectSourceRecency({
      statement: e.statementText || "",
      sourceText: chosen?.text || "",
      matcherBlob,
      today: TODAY,
      thresholdMonths: THRESHOLD_MONTHS,
    });
    rows.push({
      fid,
      label: fx.data.label,
      index: e.statementIndex,
      statement: e.statementText || "",
      verdict: e?.verdictResult?.verdict,
      source: chosen?.fname,
      det,
    });
  }
  return { fid, label: fx.data.label, missing: false, rows };
}

function fpHint(row) {
  const d = row.det;
  const t = row.statement;
  if (d.cond2_durableOnly) return "likely FP — durable categorical";
  if (d.ageMonths != null && d.ageMonths <= THRESHOLD_MONTHS) return "likely FP — recent source";
  if (/\b(?:headquartered|founded)\b/i.test(t) && d.cond2_reasons.includes("datable_event_verb") === false && !d.cond2_reasons.includes("b13_metric")) {
    return "check — may be durable is-a / HQ";
  }
  if (/\bhas invested\b/i.test(t) || /\bsmall startup\b/i.test(t)) return "true positive candidate";
  if (d.cond2_reasons.includes("size_stage_or_market_position") && /leading|dominant/.test(t.toLowerCase()) && !d.cond2_reasons.includes("b13_metric") && !d.cond2_reasons.includes("headcount_or_customer_count")) {
    return "check — 'leading/dominant' without a figure";
  }
  return "";
}

async function main() {
  const fixtures = await loadAllFixtures();
  const numbered = fixtures.filter((f) => /^\d+$/.test(String(f.data.id)));
  const corpusFx = numbered.filter((f) => {
    const n = parseInt(String(f.data.id), 10);
    return n >= 1 && n <= 23;
  });
  const advFx = numbered.filter((f) => ["90", "91", "92"].includes(String(f.data.id).padStart(2, "0")));

  const corpusRun = await loadRun(CORPUS_RUN);
  const advRuns = new Map();
  for (const [id, ts] of Object.entries(ADVERSARIAL_RUNS)) {
    const m = await loadRun(ts);
    const row = m.get(id);
    if (row) advRuns.set(id, row);
  }

  console.log(`# Source-recency prototype`);
  console.log(`Today=${TODAY.toISOString().slice(0, 10)} threshold=${THRESHOLD_MONTHS} months`);
  console.log(`Corpus run=${CORPUS_RUN}; F90–92=${Object.values(ADVERSARIAL_RUNS).join(", ")}`);
  console.log("");

  console.log(`## F90–92 gate`);
  for (const fx of advFx) {
    const fid = String(fx.data.id).padStart(2, "0");
    const runMap = new Map([[fid, advRuns.get(fid)]]);
    const ev = await evaluateFixture(fx, runMap);
    for (const r of ev.rows) {
      const d = r.det;
      const asOf = d.asOf.found ? `${d.asOf.raw} (${d.ageMonths} mo)` : "none";
      console.log(
        `- F${r.fid} S${r.index} fire=${d.fire} verdict=${r.verdict} asOf=${asOf} c1=${d.cond1_staleSource} c2=${d.cond2_recencySensitive} [${d.cond2_reasons.join(",") || "—"}] c3=${d.cond3_asCurrent} (present=${d.cond3_present} dated=${d.cond3_explicitDate})`
      );
      console.log(`  ${trunc(r.statement, 110)}`);
      if (d.note) console.log(`  NOTE: ${d.note}`);
    }
  }

  const corpusRows = [];
  let stmtN = 0;
  for (const fx of corpusFx) {
    const ev = await evaluateFixture(fx, corpusRun);
    stmtN += ev.rows.length;
    corpusRows.push(...ev.rows);
  }
  const fires = corpusRows.filter((r) => r.det.fire);

  console.log("");
  console.log(`## Corpus 01–23`);
  console.log(`Statements=${stmtN} fires=${fires.length} (${stmtN ? ((fires.length / stmtN) * 100).toFixed(1) : 0}%)`);
  console.log("");
  console.log(`| Fix | Stmt | Age | Sensitive | Statement | FP note |`);
  console.log(`|---|---|---|---|---|---|`);
  for (const r of fires) {
    const d = r.det;
    console.log(
      `| F${r.fid} | S${r.index} | ${d.asOf.raw} / ${d.ageMonths}mo | ${d.cond2_reasons.join("+")} | ${trunc(r.statement, 70)} | ${fpHint(r)} |`
    );
  }
  if (fires.length === 0) console.log(`| — | — | none | — | — | — |`);

  console.log("");
  console.log(`### Fire details`);
  for (const r of fires) {
    const d = r.det;
    console.log(`\nF${r.fid} S${r.index} [${r.verdict}] ${d.asOf.cue}=${d.asOf.raw}`);
    console.log(`  ${r.statement}`);
    console.log(`  reasons=${d.cond2_reasons.join(", ")} features=${d.features.join(", ") || "—"}`);
    console.log(`  ${d.note}`);
    const hint = fpHint(r);
    if (hint) console.log(`  FLAG: ${hint}`);
  }

  const nearMissStale = corpusRows.filter((r) => r.det.cond1_staleSource && !r.det.fire);
  console.log("");
  console.log(`## Near-misses (stale source, did not fire) n=${nearMissStale.length}`);
  for (const r of nearMissStale.slice(0, 25)) {
    const d = r.det;
    console.log(
      `- F${r.fid} S${r.index} c2=${d.cond2_recencySensitive} [${d.cond2_reasons.join(",") || (d.cond2_durableOnly ? "durable" : "—")}] c3=${d.cond3_asCurrent} dated=${d.cond3_explicitDate} | ${trunc(r.statement, 80)}`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
