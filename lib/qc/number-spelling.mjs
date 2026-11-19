/**
 * B538. Drafts and the house-style scan share this rule.
 *
 * The ceiling is spellThrough on the configured number_spelling rule.
 * Callers of applyNumberSpelling: api/generate.js (commentary and the
 * methodology note), api/rewrite.js (the same two), api/adapt.js (the draft).
 * Callers of numberSpellingHits: scanNumberForm, and applyNumberSpelling.
 * scanNumberForm callers: the editorial review (passes the resolved style
 * rules), tests/b468-form-scans.test.mjs, and scripts/diagnostic/b468/replay.mjs.
 * A guide with no number_spelling rule spells nothing. A rule with no
 * ceiling is refused.
 */
import { quotationRanges } from "./mechanics-scan.mjs";
import { resolveStyleGuide } from "./style-guide.mjs";

const NUMBER_WORDS = [
  "zero", "one", "two", "three", "four", "five", "six",
  "seven", "eight", "nine", "ten", "eleven", "twelve",
];

const UNIT_AFTER = /^\s*(?:km\b|kg\b|kw\b|mw\b|gw\b|mm\b|cm\b|metres?\b|meters?\b|minutes?\b|hours?\b|seconds?\b|%|percent\b|per cent\b)/i;
const LARGE_AFTER = /^\s*(?:million|billion|thousand|bn)\b/i;
const RANGE_UNIT = /^\s*(?:-|\u2013|\u2014|to)\s*\d+\s*(?:%|percent\b|per cent\b|minutes?\b|hours?\b|seconds?\b|km\b|kg\b|kw\b|mw\b|gw\b)/i;
const CURRENCY_BEFORE = /(?:USD|EUR|GBP|CHF|AUD|CAD|\$|£|€)\s*$/i;
const AGE_AFTER = /^\s*-?\s*(?:years?\s+old|year-old)\b/i;
const AGE_BEFORE = /(?:\baged|\bage)\s+$/i;
const MONTH = "(?:January|February|March|April|May|June|July|August|September|October|November|December)";
const LABEL_BEFORE = /\b(?:Scope|Figure|Table|Note|Section|Article|Phase|Series|Tier|Level|Round|Grade|Type|Class|Track|Appendix|Exhibit|Schedule|Part|Page|Step|Item|Fund|Funds|fund|funds|Clause|Clauses|clause|clauses|Number|number|section)\s+$/;
const NOTICE_BEFORE = /\bNo\.?\s+$/i;
// AUTHOR-NAME-BLIND: these match a ticker, a camel-case product, or a capitalised word sitting immediately before a numeral, so Fund 2 and iPhone 12 stay numerals. The authoring organisation is not a party here. A capitalised author name in that same spot is an identifier too, and spelling the number would change it.
const TICKER_OR_CAMEL = /(?:\b[A-Z]{2,}|\b[A-Za-z]*[a-z][A-Z][A-Za-z]*|\b[A-Z][a-z]*[A-Z][A-Za-z]*)\s+$/;
const PROPER_BEFORE = /\b([A-Z][a-z]+)\s+$/;
const FUNCTION_OR_ADVERB = /^(?:The|This|That|These|Those|Our|Its|Their|His|Her|For|And|But|With|From|After|Before|During|Over|Under|About|Into|Across|Within|Since|Until|Not|They|She|Around|Nearly|Almost|Roughly|Approximately|Another|Every|Only|Just|Both|Next|Last|Past|First|Second|Third|Following|Some)$/;
const COUNT_AFTER = /^\s*-?\s*(?:people|persons?|employees|specialists|professionals|funds|companies|months|years|quarters|weeks|days|investments|co-investments|add-ons|acquisitions|platforms|members|offices|sites|plants|customers|clients|names|times|items|points|sectors|regions|countries|managers|partners|boards|seats|shares|deals|assets|holdings|portfolio)\b/i;

const PAIR_PATTERNS = [
  /(?<![A-Za-z.\d])(\d{1,6})(?![A-Za-z.\d])\s*(?:-|\u2013|\u2014|to|through)\s*(\d{1,6})(?![A-Za-z.\d])/gi,
  /(?<![A-Za-z.\d])(\d{1,6})(?![A-Za-z.\d])\s+(?:and|or|versus|vs\.?|compared\s+(?:with|to))\s+(\d{1,6})(?![A-Za-z.\d])/gi,
  /\bbetween\s+(\d{1,6})(?![A-Za-z.\d])\s+and\s+(\d{1,6})(?![A-Za-z.\d])/gi,
  /(?<![A-Za-z.\d])(\d{1,6})(?![A-Za-z.\d])\s+of\s+(?:the\s+)?(\d{1,6})(?![A-Za-z.\d])/gi,
];

const resolvedRules = new Map();

function rulesFor(options = {}) {
  if (Array.isArray(options.styleRules)) return options.styleRules;
  const key = typeof options.outputType === "string" ? options.outputType : "";
  if (!resolvedRules.has(key)) {
    resolvedRules.set(key, resolveStyleGuide(key ? { outputType: key } : {}));
  }
  return resolvedRules.get(key);
}

/**
 * @param {object|null|undefined} rule
 * @returns {{ spellThrough: number, words: string[] }|null}
 */
export function numberSpellingPolicy(rule) {
  if (!rule) return null;
  const max = rule.spellThrough;
  if (!Number.isInteger(max) || max < 0 || max >= NUMBER_WORDS.length) {
    throw new Error(`number_spelling spellThrough is not configured (${String(max)})`);
  }
  return { spellThrough: max, words: NUMBER_WORDS };
}

function configuredRule(options) {
  const rules = rulesFor(options);
  return rules.find((rule) => rule && rule.id === "number_spelling") || null;
}

function inside(start, end, ranges) {
  return ranges.some(([from, to]) => start >= from && end <= to);
}

function pairOffsets(match) {
  const full = match[0];
  const origin = match.index;
  const firstAt = full.indexOf(match[1]);
  const secondAt = full.indexOf(match[2], firstAt + match[1].length);
  return [
    { start: origin + firstAt, end: origin + firstAt + match[1].length, value: Number(match[1]) },
    { start: origin + secondAt, end: origin + secondAt + match[2].length, value: Number(match[2]) },
  ];
}

function mixedWithLarger(text, spellThrough) {
  const excluded = new Set();
  for (const pattern of PAIR_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags);
    for (const match of text.matchAll(re)) {
      const pair = pairOffsets(match);
      if (pair.some((side) => side.value > spellThrough)) {
        for (const side of pair) {
          if (side.value <= spellThrough) excluded.add(`${side.start}:${side.end}`);
        }
      }
    }
  }
  return excluded;
}

/**
 * Numerals the configured rule says to spell. Quoted text, carve-outs,
 * identifiers, and a small number paired with a larger one are absent.
 * @param {string} text
 * @param {{ outputType?: string, styleRules?: object[] }} [options]
 */
export function numberSpellingHits(text, options = {}) {
  if (typeof text !== "string") throw new Error("number spelling: text is missing");
  const policy = numberSpellingPolicy(configuredRule(options));
  if (!policy) return [];
  const quoted = quotationRanges(text);
  const keepNumeral = mixedWithLarger(text, policy.spellThrough);
  const re = /(?<![A-Za-z.\d])(\d{1,2})(?![A-Za-z.\d])/g;
  const hits = [];
  for (const match of text.matchAll(re)) {
    const raw = match[1];
    const value = Number(raw);
    if (!Number.isInteger(value) || value > policy.spellThrough) continue;
    const start = match.index;
    const end = start + raw.length;
    if (inside(start, end, quoted)) continue;
    if (keepNumeral.has(`${start}:${end}`)) continue;
    const before = text.slice(Math.max(0, start - 24), start);
    const after = text.slice(end, end + 28);
    if (/['’,]\d/.test(after)) continue;
    if (UNIT_AFTER.test(after) || LARGE_AFTER.test(after) || RANGE_UNIT.test(after)) continue;
    if (CURRENCY_BEFORE.test(before) || AGE_BEFORE.test(before) || AGE_AFTER.test(after)) continue;
    if (LABEL_BEFORE.test(before) || NOTICE_BEFORE.test(before) || TICKER_OR_CAMEL.test(before)) continue;
    const proper = before.match(PROPER_BEFORE);
    if (proper && !FUNCTION_OR_ADVERB.test(proper[1]) && !COUNT_AFTER.test(after)) continue;
    if (new RegExp(`${MONTH}\\s+$`, "i").test(before)) continue;
    if (new RegExp(`^\\s*${MONTH}\\b`, "i").test(after)) continue;
    hits.push({ quote: raw, start, end, word: policy.words[value] });
  }
  return hits;
}

/**
 * Spell the numerals the configured rule flags. Other characters stay.
 * @param {string} text
 * @param {{ outputType?: string, styleRules?: object[] }} [options]
 */
export function applyNumberSpelling(text, options = {}) {
  if (typeof text !== "string") return text;
  const hits = numberSpellingHits(text, options);
  let out = text;
  for (let i = hits.length - 1; i >= 0; i -= 1) {
    const hit = hits[i];
    out = out.slice(0, hit.start) + hit.word + out.slice(hit.end);
  }
  return out;
}
