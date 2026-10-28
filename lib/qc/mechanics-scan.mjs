/**
 * B444. percentage_notation, em_dash, and first person are found here.
 * The patterns are the ones the old filters already used. They are not copied
 * a second time into the filter.
 * HOUSE_VOICE_TABLE decides whether first person is a fault. This file does
 * not restate which output type uses which person.
 */
import { FIRST_PERSON_PLURAL_RE } from "./first-person-actor.mjs";
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
]);

const FIRST_PERSON_STYLE = STYLE_GUIDE_LAYER_2_CLIENT.find((rule) => rule.id === "first_person_plural");

const QUOTED_SPAN_RE = /"([^"]*)"|\u201C([^\u201D]*)\u201D/g;

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
      text = `'${first.quote}' is the writer speaking as we. This piece speaks in the third person.`;
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
    text = `${named} are the writer speaking as we. This piece speaks in the third person.`;
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
  const code = firstPersonCode(outputType);
  const percents = spelledPercentHits(text).filter((hit) => !insideQuotation(hit.start, hit.end, quoted));
  const dashes = longDashHits(text).filter((hit) => !insideQuotation(hit.start, hit.end, quoted));
  const pronouns = code
    ? firstPersonHits(text).filter((hit) => !insideQuotation(hit.start, hit.end, quoted))
    : [];
  const rows = [
    ...grouped("percentage_notation", percents),
    ...grouped("em_dash", dashes),
    ...grouped(code, pronouns),
  ];
  rows.sort((a, b) => a.span[0].startChar - b.span[0].startChar);
  return rows;
}
