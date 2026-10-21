/**
 * B410. One list of marks, in draft character offsets.
 * Fact offsets arrive measured against the statement. Action offsets in the
 * stored runs are also measured against the statement. Both are shifted by
 * the statement's draftSpan. A mark whose surface is not the draft slice is
 * dropped and counted. Nothing here calls a model.
 */
import { benchmarksInSource, extractElements } from "./b394-elements.mjs";

function asText(value) {
  return typeof value === "string" ? value : "";
}

function spanOf(statement) {
  const span = statement?.draftSpan;
  const start = Number(span?.startChar);
  const end = Number(span?.endChar);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return { start, end };
}

function severityRank(severity) {
  return severity === "missing" ? 2 : 1;
}

function overlaps(a, b) {
  return a.start < b.end && b.start < a.end;
}

function contains(outer, inner) {
  return outer.start <= inner.start && outer.end >= inner.end && (outer.end - outer.start) > (inner.end - inner.start);
}

/**
 * missing wins over concern wherever they overlap.
 * A shorter span wins over a longer one that contains it.
 * Same severity and the same span: the later one is dropped.
 * A partial overlap that is not containment, and is the same severity, keeps both.
 */
export function resolveMarkPrecedence(marks) {
  const list = Array.isArray(marks) ? marks.filter(Boolean) : [];
  const drop = new Set();
  for (let i = 0; i < list.length; i += 1) {
    if (drop.has(i)) continue;
    for (let j = i + 1; j < list.length; j += 1) {
      if (drop.has(j)) continue;
      const a = list[i];
      const b = list[j];
      if (!overlaps(a, b)) continue;
      if (a.severity !== b.severity) {
        drop.add(severityRank(a.severity) > severityRank(b.severity) ? j : i);
        continue;
      }
      if (contains(a, b)) drop.add(i);
      else if (contains(b, a)) drop.add(j);
      else if (a.start === b.start && a.end === b.end) drop.add(j);
    }
  }
  return list.filter((_, index) => !drop.has(index));
}

function pushMark(bucket, dropped, draft, mark) {
  const surface = asText(mark.surface);
  const start = mark.start;
  const end = mark.end;
  if (!surface || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > draft.length || end <= start) {
    dropped.push({ ...mark, reason: "offset" });
    return;
  }
  if (draft.slice(start, end) !== surface) {
    dropped.push({ ...mark, reason: "surface" });
    return;
  }
  bucket.push({
    start,
    end,
    statementIndex: mark.statementIndex,
    origin: mark.origin,
    severity: mark.severity,
    surface,
    ref: mark.ref,
  });
}

function statementIndex(statement, fallback) {
  if (Number.isInteger(statement?.index)) return statement.index;
  const parsed = Number(statement?.id);
  return Number.isInteger(parsed) ? parsed : fallback;
}

export function buildDraftMarks({ draft, statements, entries } = {}) {
  if (typeof draft !== "string") {
    throw new Error("buildDraftMarks: draft is missing");
  }
  const rows = Array.isArray(statements) ? statements : [];
  const byId = new Map();
  rows.forEach((row, index) => {
    const id = row?.id != null ? String(row.id) : String(statementIndex(row, index));
    byId.set(id, { row, index });
  });
  const kept = [];
  const dropped = [];

  rows.forEach((row, index) => {
    const span = spanOf(row);
    const text = asText(row?.text) || asText(row?.statement);
    const statementIndexValue = statementIndex(row, index);
    if (!span || draft.slice(span.start, span.end) !== text) {
      const facts = Array.isArray(row?.facts) ? row.facts : [];
      for (const fact of facts) {
        if (fact?.status !== "not_found" && fact?.status !== "matched_disputed") continue;
        dropped.push({
          origin: "fact",
          statementIndex: statementIndexValue,
          surface: asText(fact?.surface),
          reason: "statement-span",
        });
      }
      return;
    }
    const facts = Array.isArray(row?.facts) ? row.facts : [];
    facts.forEach((fact, factIndex) => {
      if (fact?.status !== "not_found" && fact?.status !== "matched_disputed") return;
      const localStart = Number(fact.start);
      const localEnd = Number(fact.end);
      const raw = text.slice(localStart, localEnd);
      const surface = asText(fact.surface);
      // The name extractor drops a possessive. The mark covers the surface it kept.
      const at = raw === surface ? 0 : raw.indexOf(surface);
      if (at < 0) {
        dropped.push({
          origin: "fact",
          statementIndex: statementIndexValue,
          surface,
          reason: "surface",
        });
        return;
      }
      pushMark(kept, dropped, draft, {
        start: span.start + localStart + at,
        end: span.start + localStart + at + surface.length,
        statementIndex: statementIndexValue,
        origin: "fact",
        severity: fact.status === "not_found" ? "missing" : "concern",
        surface,
        ref: `fact:${statementIndexValue}:${fact.kind || "fact"}:${factIndex}`,
      });
    });
  });

  for (const entry of Array.isArray(entries) ? entries : []) {
    const thing = entry?.thing1;
    const quote = asText(thing?.quote);
    if (!quote || !Number.isFinite(thing?.startChar) || !Number.isFinite(thing?.endChar)) continue;
    const found = byId.get(String(entry.statementId ?? ""));
    if (!found) {
      dropped.push({ origin: "action", ref: entry.id, surface: quote, reason: "statement" });
      continue;
    }
    const span = spanOf(found.row);
    const text = asText(found.row?.text) || asText(found.row?.statement);
    const statementIndexValue = statementIndex(found.row, found.index);
    if (!span || draft.slice(span.start, span.end) !== text) {
      dropped.push({ origin: "action", ref: entry.id, surface: quote, statementIndex: statementIndexValue, reason: "statement-span" });
      continue;
    }
    const localStart = Number(thing.startChar);
    const localEnd = Number(thing.endChar);
    pushMark(kept, dropped, draft, {
      start: span.start + localStart,
      end: span.start + localEnd,
      statementIndex: statementIndexValue,
      origin: "action",
      severity: "concern",
      surface: quote,
      ref: typeof entry.id === "string" ? entry.id : `action:${statementIndexValue}`,
    });
  }

  return { marks: resolveMarkPrecedence(kept), dropped, droppedCount: dropped.length };
}

export function draftFromStatementSpans(statements) {
  const rows = Array.isArray(statements) ? statements : [];
  const last = rows.reduce((max, row) => {
    const span = spanOf(row);
    return span ? Math.max(max, span.end) : max;
  }, 0);
  const chars = Array.from({ length: last }, () => "\n");
  for (const row of rows) {
    const span = spanOf(row);
    const text = asText(row?.qcCard?.statement) || asText(row?.text) || asText(row?.statement);
    if (!span || !text) continue;
    for (let i = 0; i < text.length && span.start + i < chars.length; i += 1) {
      chars[span.start + i] = text[i];
    }
  }
  return chars.join("");
}

function levenshtein(a, b) {
  const left = String(a);
  const right = String(b);
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const current = row[j];
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + cost);
      previous = current;
    }
  }
  return row[right.length];
}

/**
 * Class A, as written in PROPOSALS.md before the measurement.
 * The earliest source benchmark word, in list order of first occurrence.
 */
export function classAProposal(fact, sourceText) {
  if (!fact || fact.status !== "not_found" || fact.kind !== "benchmark") return null;
  const words = benchmarksInSource(sourceText);
  if (!words.length) return null;
  const ranked = words
    .map((row) => ({ ...row, line: row.occurrences?.[0]?.lineId || null, at: lineSort(row) }))
    .sort((a, b) => a.at - b.at);
  const chosen = ranked[0];
  if (!chosen || chosen.word.toLowerCase() === String(fact.surface || "").toLowerCase()) return null;
  return {
    class: "A",
    from: fact.surface,
    to: chosen.word,
    lineId: chosen.line,
    kind: fact.kind,
  };
}

function lineSort(row) {
  const id = row.occurrences?.[0]?.lineId || "";
  const match = /^L(\d+)$/.exec(id);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

/**
 * Class B. Distance 2. Exactly one source name. Written before the measurement.
 */
export function classBProposal(fact, sourceText) {
  if (!fact || fact.status !== "not_found" || fact.kind !== "name") return null;
  const written = asText(fact.surface);
  if (!written) return null;
  const names = extractElements(sourceText, sourceText, sourceText).filter((element) => element.kind === "name");
  const seen = new Set();
  const near = [];
  for (const name of names) {
    if (!name.surface || seen.has(name.surface)) continue;
    seen.add(name.surface);
    if (name.surface === written) continue;
    const distance = levenshtein(written, name.surface);
    if (distance <= 2) near.push(name.surface);
  }
  if (near.length !== 1) return null;
  return { class: "B", from: written, to: near[0], lineId: null, kind: fact.kind };
}

export function proposalForFact(fact, sourceText) {
  return classAProposal(fact, sourceText) || classBProposal(fact, sourceText);
}
