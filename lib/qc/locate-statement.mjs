/**
 * The only way to find a statement in a draft.
 * Walks in order, consumes each match, and will not return a span whose
 * slice is not that statement. Whitespace is collapsed the same way the
 * apply matcher collapses it. Does not call a model.
 */
import { collapse } from "../revise-actions/verify.mjs";

function asText(value) {
  return typeof value === "string" ? value : "";
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
  if (collapse(slice) !== collapse(statement)) return null;
  return loc;
}

/**
 * The next unused occurrence of one statement.
 * Exact text first, then the same text with whitespace collapsed.
 * Returns null when the statement is not in the draft.
 */
export function locateStatementAt(draft, statement, consumed = []) {
  const src = asText(draft);
  const stmt = asText(statement);
  const taken = Array.isArray(consumed) ? consumed : [];
  if (!collapse(stmt) || !src) return null;

  let from = 0;
  while (from <= src.length) {
    const at = src.indexOf(stmt, from);
    if (at < 0) break;
    const loc = accepted(src, stmt, { start: at, end: at + stmt.length });
    if (loc && !overlaps(loc, taken)) return loc;
    from = at + 1;
  }

  const hay = collapseWithMap(src);
  const needle = collapse(stmt);
  if (!needle) return null;
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
