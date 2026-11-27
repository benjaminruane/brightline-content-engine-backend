/**
 * The only way to find a statement in a draft.
 * Walks in order, consumes each match, and will not return a span whose
 * slice is not that statement. Whitespace is collapsed the same way the
 * apply matcher collapses it. Quote variants are normalised before the
 * collapsed search (B617). Does not call a model.
 */
import { collapse } from "../revise-actions/verify.mjs";

function asText(value) {
  return typeof value === "string" ? value : "";
}

/** B617. Straighten curly quotes and non-breaking spaces for locate. */
export function normalizeLocateText(value) {
  return asText(value)
    .replace(/\u00A0/g, " ")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"');
}

function collapseWithMap(text) {
  const src = asText(text);
  let out = "";
  const idx = [];
  let i = 0;
  while (i < src.length && /\s/.test(src[i])) i += 1;
  let pendingSpace = false;
  for (; i < src.length; i += 1) {
    if (/\s/.test(src[i])) {
      pendingSpace = true;
      continue;
    }
    if (pendingSpace && out.length > 0) {
      out += " ";
      idx.push(i);
    }
    pendingSpace = false;
    out += src[i];
    idx.push(i);
  }
  return { text: out, idx };
}

function overlaps(loc, consumed) {
  return consumed.some((span) => loc.start < span.end && loc.end > span.start);
}

function accepted(draft, statement, loc) {
  if (!loc) return null;
  const slice = draft.slice(loc.start, loc.end);
  if (collapse(normalizeLocateText(slice)) !== collapse(normalizeLocateText(statement))) return null;
  return loc;
}

/**
 * The next unused occurrence of one statement.
 * Exact text first, then quote-normalised exact, then whitespace-collapsed
 * (on quote-normalised text). Returns null when the statement is not in the draft.
 */
export function locateStatementAt(draft, statement, consumed = []) {
  const src = asText(draft);
  const stmt = asText(statement);
  const taken = Array.isArray(consumed) ? consumed : [];
  if (!collapse(normalizeLocateText(stmt)) || !src) return null;

  let from = 0;
  while (from <= src.length) {
    const at = src.indexOf(stmt, from);
    if (at < 0) break;
    const loc = accepted(src, stmt, { start: at, end: at + stmt.length });
    if (loc && !overlaps(loc, taken)) return loc;
    from = at + 1;
  }

  // Collapsed search on quote-normalised text. Indices come from the original
  // draft collapse map so start/end always point into the real draft.
  const needle = collapse(normalizeLocateText(stmt));
  if (!needle) return null;
  const hay = collapseWithMap(src);
  from = 0;
  while (from <= hay.text.length) {
    const at = hay.text.indexOf(needle, from);
    if (at < 0) break;
    const start = hay.idx[at];
    const last = hay.idx[at + needle.length - 1];
    if (Number.isFinite(start) && Number.isFinite(last)) {
      const loc = accepted(src, stmt, { start, end: last + 1 });
      if (loc && !overlaps(loc, taken)) return loc;
    }
    from = at + 1;
  }
  return null;
}

/**
 * One span per statement, in the order given. A repeated sentence is the
 * next unused occurrence. A missing statement is null and does not consume.
 */
export function locateStatements(draft, statements) {
  const rows = Array.isArray(statements) ? statements : [];
  const consumed = [];
  return rows.map((statement) => {
    const loc = locateStatementAt(draft, statement, consumed);
    if (loc) consumed.push(loc);
    return loc;
  });
}

function spanCoords(row) {
  if (!row || typeof row !== "object") return { start: null, end: null };
  const start = Number.isFinite(row.startChar)
    ? row.startChar
    : Number.isFinite(row.charStart)
      ? row.charStart
      : Number.isFinite(row.start)
        ? row.start
        : null;
  const end = Number.isFinite(row.endChar)
    ? row.endChar
    : Number.isFinite(row.charEnd)
      ? row.charEnd
      : Number.isFinite(row.end)
        ? row.end
        : null;
  return { start, end };
}

function spanIsValid(draft, text, start, end) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return false;
  if (start < 0 || end > draft.length) return false;
  return collapse(normalizeLocateText(draft.slice(start, end))) === collapse(normalizeLocateText(text));
}

/**
 * B617. Every statement that appears in the draft gets a real span.
 * Never leave {0,0} (or any empty/wrong span) when the text is findable.
 * Re-locates in order so repeats stay distinct.
 *
 * @param {string} draft
 * @param {Array<{ text?: string, statement?: string, startChar?: number, endChar?: number, charStart?: number, charEnd?: number }>} rows
 * @returns {Array<{ start: number, end: number } | null>}
 */
export function ensureDraftSpans(draft, rows) {
  const src = asText(draft);
  const list = Array.isArray(rows) ? rows : [];
  const consumed = [];
  return list.map((row) => {
    const text = typeof row?.text === "string"
      ? row.text
      : typeof row?.statement === "string"
        ? row.statement
        : typeof row === "string"
          ? row
          : "";
    const { start, end } = spanCoords(row);
    if (spanIsValid(src, text, start, end) && !overlaps({ start, end }, consumed)) {
      const loc = { start, end };
      consumed.push(loc);
      return loc;
    }
    const loc = locateStatementAt(src, text, consumed);
    if (loc) {
      consumed.push(loc);
      return loc;
    }
    return null;
  });
}

/**
 * Apply ensureDraftSpans onto statement-shaped rows.
 * Writes startChar/endChar, charStart/charEnd, and draftSpan.
 */
export function applyEnsuredSpans(draft, rows) {
  const list = Array.isArray(rows) ? rows : [];
  const spans = ensureDraftSpans(draft, list);
  return list.map((row, i) => {
    const loc = spans[i];
    if (!loc) {
      const text = typeof row?.text === "string" ? row.text : typeof row?.statement === "string" ? row.statement : "";
      if (collapse(normalizeLocateText(text))) {
        console.error("[problem] ensureDraftSpans: statement was not placed", {
          index: i,
          preview: text.slice(0, 80),
        });
      }
      return {
        ...row,
        startChar: 0,
        endChar: 0,
        charStart: 0,
        charEnd: 0,
        draftSpan: { startChar: 0, endChar: 0 },
      };
    }
    return {
      ...row,
      startChar: loc.start,
      endChar: loc.end,
      charStart: loc.start,
      charEnd: loc.end,
      draftSpan: { startChar: loc.start, endChar: loc.end },
    };
  });
}
