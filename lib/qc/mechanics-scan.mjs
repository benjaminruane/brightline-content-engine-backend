/**
 * B444. percentage_notation, em_dash, and first person are found here.
 * B468 adds oxford_comma and number_spelling to the scanned set. Those two
 * are found in list-comma-scan and number-form-scan.
 */
import { FIRST_PERSON_PLURAL_RE } from "./first-person-actor.mjs";
import { spanInsideExpectedPlaceholder } from "../prompt-library/placeholder-guard.mjs";
import { STYLE_GUIDE_LAYER_2_CLIENT } from "./style-guide.mjs";
import { houseVoiceIsThirdPerson, houseVoiceSlug } from "../prompt-library/house-voice.mjs";

/** A number written as "per cent" or "percent". The old percentage filter used this shape. */
export const PERCENT_WORD_RE = /\d[\d.,]*\s+per\s?cent\b/gi;

/** Em dash and en dash. The old em_dash filter used this class. */
export const LONG_DASH_RE = /[\u2014\u2013]/g;

export const SCANNED_STYLE_RULE_IDS = new Set([
  "percentage_notation",
  "em_dash",
  "first_person_plural",
  "oxford_comma",
  "number_spelling",
  "period_placement",
]);

const FIRST_PERSON_STYLE = STYLE_GUIDE_LAYER_2_CLIENT.find((rule) => rule.id === "first_person_plural");

const QUOTED_SPAN_RE = /"([^"]*)"|\u201C([^\u201D]*)\u201D|(?<![A-Za-z])'([^']*)'(?![A-Za-z])/g;

function requireStatement(statement) {
  if (typeof statement !== "string") throw new Error("scanMechanics: statement is missing");
  return statement;
}

function hits(statement, pattern) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const re = new RegExp(pattern.source, flags);
  const out = [];
  for (const match of statement.matchAll(re)) {
    const quote = match[0];
    const start = match.index;
    out.push({ quote, start, end: start + quote.length });
  }
  return out;
}

export function spelledPercentHits(statement) {
  return hits(requireStatement(statement), PERCENT_WORD_RE);
}

export function longDashHits(statement) {
  return hits(requireStatement(statement), LONG_DASH_RE);
}

/**
 * The shared pronoun pattern is case-insensitive, so it also matches the
 * country abbreviation US. That match is not the pronoun.
 */
export function firstPersonHits(statement) {
  return hits(requireStatement(statement), FIRST_PERSON_PLURAL_RE).filter((hit) => hit.quote !== "US");
}

const OPEN_QUOTE = new Set(["'", "\"", "\u201C", "\u2018"]);

function quoteCloser(opener) {
  if (opener === "\u201C") return "\u201D";
  if (opener === "\u2018") return "\u2019";
  return opener;
}

/**
 * Quotation ranges on a whole draft, before it is split into statements.
 * An apostrophe between letters is not a closer. An unmatched opener is not a range.
 */
export function draftQuotationRanges(draft) {
  const text = typeof draft === "string" ? draft : "";
  const ranges = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    const before = i === 0 ? "" : text[i - 1];
    const opens = OPEN_QUOTE.has(ch) && (i === 0 || /[\s([{:;,.\n]/.test(before));
    if (!opens) {
      i += 1;
      continue;
    }
    const closer = quoteCloser(ch);
    let j = i + 1;
    let closed = -1;
    while (j < text.length) {
      const here = text[j];
      const matches = here === closer || (closer === "'" && here === "\u2019") || (closer === "\u2019" && here === "'");
      if (matches) {
        const prev = text[j - 1] || "";
        const next = text[j + 1] || "";
        const apostrophe = (here === "'" || here === "\u2019") && /[A-Za-z]/.test(prev) && /[A-Za-z]/.test(next);
        if (!apostrophe) {
          closed = j;
          break;
        }
      }
      j += 1;
    }
    if (closed < 0) {
      i += 1;
      continue;
    }
    ranges.push([i, closed + 1]);
    i = closed + 1;
  }
  return ranges;
}

/**
 * A statement is inside a quotation when the whole span is, or when the
 * words from its opening quote mark to the end of the statement are.
 * The attribution before that mark ("Simon Borrows said:") stays outside.
 */
export function statementInsideDraftQuotation(draft, start, end) {
  if (!Number.isInteger(start) || !Number.isInteger(end) || end <= start) return false;
  const text = typeof draft === "string" ? draft : "";
  const ranges = draftQuotationRanges(text);
  if (ranges.some(([from, to]) => start >= from && end <= to)) return true;
  const slice = text.slice(start, end);
  const mark = slice.search(/['"\u201C\u2018]/);
  if (mark < 0) return false;
  const quoteStart = start + mark;
  return ranges.some(([from, to]) => quoteStart >= from && end <= to);
}

/** Ranges of double-quoted spans. An unmatched quote is not a span. */
export function quotationRanges(statement) {
  const text = requireStatement(statement);
  const ranges = [];
  const re = new RegExp(QUOTED_SPAN_RE.source, "g");
  for (const match of text.matchAll(re)) {
    ranges.push([match.index, match.index + match[0].length]);
  }
  return ranges;
}

function insideQuotation(start, end, ranges) {
  return ranges.some(([from, to]) => start >= from && end <= to);
}

function firstPersonCode(outputType) {
  const slug = houseVoiceSlug(outputType);
  if (!slug) {
    throw new Error(`scanMechanics: output type ${JSON.stringify(outputType)} is not in the house voice table`);
  }
  if (!houseVoiceIsThirdPerson(slug)) return null;
  const applies = Array.isArray(FIRST_PERSON_STYLE?.applies_to) ? FIRST_PERSON_STYLE.applies_to : null;
  if (!applies) throw new Error("scanMechanics: first_person_plural has no applies_to list");
  return applies.includes(slug) ? "first_person_plural" : "voice_consistency";
}

function namedList(hits) {
  const parts = hits.map((hit) => `'${hit.quote}'`);
  if (parts.length <= 1) return parts[0] || "";
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

/**
 * One hit keeps the sentence this file produced before grouping.
 * Several hits name every occurrence in that same sentence shape.
 */
function concern(code, hits) {
  const category = code === "voice_consistency" ? "editorial" : "style_guide";
  const first = hits[0];
  let text;
  let direction;
  if (hits.length === 1) {
    if (code === "percentage_notation") {
      text = `The percentage is written '${first.quote}'. Write it with %.`;
      direction = `Write '${first.quote}' with %.`;
    } else if (code === "em_dash") {
      text = "A long dash stands in this sentence. Use a hyphen.";
      direction = "Replace the long dash with a hyphen.";
    } else {
      text = "This piece is written in the third person, so \"We\" should be your organisation's name.";
      direction = `Recast '${first.quote}' into the third person.`;
    }
  } else if (code === "percentage_notation") {
    const named = namedList(hits);
    text = `The percentages are written ${named}. Write them with %.`;
    direction = `Write ${named} with %.`;
  } else if (code === "em_dash") {
    text = `${hits.length} long dashes stand in this sentence. Use a hyphen.`;
    direction = "Replace each long dash with a hyphen.";
  } else {
    const named = namedList(hits);
    text = "This piece is written in the third person, so \"We\" should be your organisation's name.";
    direction = `Recast ${named} into the third person.`;
  }
  return {
    concernCode: code,
    rule: code,
    category,
    note: text,
    concernText: text,
    text,
    suggestedDirection: direction,
    quote: first.quote,
    span: hits.map((hit) => ({ startChar: hit.start, endChar: hit.end })),
  };
}

function grouped(code, hits) {
  if (!hits.length) return [];
  return [concern(code, hits)];
}

/**
 * At most one concern per rule. Every match outside quotation marks is a span
 * on that concern. Inside double quotes the style prompt already leaves the
 * writer's quotation alone, and a press release's attributed speech is not
 * the house voice.
 * @param {{ statement: string, outputType: string }} args
 */
export function scanMechanics({ statement, outputType } = {}) {
  const text = requireStatement(statement);
  if (outputType == null || String(outputType).trim() === "") {
    throw new Error("scanMechanics: output type is missing");
  }
  const quoted = quotationRanges(text);
  const outsideHouseVoice = (hit) => !insideQuotation(hit.start, hit.end, quoted)
    && !spanInsideExpectedPlaceholder(text, hit.start, hit.end);
  const code = firstPersonCode(outputType);
  const percents = spelledPercentHits(text).filter(outsideHouseVoice);
  const dashes = longDashHits(text).filter(outsideHouseVoice);
  const pronouns = code ? firstPersonHits(text).filter(outsideHouseVoice) : [];
  const rows = [
    ...grouped("percentage_notation", percents),
    ...grouped("em_dash", dashes),
    ...grouped(code, pronouns),
  ];
  rows.sort((a, b) => a.span[0].startChar - b.span[0].startChar);
  return rows;
}
