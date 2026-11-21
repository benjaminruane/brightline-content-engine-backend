/**
 * Auto-fix transforms named by the style guide.
 * Each transform is one entry's transform id. Quoted speech is left alone.
 */
import { normalizePgHouseStyleCharacters } from "../prompt-library/house-characters.mjs";
import { applyNumberSpelling } from "../qc/number-spelling.mjs";
import { applyListCommas } from "../qc/list-comma-scan.mjs";
import { applyAccountSpelling } from "../qc/account-spelling.mjs";
import { replaceFirstPerson } from "../qc/first-person-replace.mjs";
import { quotationRanges } from "../qc/mechanics-scan.mjs";
import { houseVoiceIsThirdPerson, houseVoiceSlug } from "../prompt-library/house-voice.mjs";
import { autoFixTransformIds, resolveStyleChoices } from "./render.mjs";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const QUARTERS = ["first", "second", "third", "fourth"];
const HALVES = ["first", "second"];
const LEGAL = "Ltd|Limited|Inc|plc|AG|AS|SA|SE|GmbH|BV|NV|SpA|SCSp|SCS|LP|LLP|LLC|s\\.r\\.o\\.|ApS|AB|Oy";
const CURRENCY = "USD|EUR|GBP|CHF|AUD|CAD|SEK";

function outsideQuotes(text, edit) {
  const ranges = quotationRanges(text);
  if (!ranges.length) return edit(text);
  let out = "";
  let cursor = 0;
  for (const [from, to] of ranges) {
    out += edit(text.slice(cursor, from));
    out += text.slice(from, to);
    cursor = to;
  }
  out += edit(text.slice(cursor));
  return out;
}

function applyPercentSign(text) {
  return text.replace(/(\d[\d.,]*)\s+per\s?cent\b/gi, (full, number) => `${number}%`);
}

function applyQuoteMarks(text, quotes) {
  if (quotes === "double") {
    return text.replace(/(?<![A-Za-z])'([^']*)'(?![A-Za-z])/g, "\"$1\"");
  }
  return text.replace(/"([^"]*)"/g, "'$1'");
}

function formatGrouped(integer, thousands) {
  const digits = String(Math.abs(Math.trunc(integer)));
  const mark = thousands === "apostrophe" ? "'" : thousands === "space" ? " " : ",";
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, mark);
}

function applyMagnitude(text, choices) {
  if (choices.magnitude === "millions") {
    return text.replace(new RegExp(`\\b(${CURRENCY})\\s+(\\d+(?:\\.\\d+)?)\\s+billion\\b`, "gi"), (full, code, amount) => {
      const millions = Math.round(Number(amount) * 1000);
      if (!Number.isFinite(millions)) return full;
      return `${code} ${formatGrouped(millions, choices.thousands)} million`;
    });
  }
  return text.replace(new RegExp(`\\b(${CURRENCY})\\s+(\\d{1,3}(?:[,\\s']\\d{3})+|\\d+)(?:\\.(\\d+))?\\s+million\\b`, "gi"), (full, code, body) => {
    const millions = Number(String(body).replace(/[,'\s]/g, ""));
    if (!Number.isFinite(millions) || millions < 1000) return full;
    const billions = Math.round(millions / 100) / 10;
    return `${code} ${billions.toFixed(1)} billion`;
  });
}

function applyDateForm(text, dates) {
  const month = MONTHS.join("|");
  if (dates === "month_day") {
    return text.replace(new RegExp(`\\b(\\d{1,2})\\s+(${month})\\s+((?:19|20)\\d{2})\\b`, "g"), (full, day, name, year) => `${name} ${Number(day)}, ${year}`);
  }
  return text.replace(new RegExp(`\\b(${month})\\s+(\\d{1,2}),\\s+((?:19|20)\\d{2})\\b`, "g"), (full, name, day, year) => `${Number(day)} ${name} ${year}`);
}

function applyPeriods(text, periods) {
  if (periods === "abbreviated") {
    return text
      .replace(/\b(first|second|third|fourth)\s+quarter(?:\s+of)?\s+((?:19|20)\d{2})\b/gi, (full, name, year) => `Q${QUARTERS.indexOf(name.toLowerCase()) + 1} ${year}`)
      .replace(/\b(first|second)\s+half(?:\s+of)?\s+((?:19|20)\d{2})\b/gi, (full, name, year) => `H${HALVES.indexOf(name.toLowerCase()) + 1} ${year}`)
      .replace(/\bfinancial year\s+((?:19|20)\d{2})\b/gi, "FY$1");
  }
  return text
    .replace(/\bQ([1-4])\s+((?:19|20)\d{2})\b/g, (full, quarter, year) => `${QUARTERS[Number(quarter) - 1]} quarter of ${year}`)
    .replace(/\bH([12])\s+((?:19|20)\d{2})\b/g, (full, half, year) => `${HALVES[Number(half) - 1]} half of ${year}`)
    .replace(/\bFY\s?((?:19|20)\d{2})\b/g, "financial year $1");
}

function applyYearRanges(text) {
  return text.replace(/\b((?:19|20)\d{2})\s+to\s+((?:19|20)\d{2})\b/g, (full, from, to, offset, whole) => {
    const before = whole.slice(Math.max(0, offset - 16), offset);
    if (/\b(?:from|between)\s+$/i.test(before)) return full;
    return `${from}-${to}`;
  });
}

function applyCountryDots(text) {
  return text.replace(/\bU\.S\./g, "US").replace(/\bU\.K\./g, "UK");
}

function applyLegalIdentifiers(text, choice) {
  if (choice !== "omit") return text;
  const pattern = new RegExp(`(\\b\\p{Lu}[\\p{L}\\p{N}&'.-]*(?:\\s+\\p{Lu}[\\p{L}\\p{N}&'.-]*)*)\\s+(?:${LEGAL})\\b`, "gu");
  return text.replace(pattern, "$1");
}

function applyYearOnYear(text) {
  return text.replace(/\b(year|quarter|month)(?:[\s-]+)(?:over|on)(?:[\s-]+)\1\b/gi, (full, word, offset, whole) => {
    const after = whole.slice(offset + full.length);
    const beforeNoun = /^\s+(?!and\b|or\b|but\b|the\b|a\b|an\b|of\b|to\b|in\b|for\b|with\b|from\b|by\b|as\b|is\b|was\b|were\b|are\b|be\b)[a-z]/i.test(after);
    const base = word.toLowerCase();
    const form = beforeNoun ? `${base}-on-${base}` : `${base} on ${base}`;
    return full[0] === full[0].toUpperCase() ? form[0].toUpperCase() + form.slice(1) : form;
  });
}

function applyManager(text) {
  return text
    .replace(/\bgeneral partners\b/gi, (match) => (match[0] === "G" ? "Managers" : "managers"))
    .replace(/\bgeneral partner\b/gi, (match) => (match[0] === "G" ? "Manager" : "manager"));
}

function applyComparables(text) {
  return text.replace(/\blisted comparables\b/gi, "public market comparables");
}

function applyFirstPerson(text, options, choices) {
  const outputType = options.outputType;
  if (!outputType || !houseVoiceSlug(outputType) || !houseVoiceIsThirdPerson(outputType)) return text;
  const named = typeof options.authoringOrganisation === "string" ? options.authoringOrganisation.trim() : "";
  const name = named || "the firm";
  return replaceFirstPerson(text, name).text;
}

const RUNNERS = {
  dashes: (text) => normalizePgHouseStyleCharacters(text),
  percent_sign: (text) => applyPercentSign(text),
  list_commas: (text) => applyListCommas(text),
  quote_marks: (text, _options, choices) => applyQuoteMarks(text, choices.quotes),
  number_spelling: (text, options) => applyNumberSpelling(text, options),
  magnitude: (text, _options, choices) => applyMagnitude(text, choices),
  date_form: (text, _options, choices) => applyDateForm(text, choices.dates),
  periods: (text, _options, choices) => applyPeriods(text, choices.periods),
  year_ranges: (text) => applyYearRanges(text),
  account_spelling: (text, _options, choices) => applyAccountSpelling(text, choices.spelling),
  country_dots: (text) => applyCountryDots(text),
  legal_identifiers: (text, _options, choices) => applyLegalIdentifiers(text, choices.legalIdentifiers),
  year_on_year: (text) => applyYearOnYear(text),
  manager_term: (text) => applyManager(text),
  comparables: (text) => applyComparables(text),
  first_person: (text, options, choices) => applyFirstPerson(text, options, choices),
};

export function dealWordHits(text) {
  if (typeof text !== "string") throw new Error("deal word: text is missing");
  const hits = [];
  for (const match of text.matchAll(/\bdeals?\b/gi)) {
    hits.push({ quote: match[0], start: match.index, end: match.index + match[0].length });
  }
  return hits;
}

export function applyGuideAutoFix(text, options = {}) {
  if (typeof text !== "string") return text;
  const choices = resolveStyleChoices(options.styleChoices || options.houseStyle || options);
  const withRules = { ...options, styleChoices: choices, houseStyle: { spelling: choices.spelling, thousands: choices.thousands } };
  let out = text;
  const fired = [];
  for (const id of autoFixTransformIds()) {
    const run = RUNNERS[id];
    if (!run) throw new Error(`style guide: auto-fix ${id} has no transform`);
    const before = out;
    const next = id === "dashes" || id === "quote_marks" || id === "first_person"
      ? run(out, withRules, choices)
      : outsideQuotes(out, (part) => run(part, withRules, choices));
    if (next !== before) fired.push(id);
    out = next;
  }
  return { text: out, fired };
}
