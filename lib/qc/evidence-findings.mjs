/**
 * Evidence findings the headline verdict does not already state.
 * The causal rule and a partial-support entry are evidence.
 * A wording, editorial, or compliance concern is not in this list.
 */

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

function headlineStates(card, rule) {
  const setBy = card?.statementVerdict?.setBy;
  return setBy?.source === "action" && setBy?.rule === rule;
}

/**
 * Displayed evidence prose for beyond and conflicts.
 * Returns the note, or "" when the note would contradict the verdict.
 * Returns null for every other state, which keeps the Stage 5 commentary.
 */
export function displayedEvidenceProse(state, noteText) {
  if (state !== "beyond" && state !== "conflicts") return null;
  const text = typeof noteText === "string" ? noteText.trim() : "";
  if (!text || CONTRADICTION.test(text)) return "";
  return text;
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
    out.push({ ref, rule, quote, note });
  }
  return out;
}
