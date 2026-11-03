/**
 * B468. A numeral from 0 to 12 is spelled out only when the word is the same
 * number. A decimal, a percentage, money, a date, an age, or a measured unit
 * stays a numeral. The direction names that same number. It does not change it.
 */
import { quotationRanges } from "./mechanics-scan.mjs";

const WORDS = [
  "zero", "one", "two", "three", "four", "five", "six",
  "seven", "eight", "nine", "ten", "eleven", "twelve",
];

const UNIT_AFTER = /^\s*(?:km\b|kg\b|kw\b|mw\b|gw\b|mm\b|cm\b|metres?\b|meters?\b|minutes?\b|hours?\b|seconds?\b|%|percent\b|per cent\b)/i;
const LARGE_AFTER = /^\s*(?:million|billion|thousand|bn)\b/i;
const RANGE_UNIT = /^\s*(?:-|to)\s*\d+\s*(?:%|percent\b|per cent\b|minutes?\b|hours?\b|seconds?\b|km\b|kg\b|kw\b|mw\b|gw\b)/i;
const CURRENCY_BEFORE = /(?:USD|EUR|GBP|CHF|AUD|CAD|\$|£|€)\s*$/i;
const AGE_AFTER = /^\s*(?:years?\s+old|year-old)\b/i;
const AGE_BEFORE = /(?:\baged|\bage)\s+$/i;
const MONTH = "(?:January|February|March|April|May|June|July|August|September|October|November|December)";
const LABEL_BEFORE = /\b(?:Scope|Figure|Table|Note|Section|Article|Phase|Series|Tier|Level|Round|Grade|Type|Class|Track|Appendix|Exhibit|Schedule|Part|Page|Step|Item)\s+$/;

function requireStatement(statement) {
  if (typeof statement !== "string") throw new Error("scanNumberForm: statement is missing");
  return statement;
}

function inside(start, end, ranges) {
  return ranges.some(([from, to]) => start >= from && end <= to);
}

function named(parts) {
  if (parts.length <= 1) return parts[0] || "";
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

/**
 * One concern for the statement. Every numeral that should be a word is a span.
 * @param {{ statement: string }} args
 */
export function scanNumberForm({ statement } = {}) {
  const text = requireStatement(statement);
  const quoted = quotationRanges(text);
  const re = /(?<![A-Za-z.\d])(\d{1,2})(?![A-Za-z.\d])/g;
  const hits = [];
  for (const match of text.matchAll(re)) {
    const raw = match[1];
    const value = Number(raw);
    if (!Number.isInteger(value) || value > 12) continue;
    const start = match.index;
    const end = start + raw.length;
    if (inside(start, end, quoted)) continue;
    const before = text.slice(Math.max(0, start - 16), start);
    const after = text.slice(end, end + 28);
    if (/['’,]\d/.test(after)) continue;
    if (UNIT_AFTER.test(after) || LARGE_AFTER.test(after) || RANGE_UNIT.test(after)) continue;
    if (CURRENCY_BEFORE.test(before) || AGE_BEFORE.test(before) || AGE_AFTER.test(after)) continue;
    if (LABEL_BEFORE.test(before)) continue;
    if (new RegExp(`${MONTH}\\s+$`, "i").test(before)) continue;
    if (new RegExp(`^\\s*${MONTH}\\b`, "i").test(after)) continue;
    hits.push({ quote: raw, start, end, word: WORDS[value] });
  }
  if (!hits.length) return [];
  const quotes = named(hits.map((hit) => `'${hit.quote}'`));
  const words = named(hits.map((hit) => hit.word));
  const note = hits.length === 1
    ? `The number is written ${quotes}. Write it as ${words}.`
    : `The numbers are written ${quotes}. Write them as ${words}.`;
  return [{
    concernCode: "number_spelling",
    rule: "number_spelling",
    category: "style_guide",
    note,
    concernText: note,
    text: note,
    suggestedDirection: hits.length === 1 ? `Write ${quotes} as ${words}.` : `Write ${quotes} as ${words}.`,
    quote: hits[0].quote,
    span: hits.map((hit) => ({ startChar: hit.start, endChar: hit.end })),
  }];
}
