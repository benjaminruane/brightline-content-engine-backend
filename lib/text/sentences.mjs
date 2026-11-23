/**
 * One sentence split for notes, cards, and passages.
 * A full stop inside a number, a listed abbreviation, or a quotation
 * is not the end of a sentence. Pieces keep their original spacing, so
 * joining them returns the input.
 */

const ABBREVIATIONS = ["u.s.", "u.k.", "e.g.", "i.e.", "p.a.", "no."];

function nextNonSpace(text, index) {
  let cursor = index + 1;
  while (cursor < text.length && text[cursor] === " ") cursor += 1;
  return text[cursor] || "";
}

function initialismPeriod(text, index) {
  const prev = text[index - 1] || "";
  if (!/[A-Za-z]/.test(prev)) return false;
  const before = text[index - 2] || "";
  if (/[A-Za-z]/.test(before)) return false;
  return /[A-Za-z]/.test(text[index + 1] || "");
}

function abbreviationPeriod(text, index) {
  const slice = text.slice(Math.max(0, index - 8), index + 1).toLowerCase();
  if (!ABBREVIATIONS.some((abbr) => slice.endsWith(abbr))) return false;
  const follow = nextNonSpace(text, index);
  if (!follow) return true;
  return /[a-z0-9,(]/.test(follow);
}

function quoteState(text, index, quote) {
  const ch = text[index];
  if (ch === "\"" || ch === "\u201C" || ch === "\u201D") {
    if (quote === "\"") return null;
    if (!quote) return "\"";
    return quote;
  }
  if (ch !== "'") return quote;
  const prev = text[index - 1] || "";
  const next = text[index + 1] || "";
  if (/[A-Za-z]/.test(prev) && /[A-Za-z]/.test(next)) return quote;
  if (quote === "'") {
    if (!next || /[\s,.;:!?]/.test(next)) return null;
    return quote;
  }
  if (!quote && (!prev || /[\s([{"\u201C]/.test(prev))) return "'";
  return quote;
}

function keepPeriod(text, index, quote) {
  if (quote) return true;
  if (text[index] !== ".") return false;
  const prev = text[index - 1];
  const next = text[index + 1];
  if (prev >= "0" && prev <= "9" && next >= "0" && next <= "9") return true;
  if (initialismPeriod(text, index)) return true;
  return abbreviationPeriod(text, index);
}

/** @param {string} text */
export function splitSentences(text) {
  const source = typeof text === "string" ? text : "";
  if (!source) return [];
  const out = [];
  let start = 0;
  let quote = null;
  for (let i = 0; i < source.length; i += 1) {
    quote = quoteState(source, i, quote);
    const ch = source[i];
    if (ch !== "." && ch !== "!" && ch !== "?") continue;
    if (keepPeriod(source, i, quote)) continue;
    let end = i;
    while (end < source.length && (source[end] === "." || source[end] === "!" || source[end] === "?")) end += 1;
    out.push(source.slice(start, end));
    start = end;
    i = end - 1;
  }
  if (start < source.length) out.push(source.slice(start));
  return out;
}

/** Trimmed sentences, in order. */
export function sentenceList(text) {
  return splitSentences(text).map((part) => part.trim()).filter(Boolean);
}
