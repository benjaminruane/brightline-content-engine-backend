/**
 * Rebuild a draft from accepted and modified decisions.
 * Two accepted substitutions on one statement are one write, applied right to left.
 * A whole-sentence write stays one per statement. Anything accepted that is not
 * written is reported on that statement. Duplicate sentences are assigned in
 * extraction order. Does not call a model.
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

function substitutionOf(entry) {
  const sub = entry?.substitution;
  const start = Number(sub?.start);
  const end = Number(sub?.end);
  const replacement = typeof sub?.replacement === "string" ? sub.replacement : "";
  if (!Number.isInteger(start) || !Number.isInteger(end) || end <= start || !replacement) return null;
  return { start, end, replacement };
}

function changeName(entry, decision, statement) {
  if (decision?.choice === "modify") {
    const text = asText(decision.replacementText).trim();
    return text || "your edit";
  }
  const sub = substitutionOf(entry);
  if (sub) {
    const old = asText(statement).slice(sub.start, sub.end);
    return old ? `${old} to ${sub.replacement}` : sub.replacement;
  }
  const sentence = asText(entry?.resultingSentence).trim();
  return sentence || "the other change";
}

function joined(names) {
  const list = Array.isArray(names) ? names.filter(Boolean) : [];
  if (list.length <= 1) return list[0] || "This change";
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

function noticeMessage(kind, names) {
  if (kind === "overlap") {
    return `${joined(names.slice(0, 2))} overlap. Only one can be taken.`;
  }
  if (kind === "modify") {
    const verb = names.length === 1 ? "is" : "are";
    return `Your edit was applied. ${joined(names)} ${verb} no longer applicable.`;
  }
  if (kind === "sentence") {
    const both = names.length === 2 ? "both" : "all";
    return `${joined(names)} cannot ${both} be applied. Only one can be taken.`;
  }
  if (kind === "missing") {
    return "This sentence is no longer in the draft, so the change was not applied.";
  }
  if (kind === "draft") {
    return "This sentence overlaps another change in the draft, so it was not applied.";
  }
  if (kind === "draft-all") {
    return "These two sentences overlap in the draft, so neither change was applied.";
  }
  if (kind === "stopped") {
    return "This change was not applied, because two sentences overlap in the draft.";
  }
  return "";
}

function makeNotice(statementId, kind, names) {
  const list = Array.isArray(names) ? names.filter(Boolean) : [];
  return {
    statementId,
    kind,
    names: list,
    message: noticeMessage(kind, list),
  };
}

function combineSubstitutions(statement, subs) {
  const ordered = [...subs].sort((a, b) => b.start - a.start || b.end - a.end);
  let text = statement;
  for (const sub of ordered) {
    if (sub.start < 0 || sub.end > text.length || sub.end < sub.start) return null;
    text = text.slice(0, sub.start) + sub.replacement + text.slice(sub.end);
  }
  return text;
}

function writeFrom(located, row) {
  return {
    id: row.entry.id,
    statementId: String(row.entry.statementId ?? ""),
    start: located.start,
    end: located.end,
    replacement: row.replacement,
  };
}

function planStatement(sid, list, located) {
  const statement = asText(list[0].entry.statement);
  const names = list.map((row) => changeName(row.entry, row.decision, statement));
  if (!located) return { write: null, notice: makeNotice(sid, "missing", names) };
  if (list.length === 1) return { write: writeFrom(located, list[0]), notice: null };
  const modifies = list.filter((row) => row.decision?.choice === "modify");
  if (modifies.length === 1) {
    const otherNames = list
      .filter((row) => row !== modifies[0])
      .map((row) => changeName(row.entry, row.decision, statement));
    return { write: writeFrom(located, modifies[0]), notice: makeNotice(sid, "modify", otherNames) };
  }
  if (modifies.length > 1) return { write: null, notice: makeNotice(sid, "sentence", names) };
  const subs = list.map((row) => substitutionOf(row.entry));
  if (subs.every(Boolean)) {
    const ordered = [...subs].sort((a, b) => a.start - b.start);
    for (let i = 1; i < ordered.length; i += 1) {
      if (ordered[i - 1].end > ordered[i].start) {
        const left = asText(statement).slice(ordered[i - 1].start, ordered[i - 1].end);
        const right = asText(statement).slice(ordered[i].start, ordered[i].end);
        return {
          write: null,
          notice: makeNotice(sid, "overlap", [
            left ? `${left} to ${ordered[i - 1].replacement}` : ordered[i - 1].replacement,
            right ? `${right} to ${ordered[i].replacement}` : ordered[i].replacement,
          ]),
        };
      }
    }
    const combined = combineSubstitutions(statement, subs);
    if (combined == null) return { write: null, notice: makeNotice(sid, "sentence", names) };
    return {
      write: {
        id: list[0].entry.id,
        statementId: sid,
        start: located.start,
        end: located.end,
        replacement: combined,
      },
      notice: null,
    };
  }
  return { write: null, notice: makeNotice(sid, "sentence", names) };
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
    list.push({ entry, decision, replacement });
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
  const notices = [];
  for (const [sid, list] of writesByStatement) {
    const located = locatedBySid.get(sid) || null;
    if (!located) {
      const statement = asText(list[0].entry.statement);
      const names = list.map((row) => changeName(row.entry, row.decision, statement));
      const present = Boolean(statement) && locateStatement(draft, statement) != null;
      notices.push(makeNotice(sid, present ? "draft" : "missing", names));
      continue;
    }
    const planned = planStatement(sid, list, located);
    if (planned.notice) notices.push(planned.notice);
    if (planned.write) writes.push(planned.write);
  }

  writes.sort((a, b) => b.start - a.start);
  for (let i = 0; i < writes.length - 1; i += 1) {
    const later = writes[i];
    const earlier = writes[i + 1];
    if (earlier.end > later.start) {
      const hit = new Set([later.statementId, earlier.statementId]);
      const told = new Set(notices.map((notice) => notice.statementId));
      for (const write of writes) {
        if (told.has(write.statementId)) continue;
        const list = writesByStatement.get(write.statementId) || [];
        const statement = asText(list[0]?.entry?.statement);
        const names = list.map((row) => changeName(row.entry, row.decision, statement));
        notices.push(makeNotice(write.statementId, hit.has(write.statementId) ? "draft-all" : "stopped", names));
      }
      return {
        ok: false,
        error: "These two sentences overlap in the draft, so neither change was applied.",
        notices,
        writes: [],
      };
    }
  }
  return { ok: true, writes, notices };
}

export function applyDecisions({ draft, statements, entries, decisions } = {}) {
  const src = asText(draft);
  const planned = plannedWrites({ draft: src, statements, entries, decisions });
  if (!planned.ok) {
    return {
      ok: false,
      error: planned.error,
      text: src,
      notices: planned.notices || [],
      writtenStatementIds: [],
    };
  }
  let text = src;
  for (const write of planned.writes) {
    text = text.slice(0, write.start) + write.replacement + text.slice(write.end);
  }
  return {
    ok: true,
    text,
    notices: planned.notices || [],
    writtenStatementIds: planned.writes.map((write) => write.statementId),
  };
}
