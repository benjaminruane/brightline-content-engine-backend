/**
 * Multi-source coverage union. Pure arithmetic on statement-side offsets.
 * A pair classified partially_confirmed contributes the complement of its
 * validated unsupportedSpan. Offsets only: null offsets contribute nothing.
 * A WHOLE-statement span has an empty complement.
 */

import { isStage2SpanEnabled } from "./pipeline-v4/stage2-match-sources.mjs";

export function isMultisourceCoverageEnabled(options = {}) {
  if (!isStage2SpanEnabled(options)) return false;
  if (options.multisourceCoverageEnabled === true) return true;
  if (options.multisourceCoverageEnabled === false) return false;
  const v = String(process.env.QC_MULTISOURCE_COVERAGE || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function asText(value) {
  return typeof value === "string" ? value : "";
}

function isFiniteOffset(n) {
  return typeof n === "number" && Number.isFinite(n);
}

/**
 * Required coverage window: the statement minus leading/trailing whitespace
 * and trailing sentence-final punctuation (. ! ?). Not used to locate spans.
 */
export function coverageWindow(statementText) {
  const t = asText(statementText);
  let start = 0;
  while (start < t.length && /\s/.test(t[start])) start += 1;
  let end = t.length;
  while (end > start && /\s/.test(t[end - 1])) end -= 1;
  while (end > start && /[.!?]/.test(t[end - 1])) end -= 1;
  while (end > start && /\s/.test(t[end - 1])) end -= 1;
  return { start, end };
}

/**
 * Supported intervals = statement minus [start, end). Empty when offsets are
 * null, invalid, or the span is the whole statement.
 */
export function supportedIntervalsFromUnsupportedSpan(statementLength, start, end) {
  const n = Number(statementLength);
  if (!Number.isFinite(n) || n <= 0) return [];
  if (!isFiniteOffset(start) || !isFiniteOffset(end)) return [];
  if (start < 0 || end < start || end > n) return [];
  if (start === 0 && end === n) return [];
  const out = [];
  if (start > 0) out.push([0, start]);
  if (end < n) out.push([end, n]);
  return out;
}

export function unionIntervals(intervals) {
  const list = [];
  for (const row of Array.isArray(intervals) ? intervals : []) {
    const s = Number(row?.[0]);
    const e = Number(row?.[1]);
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) continue;
    list.push([s, e]);
  }
  list.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged = [];
  for (const [s, e] of list) {
    if (merged.length === 0 || s > merged[merged.length - 1][1]) {
      merged.push([s, e]);
    } else {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], e);
    }
  }
  return merged;
}

export function unionCoversWindow(union, start, end) {
  const lo = Number(start);
  const hi = Number(end);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return true;
  let pos = lo;
  for (const row of Array.isArray(union) ? union : []) {
    const s = Number(row?.[0]);
    const e = Number(row?.[1]);
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) continue;
    if (e <= pos) continue;
    if (s > pos) return false;
    pos = Math.max(pos, e);
    if (pos >= hi) return true;
  }
  return pos >= hi;
}

function pairClassification(match) {
  return typeof match?.classification === "string" ? match.classification.trim() : "";
}

function isWholeSpan(match, statementLength) {
  if (match?.unsupportedSpanWhole === true) return true;
  const start = match?.unsupportedSpanStart;
  const end = match?.unsupportedSpanEnd;
  return isFiniteOffset(start) && isFiniteOffset(end) && start === 0 && end === statementLength;
}

/**
 * @param {{
 *   statementText?: string,
 *   matches?: Array<Record<string, unknown>>
 * }} params
 */
export function computeCoverageUnion({ statementText, matches } = {}) {
  const text = asText(statementText);
  const n = text.length;
  const rows = Array.isArray(matches) ? matches : [];
  const classifications = rows.map((m) => ({
    sourceIndex: Number.isFinite(Number(m?.sourceIndex)) ? Number(m.sourceIndex) : null,
    sourceLabel: typeof m?.sourceLabel === "string" ? m.sourceLabel : null,
    classification: pairClassification(m),
  }));
  const hasConflicting = classifications.some((c) => c.classification === "conflicting");
  const hasNoSupport = classifications.some((c) => c.classification === "no_support");

  const unsupportedSpans = [];
  const supportedRegions = [];
  const allSupportedIntervals = [];
  const contributingSourceIndices = [];
  let wholeContributingPairs = 0;
  let nullOffsetPartialPairs = 0;

  for (const m of rows) {
    const classification = pairClassification(m);
    if (classification !== "partially_confirmed") continue;
    const start = isFiniteOffset(m?.unsupportedSpanStart) ? m.unsupportedSpanStart : null;
    const end = isFiniteOffset(m?.unsupportedSpanEnd) ? m.unsupportedSpanEnd : null;
    const whole = isWholeSpan(m, n);
    const spanText = typeof m?.unsupportedSpan === "string" ? m.unsupportedSpan : null;
    unsupportedSpans.push({
      sourceIndex: Number.isFinite(Number(m?.sourceIndex)) ? Number(m.sourceIndex) : null,
      sourceLabel: typeof m?.sourceLabel === "string" ? m.sourceLabel : null,
      classification,
      text: spanText,
      start,
      end,
      whole,
    });
    if (whole) {
      wholeContributingPairs += 1;
      supportedRegions.push({
        sourceIndex: Number.isFinite(Number(m?.sourceIndex)) ? Number(m.sourceIndex) : null,
        intervals: [],
        emptyBecause: "whole",
      });
      continue;
    }
    if (start == null || end == null) {
      nullOffsetPartialPairs += 1;
      supportedRegions.push({
        sourceIndex: Number.isFinite(Number(m?.sourceIndex)) ? Number(m.sourceIndex) : null,
        intervals: [],
        emptyBecause: "null_offsets",
      });
      continue;
    }
    const intervals = supportedIntervalsFromUnsupportedSpan(n, start, end);
    supportedRegions.push({
      sourceIndex: Number.isFinite(Number(m?.sourceIndex)) ? Number(m.sourceIndex) : null,
      intervals,
      emptyBecause: intervals.length === 0 ? "empty_complement" : null,
    });
    if (intervals.length > 0) {
      allSupportedIntervals.push(...intervals);
      const src = Number(m?.sourceIndex);
      if (Number.isFinite(src) && !contributingSourceIndices.includes(src)) {
        contributingSourceIndices.push(src);
      }
    }
  }

  contributingSourceIndices.sort((a, b) => a - b);
  const union = unionIntervals(allSupportedIntervals);
  const window = coverageWindow(text);
  const coverageComplete = unionCoversWindow(union, window.start, window.end);

  return {
    classifications,
    unsupportedSpans,
    supportedRegions,
    union,
    coverageWindow: window,
    coverageComplete,
    hasConflicting,
    hasNoSupport,
    wholeContributingPairs,
    nullOffsetPartialPairs,
    contributingSourceIndices,
    contributingSourceCount: contributingSourceIndices.length,
  };
}

/**
 * Promote a current partially_confirmed verdict to confirmed when the union
 * of supported regions covers the statement, no pair is conflicting, and at
 * least two distinct sources contribute.
 */
export function shouldPromoteCoverageUnion({ verdict, coverage } = {}) {
  if (verdict !== "partially_confirmed") return false;
  if (!coverage || coverage.coverageComplete !== true) return false;
  if (coverage.hasConflicting === true) return false;
  if (!Number.isFinite(coverage.contributingSourceCount) || coverage.contributingSourceCount < 2) {
    return false;
  }
  return true;
}

export function coverageUnionPromotionRecord(coverage) {
  return {
    promoted: true,
    contributingSourceIndices: Array.isArray(coverage?.contributingSourceIndices)
      ? coverage.contributingSourceIndices.slice()
      : [],
    union: Array.isArray(coverage?.union) ? coverage.union.map((pair) => pair.slice()) : [],
  };
}
