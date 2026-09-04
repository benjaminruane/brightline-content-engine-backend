/**
 * Rebuild a draft from accepted and modified decisions.
 * One write per statement. Two accepted writes on one statement apply neither.
 * A statement that cannot be located is skipped. Duplicate sentences are
 * assigned in extraction order. Does not call a model.
 */
import { collapse } from "./verify.mjs";

function asText(value) {
  return typeof value === "string" ? value : "";
}

function decisionMap(decisions) {
  const map = new Map();
  for (const row of Array.isArray(decisions) ? decisions : []) {
    const id = typeof row?.id === "string" ? row.id : "";
    if (!id) continue;
    map.set(id, row);
  }
  return map;
}

function isWriteChoice(choice) {
  return choice === "accept" || choice === "modify";
}

function replacementFor(entry, decision) {
  const choice = typeof decision?.choice === "string" ? decision.choice : "";
  if (choice === "modify") {
    return typeof decision.replacementText === "string" ? decision.replacementText : "";
  }
  if (choice === "accept") {
    return asText(entry.resultingSentence);
  }
  return null;
}

function spanFromRow(row) {
  const card = row?.qcCard && typeof row.qcCard === "object" ? row.qcCard : null;
  const statement = asText(card?.statement) || asText(row?.text);
  const start =
    card?.charStart ??
    card?.draftSpan?.startChar ??
    row?.charStart ??
    row?.draftSpan?.startChar;
  const end =
    card?.charEnd ??
    card?.draftSpan?.endChar ??
    row?.charEnd ??
    row?.draftSpan?.endChar;
  return { statement, startChar: start, endChar: end };
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

function locateCollapsed(draft, statement) {
  const hay = collapseWithMap(draft);
  const needle = collapse(statement);
  if (!needle) return null;
  const first = hay.text.indexOf(needle);
  if (first < 0) return null;
  const second = hay.text.indexOf(needle, first + 1);
  if (second >= 0) return null;
  const start = hay.idx[first];
  const last = hay.idx[first + needle.length - 1];
  if (!Number.isFinite(start) || !Number.isFinite(last)) return null;
  return { start, end: last + 1 };
}

export function locateStatement(draft, statement, startChar, endChar) {
  const src = asText(draft);
  const stmt = asText(statement);
  if (!stmt || !src) return null;
  const s = Number(startChar);
  const e = Number(endChar);
  if (Number.isFinite(s) && Number.isFinite(e) && s >= 0 && e <= src.length && e >= s) {
    const slice = src.slice(s, e);
    if (slice === stmt || collapse(slice) === collapse(stmt)) {
      return { start: s, end: e };
    }
  }
  const exact = src.indexOf(stmt);
  if (exact >= 0 && src.indexOf(stmt, exact + 1) < 0) {
    return { start: exact, end: exact + stmt.length };
  }
  return locateCollapsed(src, stmt);
}

function overlaps(loc, consumed) {
  return consumed.some((c) => loc.start < c.end && loc.end > c.start);
}

function locateFirstUnconsumed(draft, statement, consumed) {
  const src = asText(draft);
  const stmt = asText(statement);
  if (stmt) {
    let from = 0;
    while (from <= src.length) {
      const at = src.indexOf(stmt, from);
      if (at < 0) break;
      const loc = { start: at, end: at + stmt.length };
      if (!overlaps(loc, consumed)) return loc;
      from = at + 1;
    }
  }
  const hay = collapseWithMap(src);
  const needle = collapse(statement);
  if (!needle) return null;
  let from = 0;
  while (from <= hay.text.length) {
    const at = hay.text.indexOf(needle, from);
    if (at < 0) break;
    const start = hay.idx[at];
    const last = hay.idx[at + needle.length - 1];
    if (Number.isFinite(start) && Number.isFinite(last)) {
      const loc = { start, end: last + 1 };
      if (!overlaps(loc, consumed)) return loc;
    }
    from = at + 1;
  }
  return null;
}

function locateAssigned(draft, target, consumed) {
  const offsetHit = locateStatement(draft, target.statement, target.startChar, target.endChar);
  if (offsetHit && !overlaps(offsetHit, consumed)) return offsetHit;
  return locateFirstUnconsumed(draft, target.statement, consumed);
}

function orderedTargets({ statements, writesByStatement }) {
  if (Array.isArray(statements) && statements.length > 0) {
    const seen = new Set();
    const list = [];
    for (const row of statements) {
      const id = row?.id != null ? String(row.id) : row?.qcCard?.index != null ? String(row.qcCard.index) : "";
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const fromRow = spanFromRow(row);
      list.push({
        sid: id,
        statement: fromRow.statement,
        startChar: fromRow.startChar,
        endChar: fromRow.endChar,
      });
    }
    return list;
  }
  const sids = [...writesByStatement.keys()].sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
    return String(a).localeCompare(String(b));
  });
  return sids.map((sid) => {
    const { entry } = writesByStatement.get(sid)[0];
    return {
      sid,
      statement: asText(entry.statement),
      startChar: undefined,
      endChar: undefined,
    };
  });
}

function plannedWrites({ draft, statements, entries, decisions }) {
  const byId = decisionMap(decisions);
  const writesByStatement = new Map();

  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry || entry.disposition !== "ACTION") continue;
    const decision = byId.get(entry.id);
    if (!isWriteChoice(decision?.choice)) continue;
    const replacement = replacementFor(entry, decision);
    if (replacement == null) continue;
    const sid = String(entry.statementId ?? "");
    const list = writesByStatement.get(sid) || [];
    list.push({ entry, replacement });
    writesByStatement.set(sid, list);
  }

  const consumed = [];
  const locatedBySid = new Map();
  for (const target of orderedTargets({ statements, writesByStatement })) {
    const located = locateAssigned(draft, target, consumed);
    locatedBySid.set(target.sid, located);
    if (located) consumed.push(located);
  }

  const writes = [];
  for (const [sid, list] of writesByStatement) {
    if (list.length !== 1) continue;
    const located = locatedBySid.get(sid);
    if (!located) continue;
    const { entry, replacement } = list[0];
    writes.push({
      id: entry.id,
      statementId: sid,
      start: located.start,
      end: located.end,
      replacement,
    });
  }

  writes.sort((a, b) => b.start - a.start);
  for (let i = 0; i < writes.length - 1; i += 1) {
    const later = writes[i];
    const earlier = writes[i + 1];
    if (earlier.end > later.start) {
      return { ok: false, error: "Apply failed.", writes: [] };
    }
  }
  return { ok: true, writes };
}

export function applyDecisions({ draft, statements, entries, decisions } = {}) {
  const src = asText(draft);
  const planned = plannedWrites({ draft: src, statements, entries, decisions });
  if (!planned.ok) return { ok: false, error: planned.error, text: src };
  let text = src;
  for (const write of planned.writes) {
    text = text.slice(0, write.start) + write.replacement + text.slice(write.end);
  }
  return { ok: true, text };
}
