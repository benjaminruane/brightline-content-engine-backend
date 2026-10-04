/**
 * B372 Part 3. Find a source date about the same subject as the statement
 * date, whether or not the value matches, then let B345 compare.
 * Closed period cues. No Jaccard. No new model call.
 *
 * A date with no period cue (document dateline, as-at without a year) is
 * not a subject we compare. No date of that family in the source means
 * no span is added and no comparison runs.
 */

import { annotateTokens } from "../revise-actions/conflict-engagement.mjs";
import { splitSentences } from "./card-honesty.mjs";

const PERIOD_CUES =
  /\b(?:months?\s+to|months?\s+ending|period\s+from|period\s+to|relates to the period|reporting periods?\s+ending)\b/i;
const YEAR_CUES = /\b(?:year ending|year ended|year to|financial year)\b/i;
const MONTH_COUNT_RE = /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+)\s+months?\b/i;
const MONTH_COUNT_WORDS = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

function asText(value) {
  return typeof value === "string" ? value : "";
}

function normalizePassage(value) {
  return asText(value)
    .replace(/^[•\-\u2022]+\s*/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function periodMonthCount(token) {
  const frag = `${asText(token?.fragment)} ${asText(token?.qualifierText)}`;
  const m = frag.match(MONTH_COUNT_RE);
  if (!m) return null;
  const word = String(m[1] || "").toLowerCase();
  if (Object.prototype.hasOwnProperty.call(MONTH_COUNT_WORDS, word)) return MONTH_COUNT_WORDS[word];
  const n = Number(word);
  return Number.isFinite(n) ? n : null;
}

export function dateSubjectFamily(token) {
  if (!token || token.kind !== "date") return null;
  const frag = `${asText(token.fragment)} ${asText(token.qualifierText)}`;
  if (YEAR_CUES.test(frag)) return "year_end";
  if (PERIOD_CUES.test(frag)) return "reporting_period";
  return null;
}

export function datesSameSubject(draft, source) {
  if (!draft || !source) return false;
  if (draft.kind !== "date" || source.kind !== "date") return false;
  if (draft.month == null || draft.year == null) return false;
  if (source.month == null || source.year == null) return false;
  if (draft.day != null && source.day == null) return false;
  if (source.day != null && draft.day == null) return false;
  if (draft.rangeRole && source.rangeRole && draft.rangeRole !== source.rangeRole) return false;
  const a = dateSubjectFamily(draft);
  const b = dateSubjectFamily(source);
  if (!a || !b || a !== b) return false;
  const ca = periodMonthCount(draft);
  const cb = periodMonthCount(source);
  if (ca != null && cb != null && ca !== cb) return false;
  return true;
}

export function dateValuesDiffer(draft, source) {
  if (!datesSameSubject(draft, source)) return false;
  if (draft.year !== source.year) return true;
  if (draft.month !== source.month) return true;
  if (draft.day != null && source.day != null && draft.day !== source.day) return true;
  return false;
}

function statementDates(statement) {
  return annotateTokens(asText(statement)).filter((t) => t.kind === "date" && dateSubjectFamily(t));
}

function scoredSentences(sourceText) {
  const t = asText(sourceText);
  const chunks = splitSentences(t);
  const rows = [];
  let offset = 0;
  for (const sentence of chunks) {
    let lineStart = 0;
    for (let i = 0; i <= sentence.length; i += 1) {
      if (i < sentence.length && sentence[i] !== "\n") continue;
      const text = sentence.slice(lineStart, i);
      if (text.trim()) {
        rows.push({
          text,
          start: offset + lineStart,
          end: offset + i,
        });
      }
      lineStart = i + 1;
    }
    offset += sentence.length;
  }
  return rows;
}

/**
 * One source sentence that carries a date of the same subject family as a
 * statement date. Prefers an agreeing date, then a disagreeing one.
 */
export function locateDateSubjectSentence({ statement, sourceText, sourceLabel } = {}) {
  const source = asText(sourceText);
  const stmtDates = statementDates(statement);
  if (!source.trim() || stmtDates.length === 0) return null;
  const rows = scoredSentences(source);
  const hits = [];
  for (const row of rows) {
    const srcDates = annotateTokens(row.text).filter((t) => t.kind === "date");
    let disagrees = false;
    let agrees = false;
    for (const draft of stmtDates) {
      for (const src of srcDates) {
        if (!datesSameSubject(draft, src)) continue;
        if (dateValuesDiffer(draft, src)) disagrees = true;
        else agrees = true;
      }
    }
    if (!disagrees && !agrees) continue;
    hits.push({ ...row, disagrees, agrees });
  }
  if (hits.length === 0) return null;
  hits.sort((a, b) => {
    if (a.agrees !== b.agrees) return a.agrees ? -1 : 1;
    if (a.disagrees !== b.disagrees) return a.disagrees ? -1 : 1;
    return a.start - b.start;
  });
  const hit = hits[0];
  const passage = source.slice(hit.start, hit.end).trim();
  if (!passage) return null;
  return {
    passage,
    start: hit.start,
    end: hit.end,
    sourceLabel: asText(sourceLabel).trim(),
  };
}

function spanAlreadyHeld(spans, passage) {
  const needle = normalizePassage(passage);
  if (!needle) return false;
  for (const span of Array.isArray(spans) ? spans : []) {
    const held = normalizePassage(span?.passage);
    if (!held) continue;
    if (held === needle || held.includes(needle) || needle.includes(held)) return true;
  }
  return false;
}

function spansCarrySameSubjectDate(spans, statement) {
  const stmtDates = statementDates(statement);
  if (stmtDates.length === 0) return false;
  for (const span of Array.isArray(spans) ? spans : []) {
    const passage = asText(span?.passage);
    if (!passage.trim()) continue;
    const srcDates = annotateTokens(passage).filter((t) => t.kind === "date");
    for (const draft of stmtDates) {
      for (const src of srcDates) {
        if (datesSameSubject(draft, src)) return true;
      }
    }
  }
  return false;
}

function allLocatableConfirmed(spans) {
  const held = (Array.isArray(spans) ? spans : []).filter(
    (s) => typeof s?.passage === "string" && s.passage.trim()
  );
  if (held.length === 0) return true;
  return held.every((s) => s.classification === "confirmed");
}

/**
 * Append at most one date-subject span per statement, copied from the
 * source. Classification starts confirmed; B345 demotes when values differ.
 */
export function appendDateSubjectSpans({ statementText, supportSpans, sources } = {}) {
  const spans = Array.isArray(supportSpans) ? [...supportSpans] : [];
  const stmt = asText(statementText);
  if (!stmt.trim()) return spans;
  if (statementDates(stmt).length === 0) return spans;
  if (spansCarrySameSubjectDate(spans, stmt)) return spans;
  const list = Array.isArray(sources) ? sources : [];
  for (let i = 0; i < list.length; i += 1) {
    const row = list[i] || {};
    const label =
      asText(row.label).trim() || asText(row.name).trim() || asText(row.title).trim() || `Source ${i + 1}`;
    const hit = locateDateSubjectSentence({
      statement: stmt,
      sourceText: row.text,
      sourceLabel: label,
    });
    if (!hit?.passage) continue;
    if (spanAlreadyHeld(spans, hit.passage)) return spans;
    const stmtDates = statementDates(stmt);
    const hitDates = annotateTokens(hit.passage).filter((t) => t.kind === "date");
    let disagrees = false;
    for (const draft of stmtDates) {
      for (const src of hitDates) {
        if (dateValuesDiffer(draft, src)) disagrees = true;
      }
    }
    if (disagrees && !allLocatableConfirmed(spans)) return spans;
    spans.push({
      sourceRefId: i,
      sourceIndex: i,
      classification: "confirmed",
      passage: hit.passage,
      start: hit.start,
      end: hit.end,
      sourceLabel: label,
      dateSubjectAdded: true,
    });
    return spans;
  }
  return spans;
}
