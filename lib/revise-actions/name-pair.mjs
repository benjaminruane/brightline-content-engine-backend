/**
 * B374. Pair a swapped name the source states on the card with the
 * unmatched name in the draft. Deterministic. No commentary parse, no
 * Jaccard, no whole-document search. Decline is empty pairs; the card
 * stays as it is today.
 *
 * Same role: the two spans share a left neighbour word or a right
 * neighbour word in their own passages. Unique unmatched 1:1 after
 * dropping contained spans. Anything else stands down.
 */
import {
  isCurrencyCode,
  isGeographyName,
  isOrganisationWord,
  normalizePartyKey,
  organisationSuffixRaw,
} from "../qc/party-tokens.mjs";

const MONTHS = new Set(
  [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
    "jan",
    "feb",
    "mar",
    "apr",
    "jun",
    "jul",
    "aug",
    "sep",
    "sept",
    "oct",
    "nov",
    "dec",
  ].map((w) => w.toLowerCase())
);

const SKIP_SINGLETON = new Set(
  [
    "a",
    "an",
    "the",
    "this",
    "that",
    "these",
    "those",
    "there",
    "here",
    "in",
    "on",
    "at",
    "by",
    "to",
    "of",
    "as",
    "or",
    "if",
    "and",
    "but",
    "for",
    "nor",
    "yet",
    "not",
    "so",
    "from",
    "with",
    "into",
    "over",
    "after",
    "before",
    "once",
    "when",
    "what",
    "which",
    "while",
    "where",
    "some",
    "many",
    "most",
    "such",
    "other",
    "every",
    "each",
    "both",
    "also",
    "then",
    "thus",
    "our",
    "we",
    "us",
    "i",
    "they",
    "them",
    "their",
    "its",
    "his",
    "her",
    "she",
    "he",
    "him",
    "who",
    "whom",
    "how",
    "why",
    "net",
    "per",
    "year",
    "date",
    "new",
    "first",
    "second",
    "third",
    "total",
    "like",
    "looking",
    "meanwhile",
    "subsequently",
    "elsewhere",
    "among",
    "across",
    "following",
    "however",
    "therefore",
    "additionally",
    "separately",
    "finally",
    "overall",
    "importantly",
    "notably",
    "similarly",
    "conversely",
    "previously",
    "currently",
    "further",
    "furthermore",
    "moreover",
    "nevertheless",
    "nonetheless",
    "hence",
    "indeed",
    "rather",
    "instead",
    "otherwise",
    "likewise",
    "accordingly",
    "consequently",
    "during",
    "company",
    "firm",
    "group",
    "portfolio",
  ].map((w) => w.toLowerCase())
);

// AUTHOR-NAME-BLIND: this regex collects maximal name runs in the draft and
// on the card surfaces so a swapped name can be paired. The authoring
// organisation is a legitimate name when either side states it. Excluding
// it would hide a swap the source actually wrote, or invent one where both
// sides already name the house.
const NAME_TOKEN_RE = /St\.|[A-Z][a-z]*[A-Z][A-Za-z]*|[A-Z][a-z]+|\d+[A-Za-z][A-Za-z0-9]*/g;

function asText(value) {
  return typeof value === "string" ? value : "";
}

function escapeRe(value) {
  return asText(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isNameStart(text, index) {
  if (index <= 0) return true;
  const prev = text[index - 1];
  if (prev === "-" || prev === "/") return false;
  return /[^A-Za-z0-9]/.test(prev);
}

function isAcronym(raw) {
  return /^[A-Z]{2,}$/.test(asText(raw));
}

function keepSpan(span) {
  const raw = asText(span?.raw).trim();
  if (!raw) return false;
  const words = raw.split(/\s+/).filter(Boolean);
  if (words.length === 1) {
    if (isAcronym(raw)) return false;
    if (SKIP_SINGLETON.has(normalizePartyKey(raw))) return false;
    if (MONTHS.has(normalizePartyKey(raw))) return false;
    if (isCurrencyCode(raw)) return false;
    if (isOrganisationWord(raw)) return false;
    if (isGeographyName(raw)) {
      return Boolean(organisationSuffixRaw(""));
    }
    return true;
  }
  if (isGeographyName(raw)) return false;
  return true;
}

export function collectNameSpans(text) {
  const input = asText(text);
  const tokens = [];
  NAME_TOKEN_RE.lastIndex = 0;
  let match;
  while ((match = NAME_TOKEN_RE.exec(input))) {
    if (!isNameStart(input, match.index)) continue;
    tokens.push({ raw: match[0], start: match.index, end: match.index + match[0].length });
  }
  const spans = [];
  for (const tok of tokens) {
    const prev = spans[spans.length - 1];
    if (prev && input.slice(prev.end, tok.start) === " ") {
      prev.raw = input.slice(prev.start, tok.end);
      prev.end = tok.end;
      continue;
    }
    spans.push({ raw: tok.raw, start: tok.start, end: tok.end });
  }
  return spans.filter(keepSpan);
}

export function spanInText(span, text) {
  const needle = asText(span).trim();
  const hay = asText(text);
  if (!needle || !hay) return false;
  const rx = new RegExp(`(?:^|[^A-Za-z0-9])${escapeRe(needle)}(?:[^A-Za-z0-9]|$)`, "i");
  return rx.test(hay);
}

function dropContained(spans) {
  const list = [...(Array.isArray(spans) ? spans : [])].sort(
    (a, b) => asText(b.raw).length - asText(a.raw).length
  );
  const kept = [];
  for (const span of list) {
    const raw = asText(span.raw);
    if (kept.some((row) => spanInText(raw, row.raw))) continue;
    kept.push(span);
  }
  return kept;
}

function neighborWord(text, index, dir) {
  const input = asText(text);
  if (dir < 0) {
    const slice = input.slice(0, index);
    const match = slice.match(/([A-Za-z]+|\d[\d,]*(?:\.\d+)?)\s*[,:;'"’]*\s*$/);
    return match ? match[1].toLowerCase() : null;
  }
  const slice = input.slice(index);
  const match = slice.match(/^\s*[,:;'"’]*\s*([A-Za-z]+|\d[\d,]*(?:\.\d+)?)/);
  return match ? match[1].toLowerCase() : null;
}

function sameRole(draftText, draftSpan, sourceText, sourceSpan) {
  const draftLeft = neighborWord(draftText, draftSpan.start, -1);
  const draftRight = neighborWord(draftText, draftSpan.end, 1);
  const sourceLeft = neighborWord(sourceText, sourceSpan.start, -1);
  const sourceRight = neighborWord(sourceText, sourceSpan.end, 1);
  if (draftLeft && sourceLeft && draftLeft === sourceLeft) return true;
  if (draftRight && sourceRight && draftRight === sourceRight) return true;
  return false;
}

function nameToken(span) {
  return {
    kind: "name",
    raw: span.raw,
    start: span.start,
    end: span.end,
    value: span.raw,
  };
}

/**
 * @param {string} statement
 * @param {string[]} passages card surfaces (displayed excerpt, support spans)
 * @returns {{ from: object, to: object }[]}
 */
export function findNamePairs(statement, passages) {
  const draftText = asText(statement);
  const list = (Array.isArray(passages) ? passages : []).map(asText).filter((row) => row.trim());
  if (!draftText.trim() || list.length === 0) return [];

  const draftNames = dropContained(collectNameSpans(draftText));
  const sourceNames = [];
  for (const passage of list) {
    for (const span of collectNameSpans(passage)) {
      sourceNames.push({ ...span, passage });
    }
  }
  const unmatchedDraft = dropContained(
    draftNames.filter((span) => !list.some((passage) => spanInText(span.raw, passage)))
  );
  const unmatchedSource = dropContained(
    sourceNames.filter((span) => !spanInText(span.raw, draftText))
  );
  if (unmatchedDraft.length !== 1 || unmatchedSource.length !== 1) return [];
  const from = unmatchedDraft[0];
  const to = unmatchedSource[0];
  if (!sameRole(draftText, from, to.passage, to)) return [];
  return [{ from: nameToken(from), to: nameToken(to) }];
}
