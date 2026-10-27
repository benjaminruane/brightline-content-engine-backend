/**
 * Evidence findings the headline verdict does not already state.
 * The causal rule and a partial-support entry are evidence.
 * A wording, editorial, or compliance concern is not in this list.
 */

import { partialSentence } from "./partial-sentence.mjs";

const CAUSAL_RULE = "overreach_unsupported_causal";
const PARTIAL_RULE = "partial";

const CONTRADICTION = /\bconfirms\b|\bconfirmed\b|\bas stated\b|\baligns with\b/i;

function ruleOf(entry) {
  return String(entry?.rule || entry?.concernCode || entry?.sort?.rule || "").trim();
}

function quoteOf(entry, statement) {
  const quoted = entry?.thing1?.quote;
  if (typeof quoted === "string" && quoted.trim()) return quoted.trim();
  const span = Array.isArray(entry?.span) ? entry.span[0] : entry?.span;
  const start = Number(span?.startChar);
  const end = Number(span?.endChar);
  if (typeof statement === "string" && Number.isInteger(start) && Number.isInteger(end) && end > start && end <= statement.length) {
    return statement.slice(start, end);
  }
  return "";
}

function noteOf(entry) {
  if (typeof entry?.thing2 === "string" && entry.thing2.trim()) return entry.thing2.trim();
  if (typeof entry?.note === "string" && entry.note.trim()) return entry.note.trim();
  return "";
}

function statementKey(card) {
  if (card?.statementId != null && String(card.statementId) !== "") return String(card.statementId);
  if (card?.index != null && String(card.index) !== "") return String(card.index);
  if (card?.id != null && String(card.id) !== "") return String(card.id);
  return "";
}

/**
 * An inventory row belongs to one statement.
 * A concern that carries no statement id, no statement text and no quote
 * was already taken from this card.
 * A quote that is not in this sentence does not belong here.
 */
function entryBelongs(entry, card) {
  const key = statementKey(card);
  const sid = entry?.statementId != null && String(entry.statementId) !== "" ? String(entry.statementId) : "";
  const entryText = typeof entry?.statement === "string" ? entry.statement.trim() : "";
  const cardText = typeof card?.statement === "string" ? card.statement : "";
  const quoted = typeof entry?.thing1?.quote === "string"
    ? entry.thing1.quote.trim()
    : (typeof entry?.quote === "string" ? entry.quote.trim() : "");
  if (sid && sid !== key) return false;
  if (entryText && entryText !== cardText) return false;
  if (quoted && cardText && !cardText.includes(quoted)) return false;
  if (!sid && !entryText && !quoted) return true;
  if (sid && !key) return false;
  if (entryText && !cardText) return false;
  return true;
}

function headlineStates(card, rule) {
  const setBy = card?.statementVerdict?.setBy;
  return setBy?.source === "action" && setBy?.rule === rule;
}

/**
 * Displayed evidence prose for beyond, conflicts, and not_in_source.
 * Returns the note, or "" when the note is missing or would assert support.
 * Returns null for every other state, which keeps the Stage 5 commentary.
 * not_in_source does not return null: a confirming Stage 5 paragraph is not shown.
 */
export function displayedEvidenceProse(state, noteText) {
  if (state !== "beyond" && state !== "conflicts" && state !== "not_in_source") return null;
  const text = typeof noteText === "string" ? noteText.trim() : "";
  if (!text || CONTRADICTION.test(text)) return "";
  return text;
}

/**
 * The evidence sentence on the card.
 * A partial uses the partial sentence. A second value for the same quantity
 * uses that sentence. Everything else is the note, or Stage 5 when this returns null.
 */
export function shownEvidenceProse(card, state, noteText) {
  if (state === "partial") return partialSentence(card);
  const line = typeof card?.secondValueLine === "string" ? card.secondValueLine.trim() : "";
  if (state === "conflicts" && line) return line;
  return displayedEvidenceProse(state, noteText);
}

export function proseContradictsVerdict(text) {
  return typeof text === "string" && CONTRADICTION.test(text);
}

/**
 * @param {object} card
 * @param {object[]} entries
 * @returns {{ ref: string, rule: string, quote: string, note: string }[]}
 */
export function cardEvidenceFindings(card, entries) {
  const statement = typeof card?.statement === "string" ? card.statement : "";
  const list = Array.isArray(entries) ? entries : [];
  const seen = new Set();
  const out = [];
  for (const entry of list) {
    if (!entryBelongs(entry, card)) continue;
    const rule = ruleOf(entry);
    if (rule !== CAUSAL_RULE && rule !== PARTIAL_RULE) continue;
    if (headlineStates(card, rule)) continue;
    const quote = quoteOf(entry, statement);
    const note = noteOf(entry);
    const ref = typeof entry?.id === "string" && entry.id.trim()
      ? entry.id.trim()
      : `${rule}:${quote}`;
    const key = `${rule}|${quote}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const sid = entry?.statementId != null && String(entry.statementId) !== "" ? String(entry.statementId) : "";
    out.push({ ref, rule, quote, note, ...(sid ? { statementId: sid } : {}) });
  }
  return out;
}

/**
 * One list per statement, from the inventory that already exists.
 * A statement with no id is refused. An empty list is a real empty list.
 */
export function findingsByStatement(statements, entries) {
  const rows = Array.isArray(statements) ? statements : [];
  const out = {};
  for (const row of rows) {
    const card = row?.qcCard && typeof row.qcCard === "object" ? row.qcCard : {};
    const statement = typeof card.statement === "string" && card.statement
      ? card.statement
      : (typeof row?.text === "string" ? row.text : "");
    const key = statementKey({
      statementId: row?.id ?? card.statementId,
      index: card.index,
      id: card.id,
    });
    if (!key) throw new Error("findingsByStatement: a statement has no id");
    out[key] = cardEvidenceFindings(
      { ...card, statement, index: card.index, statementId: key },
      entries,
    );
  }
  return out;
}
