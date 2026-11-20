/**
 * Evidence findings the headline verdict does not already state.
 * The causal rule and a partial-support entry are evidence.
 * A wording, editorial, or compliance concern is not in this list.
 */

import { PARTIAL_UNRECORDED, partialSentence } from "./partial-sentence.mjs";
import { clearedNoteSentence } from "./reader-lines.mjs";
import { releaseReaderProse } from "./reader-prose-guard.mjs";
import { sourceCorpus } from "./quoted-span.mjs";
import { shownState } from "./shown-verdict.mjs";

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

export const EMPTY_HEADLINE_REASON =
  "This sentence was flagged, but the reason was not recorded. Please read it against the source.";

const STAND_IN = /reason was not recorded|which part was not recorded/i;

export function isStandInReason(text) {
  const body = typeof text === "string" ? text.trim() : "";
  if (!body) return true;
  return body === EMPTY_HEADLINE_REASON || body === PARTIAL_UNRECORDED || STAND_IN.test(body);
}

/** The missing figure, date, or name, in one sentence. Empty when none is missing. */
export function namedMissingSentence(facts) {
  const names = [];
  for (const fact of Array.isArray(facts) ? facts : []) {
    if (!fact || fact.status !== "not_found") continue;
    if (fact.kind !== "figure" && fact.kind !== "date" && fact.kind !== "name") continue;
    const surface = typeof fact.surface === "string" ? fact.surface.trim() : "";
    if (surface && !names.includes(surface)) names.push(surface);
  }
  if (!names.length) return "";
  if (names.length === 1) return `${names[0]} does not appear in the source.`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]} do not appear in the source.`;
}

/**
 * Displayed evidence prose for beyond, conflicts, and not_in_source.
 * Returns the note. A missing note, or one that would assert support, is the
 * empty-headline sentence so a red or amber card is not blank.
 * Returns null for every other state, which keeps the Stage 5 commentary.
 * not_in_source does not return null: a confirming Stage 5 paragraph is not shown.
 */
export function displayedEvidenceProse(state, noteText) {
  if (state !== "beyond" && state !== "conflicts" && state !== "not_in_source") return null;
  const text = typeof noteText === "string" ? noteText.trim() : "";
  if (!text || CONTRADICTION.test(text)) return EMPTY_HEADLINE_REASON;
  return text;
}

/**
 * The evidence sentence on the card.
 * A partial uses the partial sentence. A second value for the same quantity
 * uses that sentence. Everything else is the note, or Stage 5 when this returns null.
 */
export function shownEvidenceProse(card, state, noteText) {
  const corpus = sourceCorpus(card);
  const given = typeof noteText === "string" ? noteText.trim() : "";
  const raised = state === "partial" || state === "beyond" || state === "conflicts" || state === "not_in_source" || state === "note_withheld";
  if (raised && given && !isStandInReason(given) && !CONTRADICTION.test(given)) {
    return releaseReaderProse(given, corpus).text;
  }
  if (state === "partial") {
    const partial = releaseReaderProse(partialSentence(card), corpus).text;
    if (!isStandInReason(partial)) return partial;
    return namedMissingSentence(card?.readingFacts) || partial;
  }
  const line = typeof card?.secondValueLine === "string" ? card.secondValueLine.trim() : "";
  if (state === "conflicts" && line && !isStandInReason(line)) return releaseReaderProse(line, corpus).text;
  const text = given || clearedNoteSentence(card);
  const prose = displayedEvidenceProse(state, text);
  if (prose == null) return null;
  if (isStandInReason(prose)) {
    const named = namedMissingSentence(card?.readingFacts);
    if (named && (state === "not_in_source" || state === "beyond" || state === "conflicts")) return named;
  }
  return releaseReaderProse(prose, corpus).text;
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
    if (rule !== CAUSAL_RULE && headlineStates(card, rule)) continue;
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
  const partialHeadline = shownState(card) === "partial"
    || card?.supportState === "partial"
    || card?.displayVerdict === "supported_partial";
  const reason = heldReason(card);
  for (const row of out) {
    if (row.rule !== PARTIAL_RULE) continue;
    row.note = noteBeside(row.note, reason);
  }
  if (partialHeadline && !out.some((row) => row.rule === PARTIAL_RULE)) {
    out.push({ ref: "partial", rule: PARTIAL_RULE, quote: "", note: "" });
  }
  return out;
}

/**
 * The sentence the reason already shows, so the finding does not repeat it.
 * A stored reason wins. Otherwise the partial sentence, when it is one.
 */
function heldReason(card) {
  const prose = typeof card?.displayedEvidenceProse === "string" ? card.displayedEvidenceProse.trim() : "";
  if (prose && prose !== PARTIAL_UNRECORDED) return prose;
  const said = partialSentence(card);
  if (said && said !== PARTIAL_UNRECORDED) return said;
  if (prose === PARTIAL_UNRECORDED || said === PARTIAL_UNRECORDED) return PARTIAL_UNRECORDED;
  return "";
}

/** Empty when the note is the reason, or the unrecorded line. The row stays. */
function noteBeside(note, reason) {
  const body = typeof note === "string" ? note.trim() : "";
  if (!body || body === PARTIAL_UNRECORDED) return "";
  if (reason && body === reason) return "";
  return body;
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
