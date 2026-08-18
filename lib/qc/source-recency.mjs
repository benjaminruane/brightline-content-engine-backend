/**
 * Source-recency / temporal-context detector.
 * Additive only: never feeds evidence verdict or Stage 2/3 classification.
 * Fail-safe: no confident structural as-of → no fire.
 */

import { extractStatementFeatures } from "./materiality.mjs";

export const SOURCE_RECENCY_THRESHOLD_MONTHS = 18;
export const SOURCE_RECENCY_CONCERN_CODE = "source_recency";

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

export function monthsBetween(from, to) {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

function formatAsOf(d) {
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatAge(ageMonths) {
  const years = ageMonths / 12;
  if (years >= 2) return `${Math.round(years)} years`;
  return `${years.toFixed(1)} years`;
}

/**
 * Confident document as-of from structural header cues only.
 * In-body content dates are ignored. Returns null when no confident anchor.
 * @returns {{ date: Date, raw: string, cue: string } | null}
 */
export function extractSourceAsOfDate(sourceText) {
  const lines = String(sourceText || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const header = lines.slice(0, 15).join("\n");
  const cues = [];

  const push = (cue, raw) => {
    const date = parseDateLoose(raw);
    if (date) cues.push({ cue, raw: String(raw).trim(), date });
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

  if (cues.length === 0) return null;
  const prefer = ["Date: label", "Dated: label", "As of [date] (header)", "As at [date] (header)"];
  cues.sort((a, b) => {
    const ia = prefer.indexOf(a.cue);
    const ib = prefer.indexOf(b.cue);
    return (ia === -1 ? 9 : ia) - (ib === -1 ? 9 : ib);
  });
  return cues[0];
}

function recencySensitiveReasons(statement, features) {
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
  return { sensitive: reasons.length > 0 && !durableOnly, reasons, durableOnly };
}

function presentedAsCurrent(statement, features) {
  const t = String(statement || "");
  const feats = Array.isArray(features) ? features : extractStatementFeatures(t);
  const present = PRESENT_RE.test(t);
  const explicitDate = feats.includes("date_period_claim") || EXPLICIT_TIMEFRAME_RE.test(t);
  return { present, explicitDate, asCurrent: present && !explicitDate };
}

/**
 * @param {{ statement: string, sourceText: string, today?: Date, thresholdMonths?: number }} args
 */
export function detectSourceRecency(args = {}) {
  const statement = typeof args.statement === "string" ? args.statement : "";
  const today = args.today instanceof Date && !Number.isNaN(args.today.getTime()) ? args.today : new Date();
  const threshold = Number.isFinite(args.thresholdMonths) ? args.thresholdMonths : SOURCE_RECENCY_THRESHOLD_MONTHS;
  const features = extractStatementFeatures(statement);
  const asOf = extractSourceAsOfDate(args.sourceText);

  if (!asOf) {
    return { fire: false, asOf: null, note: null, reasons: [] };
  }

  const ageMonths = monthsBetween(asOf.date, today);
  const stale = ageMonths > threshold;
  const sensitive = recencySensitiveReasons(statement, features);
  const current = presentedAsCurrent(statement, features);
  const fire = Boolean(stale && sensitive.sensitive && current.asCurrent);
  const note = fire
    ? `This claim rests on a source dated ${formatAsOf(asOf.date)} (${formatAge(ageMonths)} old) and is presented as current — confirm it's still accurate or add the timeframe.`
    : null;

  return {
    fire,
    asOf,
    ageMonths,
    note,
    reasons: sensitive.reasons,
  };
}

export function buildSourceRecencyConcern({ statement, note }) {
  const text = typeof statement === "string" ? statement : "";
  return {
    concernCode: SOURCE_RECENCY_CONCERN_CODE,
    category: SOURCE_RECENCY_CONCERN_CODE,
    note: typeof note === "string" ? note : "",
    span: [{ startChar: 0, endChar: text.length }],
  };
}

/**
 * Oldest confidently dated contributing source, or null.
 * @param {Array<{ text?: string, label?: string }>} sources
 * @param {number[]} sourceIndices
 */
export function selectRecencySource(sources, sourceIndices) {
  const list = Array.isArray(sources) ? sources : [];
  if (list.length === 0) return null;
  const idxs = Array.isArray(sourceIndices) && sourceIndices.length > 0
    ? sourceIndices
    : [0];
  let best = null;
  for (const i of idxs) {
    const src = list[i];
    if (!src || typeof src.text !== "string") continue;
    const asOf = extractSourceAsOfDate(src.text);
    if (!asOf) continue;
    if (!best || asOf.date < best.asOf.date) {
      best = { source: src, sourceIndex: i, asOf };
    }
  }
  return best;
}
