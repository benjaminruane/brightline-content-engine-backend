/**
 * Auto-fix transforms named by the style guide.
 * Each transform is one entry's transform id. Quoted speech is left alone.
 */
import { normalizePgHouseStyleCharacters } from "../prompt-library/house-characters.mjs";
import { applyNumberSpelling } from "../qc/number-spelling.mjs";
import { applyAccountSpelling } from "../qc/account-spelling.mjs";
import { replaceFirstPerson } from "../qc/first-person-replace.mjs";
import { quotationRanges } from "../qc/mechanics-scan.mjs";
import { houseVoiceIsThirdPerson, houseVoiceSlug } from "../prompt-library/house-voice.mjs";
import { autoFixTransformIds, resolveStyleChoices } from "./render.mjs";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const QUARTERS = ["first", "second", "third", "fourth"];
const HALVES = ["first", "second"];
const LEGAL = "Ltd|LTD|Limited|Inc|INC|plc|Plc|PLC|AG|AS|SA|SE|GmbH|BV|NV|SpA|SCSp|SCS|LP|LLP|LLC|s\\.r\\.o\\.|ApS|AB|Oy";
const CURRENCY = "USD|EUR|GBP|CHF|AUD|CAD|SEK";

const QUOTE_CHARS = new Set(["\"", "'", "\u201C", "\u201D", "\u2018", "\u2019"]);

/**
 * Quoted speech is fixed before any transform. Later edits see the same spans,
 * shifted only when the text outside them changes length.
 */
function mapOutside(text, ranges, edit) {
  if (!ranges.length) return { text: edit(text), ranges: [] };
  let out = "";
  let cursor = 0;
  const next = [];
  for (const [from, to] of ranges) {
    out += edit(text.slice(cursor, from));
    const start = out.length;
    out += text.slice(from, to);
    next.push([start, out.length]);
    cursor = to;
  }
  out += edit(text.slice(cursor));
  return { text: out, ranges: next };
}

function convertBoundaryMarks(text, ranges, quotes) {
  const mark = quotes === "double" ? "\"" : "'";
  const chars = text.split("");
  for (const [from, to] of ranges) {
    if (to - from < 2) continue;
    if (QUOTE_CHARS.has(chars[from])) chars[from] = mark;
    if (QUOTE_CHARS.has(chars[to - 1])) chars[to - 1] = mark;
    for (let i = from + 1; i < to - 1; i += 1) {
      if (!QUOTE_CHARS.has(chars[i])) continue;
      const before = chars.slice(Math.max(from, i - 4), i).join("");
      if (/(^|\n)\s*$/.test(before)) chars[i] = mark;
    }
  }
  for (let i = 0; i < chars.length; i += 1) {
    const curly = chars[i] === "\u201C" || chars[i] === "\u201D" || chars[i] === "\u2018" || chars[i] === "\u2019";
    if (!curly) continue;
    const before = i === 0 ? "" : chars.slice(Math.max(0, i - 4), i).join("");
    if (i === 0 || /(^|\n)\s*$/.test(before)) chars[i] = mark;
  }
  return { text: chars.join(""), ranges };
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

const NOT_THE_NOUN = new Set(["the", "a", "an", "and", "or", "but", "of", "to", "in", "for", "with", "from", "by", "as", "is", "was", "were", "are", "be", "been", "being", "has", "have", "had", "will", "would", "that", "which", "who", "this", "these", "those", "it", "its", "their", "on", "at", "into", "over", "after", "before", "during", "when", "while", "if", "not", "no", "than", "then", "also", "only", "just", "so", "because", "about", "between", "among"]);

function precedesDescribedNoun(text, endIndex) {
  const match = text.slice(endIndex).match(/^\s*([A-Za-z][A-Za-z-]*)/);
  if (!match) return false;
  return !NOT_THE_NOUN.has(match[1].toLowerCase());
}

function keepWhenBeforeNoun(source, pattern, build) {
  return source.replace(pattern, (full, ...rest) => {
    const offset = rest[rest.length - 2];
    if (precedesDescribedNoun(source, offset + full.length)) return full;
    return build(rest);
  });
}

function applyPeriods(text, periods) {
  if (periods === "abbreviated") {
    return text
      .replace(/\b(first|second|third|fourth)\s+quarter(?:\s+of)?\s+((?:19|20)\d{2})\b/gi, (full, name, year) => `Q${QUARTERS.indexOf(name.toLowerCase()) + 1} ${year}`)
      .replace(/\b(first|second)\s+half(?:\s+of)?\s+((?:19|20)\d{2})\b/gi, (full, name, year) => `H${HALVES.indexOf(name.toLowerCase()) + 1} ${year}`)
      .replace(/\bfinancial year\s+((?:19|20)\d{2})\b/gi, "FY$1");
  }
  let out = keepWhenBeforeNoun(text, /\bQ([1-4])\s+((?:19|20)\d{2})\b/g, (rest) => `the ${QUARTERS[Number(rest[0]) - 1]} quarter of ${rest[1]}`);
  out = keepWhenBeforeNoun(out, /\bH([12])\s+((?:19|20)\d{2})\b/g, (rest) => `the ${HALVES[Number(rest[0]) - 1]} half of ${rest[1]}`);
  out = keepWhenBeforeNoun(out, /\bFY\s?((?:19|20)\d{2})\b/g, (rest) => `financial year ${rest[0]}`);
  return out;
}

const DOLLAR_CODES = [
  ["HK$", "HKD"],
  ["NZ$", "NZD"],
  ["C$", "CAD"],
  ["A$", "AUD"],
  ["S$", "SGD"],
];

function dollarCodeFromSources(sources) {
  const body = (Array.isArray(sources) ? sources : [])
    .map((source) => (typeof source?.text === "string" ? source.text : ""))
    .join("\n");
  const found = DOLLAR_CODES.filter(([mark]) => body.includes(mark)).map(([, code]) => code);
  if (found.length > 1) {
    console.error("[style] more than one dollar code is in the sources, so a bare $ was left unchanged", found.join(", "));
    return null;
  }
  return found[0] || "USD";
}

function applyCurrencyCodes(text, sources) {
  let out = text.replace(/£\s*(?=\d)/g, "GBP ").replace(/€\s*(?=\d)/g, "EUR ");
  for (const [mark, code] of DOLLAR_CODES) {
    out = out.replace(new RegExp(`${mark.replace("$", "\\$")}\\s*(?=\\d)`, "g"), `${code} `);
  }
  const bare = dollarCodeFromSources(sources);
  if (!bare) return out;
  return out.replace(/(?<![A-Za-z])\$\s*(?=\d)/g, `${bare} `);
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
  quote_marks: (text, _options, choices) => applyQuoteMarks(text, choices.quotes),
  currency_codes: (text, options) => applyCurrencyCodes(text, options.sources),
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
  let ranges = quotationRanges(out);
  const fired = [];
  for (const id of autoFixTransformIds()) {
    const run = RUNNERS[id];
    if (!run) throw new Error(`style guide: auto-fix ${id} has no transform`);
    const before = out;
    if (id === "quote_marks") {
      const converted = convertBoundaryMarks(out, ranges, choices.quotes);
      out = converted.text;
      ranges = converted.ranges;
    } else {
      const edited = mapOutside(out, ranges, (part) => run(part, withRules, choices));
      out = edited.text;
      ranges = edited.ranges;
    }
    if (out !== before) fired.push(id);
  }
  return { text: out, fired };
}
