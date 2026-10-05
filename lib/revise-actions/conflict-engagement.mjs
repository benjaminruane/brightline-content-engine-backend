/**
 * Exact-quote locator for contradicted evidence findings.
 * Licensed pairs: same quantity by name, every writable figure or none.
 * Pure. No model client.
 */
import { excerptPassage } from "./thing1.mjs";
import {
  detectDisagreementOnFinding,
  detectSourceDisagreement,
  disagreementCopyValues,
  governancePairFrom,
  labelForSource,
  normalizeSourceRulings,
  rulingForPair,
} from "./source-governance.mjs";
import { houseStyleOfferedToken, offeredTokenLicensedByExcerptTokens } from "./house-style-offer.mjs";
import { findNamePairs } from "./name-pair.mjs";

export const CONFLICT_PROPOSAL_UNENGAGED = "CONFLICT_PROPOSAL_UNENGAGED";
export const CONFIRMING_PASSAGE_LABEL = "Confirmed excerpt";

const MONTHS =
  "January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec";

const MONTH_INDEX = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

const CURRENCIES = "EUR|USD|GBP|SEK|CHF|NOK|DKK|JPY";
const SYMBOL_CURRENCIES = "€|£|¥";

const TOKEN_RE = new RegExp(
  [
    String.raw`(?:${CURRENCIES})\s+\d+(?:[.,]\d+)?(?:\s*(?:million|billion))?`,
    String.raw`US\s*\$\s*\d+(?:[.,]\d+)?(?:\s*(?:million|billion))?`,
    String.raw`(?:${SYMBOL_CURRENCIES})\s*\d+(?:[.,]\d+)?(?:\s*(?:million|billion))?`,
    String.raw`\$\s*\d+(?:[.,]\d+)?(?:\s*(?:million|billion))?`,
    String.raw`\d+(?:[.,]\d+)?\s*(?:million|billion)`,
    String.raw`\d+(?:\.\d+)?\s*%`,
    String.raw`\d+(?:\.\d+)?\s*(?:percent|per\s+cent)\b`,
    String.raw`\d+(?:\.\d+)?\s*x\b`,
    String.raw`\d+(?:\.\d+)?\s+times\b`,
    String.raw`\d{1,3}(?:['\u2019]\d{3})+`,
    String.raw`\d{1,2}\s+(?:${MONTHS})(?:\s+\d{4})?`,
    String.raw`(?:${MONTHS})\s+\d{4}`,
    String.raw`\b(?:${MONTHS})\b`,
    String.raw`\b(?:19|20)\d{2}\b`,
    String.raw`(?<![A-Za-z])\d+(?:\.\d+)?(?![A-Za-z])`,
  ].join("|"),
  "gi"
);

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "of",
  "to",
  "for",
  "in",
  "on",
  "at",
  "as",
  "from",
  "with",
  "and",
  "or",
  "by",
  "its",
  "their",
  "this",
  "that",
  "is",
  "was",
  "has",
  "have",
  "been",
  "currently",
  "approximately",
  "more",
  "than",
  "over",
  "during",
  "but",
]);

const ABBREV_PHRASES = [
  ["internal rate of return", "IRR"],
  ["money on invested capital", "MOIC"],
  ["money-on-invested-capital", "MOIC"],
  ["multiple on invested capital", "MOIC"],
  ["annual recurring revenue", "ARR"],
  ["net asset value", "NAV"],
  ["like-for-like", "LFL"],
  ["like for like", "LFL"],
];

const ABBREV_WORDS = {
  irr: "IRR",
  moic: "MOIC",
  arr: "ARR",
  nav: "NAV",
  dpi: "DPI",
  tvpi: "TVPI",
  ebitda: "EBITDA",
  aum: "AUM",
  lfl: "LFL",
  stake: "Stake",
  people: "Headcount",
  employees: "Headcount",
  employee: "Headcount",
  employs: "Headcount",
  team: "Headcount",
  headcount: "Headcount",
  staff: "Headcount",
  personnel: "Headcount",
  stores: "Stores",
  store: "Stores",
  locations: "Stores",
  sites: "Stores",
};

const COMPONENT_CUES = /\b(?:split|comprising|of which|including)\b/i;
const DEPARTMENT_WORD =
  /\b(?:engineering|sales|support|implementation|administrative|g&a|customer success|customer support)\b/i;
const TOTAL_CUE = /\b(?:total|in total|employs|headcount|team of)\b/i;
export const SUPPORTING_CLASS = new Set(["confirmed", "partially_confirmed"]);

function norm(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function collapse(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function monthIndex(word) {
  return MONTH_INDEX[norm(word)] || null;
}

function firstNumber(raw) {
  const match = String(raw).match(/\d+(?:[.,]\d+)?/);
  if (!match) return null;
  return Number(match[0].replace(",", ""));
}

function parseDateParts(raw) {
  const text = String(raw);
  const monthMatch = text.match(new RegExp(MONTHS, "i"));
  const month = monthMatch ? monthIndex(monthMatch[0]) : null;
  const yearMatch = text.match(/\b((?:19|20)\d{2})\b/);
  const year = yearMatch ? Number(yearMatch[1]) : null;
  const dayMatch = text.match(/^(\d{1,2})\s/);
  const day = dayMatch ? Number(dayMatch[1]) : null;
  return { month, year, day };
}

function currencyFromRaw(text) {
  const s = String(text);
  if (/US\s*\$/i.test(s)) return "USD";
  if (/€/.test(s)) return "EUR";
  if (/£/.test(s)) return "GBP";
  if (/¥/.test(s)) return "JPY";
  const code = s.match(new RegExp(`\\b(${CURRENCIES})\\b`, "i"));
  return code ? code[1].toUpperCase() : null;
}

function classify(raw) {
  const text = String(raw);
  const currency = currencyFromRaw(text);
  if (currency || /\b(?:million|billion)\b/i.test(text)) {
    const scale = /\bbillion\b/i.test(text) ? "billion" : /\bmillion\b/i.test(text) ? "million" : "ones";
    return {
      kind: "money",
      scale,
      currency,
    };
  }
  if (/%/.test(text) || /\bpercent\b/i.test(text) || /\bper\s+cent\b/i.test(text)) {
    return { kind: "percentage", scale: null, currency: null };
  }
  if (/x$/i.test(text.trim()) || /\btimes\b/i.test(text)) {
    return { kind: "multiple", scale: null, currency: null };
  }
  if (new RegExp(`(?:${MONTHS})`, "i").test(text) || /^(?:19|20)\d{2}$/.test(text.trim())) {
    return { kind: "date", scale: null, currency: null };
  }
  if (/['\u2019]/.test(text)) return { kind: "count", scale: "grouped", currency: null };
  return { kind: "count", scale: null, currency: null };
}

function kindKey(token) {
  const base = token.scale ? `${token.kind}:${token.scale}` : token.kind;
  if (token.kind === "money") {
    return token.currency ? `${base}:${token.currency}` : `${base}:bare`;
  }
  return base;
}

export function sameQuantity(a, b) {
  return kindKey(a) === kindKey(b) && a.value === b.value;
}

export function tokenizeQuantities(text) {
  const input = String(text ?? "");
  const tokens = [];
  TOKEN_RE.lastIndex = 0;
  let match;
  while ((match = TOKEN_RE.exec(input))) {
    const raw = match[0];
    const date = parseDateParts(raw);
    const numeric = firstNumber(raw);
    const { kind, scale, currency } = classify(raw);
    let value = numeric;
    if (kind === "date" && value == null && date.month != null) value = date.month;
    if (value == null || Number.isNaN(value)) continue;
    tokens.push({
      raw,
      value,
      kind,
      scale,
      currency: currency || null,
      month: date.month,
      year: date.year,
      day: date.day,
      start: match.index,
      end: match.index + raw.length,
    });
  }
  return tokens;
}

export function citationRanges(excerpt) {
  const text = String(excerpt ?? "");
  const ranges = [];
  const patterns = [
    /\bnot\b([\s\S]*?)(?:\bas stated\b|(?:\.(?:\s|$))|$)/gi,
    /\bcompared with\b([\s\S]*?)(?:\.(?:\s|$)|$)/gi,
    /\bversus\b([\s\S]*?)(?:\.(?:\s|$)|$)/gi,
    /\brather than\b([\s\S]*?)(?:\.(?:\s|$)|$)/gi,
    /\binstead of\b([\s\S]*?)(?:\.(?:\s|$)|$)/gi,
    /\bas stated\b([\s\S]*?)(?:\.(?:\s|$)|$)/gi,
    /\bin our initial\b([\s\S]*?)(?:\.(?:\s|$)|$)/gi,
    /\bin our recommendation\b([\s\S]*?)(?:\.(?:\s|$)|$)/gi,
    /\bin the memo\b([\s\S]*?)(?:\.(?:\s|$)|$)/gi,
  ];
  for (const rx of patterns) {
    rx.lastIndex = 0;
    let match;
    while ((match = rx.exec(text))) {
      ranges.push({ start: match.index, end: match.index + match[0].length });
    }
  }
  return ranges;
}

function overlaps(token, range) {
  return token.start < range.end && token.end > range.start;
}

export function tokenInCitation(token, ranges) {
  return ranges.some((range) => overlaps(token, range));
}

function isClauseBreak(text, index) {
  const ch = text[index];
  if (ch === "." || ch === ";" || ch === ":") return true;
  if (ch === ",") {
    const rest = text.slice(index + 1);
    const after = rest.match(/^\s*(\S)/);
    if (!after) return true;
    const c = after[1];
    if (/\d/.test(c) || /[A-Z]/.test(c)) return true;
  }
  return false;
}

function rangeRole(text, token) {
  const before = String(text).slice(Math.max(0, token.start - 16), token.start);
  if (/\bto\s+$/i.test(before)) return "to";
  if (/\bfrom\s+$/i.test(before)) return "from";
  return null;
}

function copyNames(names) {
  return {
    abbrevs: new Set(names?.abbrevs || []),
    content: new Set(names?.content || []),
  };
}

function namesEmpty(names) {
  return !names || (names.abbrevs.size === 0 && names.content.size === 0);
}

function hostFragmentBounds(text, token) {
  let start = 0;
  let end = text.length;
  for (let i = token.start - 1; i >= 0; i--) {
    if (isClauseBreak(text, i)) {
      start = i + 1;
      break;
    }
  }
  for (let i = token.end; i < text.length; i++) {
    if (isClauseBreak(text, i)) {
      end = i;
      break;
    }
  }
  return { start, end };
}

function sliceWords(text, from, to) {
  return String(text.slice(from, to) || "")
    .replace(/[^A-Za-z0-9%&'-]+/g, " ")
    .trim();
}

function nearbyParens(text, token, bounds) {
  const window = text.slice(Math.max(bounds.start, token.start - 80), Math.min(bounds.end, token.end + 40));
  const found = [];
  const rx = /\(([^)]{1,40})\)/g;
  let match;
  while ((match = rx.exec(window))) found.push(match[1]);
  return found.join(" ");
}

function contentWordList(words) {
  const out = [];
  for (const word of words) {
    const n = norm(word);
    if (!n || STOP_WORDS.has(n)) continue;
    out.push(n);
  }
  return out;
}

const MEASURE_BREAK = new Set(["across", "throughout", "between", "within", "including", "collectively"]);

function immediateMeasurePhrase(rightRaw, kind) {
  if (kind === "money" || kind === "percentage" || kind === "multiple" || kind === "date") return "";
  const words = String(rightRaw || "")
    .replace(/[^A-Za-z0-9%&'-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const out = [];
  for (const word of words) {
    const n = norm(word);
    if (!n || STOP_WORDS.has(n) || MEASURE_BREAK.has(n)) break;
    if (ABBREV_WORDS[n] === "Headcount") {
      out.push("people");
      break;
    }
    if (ABBREV_WORDS[n]) break;
    if (/^[A-Z]/.test(word) && out.length > 0) break;
    out.push(n);
    if (out.length >= 4) break;
  }
  return out.join(" ");
}

function stripPlural(word) {
  if (word.length <= 3) return word;
  if (word.endsWith("ies") && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith("es") && word.length > 4) return word.slice(0, -2);
  if (word.endsWith("s")) return word.slice(0, -1);
  return word;
}

function nameSets(blob) {
  let text = ` ${norm(blob)} `;
  const abbrevs = new Set();
  for (const [phrase, key] of ABBREV_PHRASES) {
    if (text.includes(phrase)) {
      abbrevs.add(key);
      text = text.replaceAll(phrase, " ");
    }
  }
  const words = text.trim().split(/\s+/).filter(Boolean);
  const content = new Set();
  for (const word of words) {
    if (STOP_WORDS.has(word)) continue;
    const mapped = ABBREV_WORDS[word];
    if (mapped) {
      abbrevs.add(mapped);
      continue;
    }
    content.add(stripPlural(word));
  }
  return { abbrevs, content };
}

function trimRightWindow(text, from, limit) {
  const raw = text.slice(from, limit);
  const citation = raw.search(/\b(?:not|compared with|versus|rather than|instead of|as stated)\b/i);
  const scope = raw.search(/\b(?:across|throughout|between)\s+[A-Z]/);
  let end = raw.length;
  if (citation >= 0) end = Math.min(end, citation);
  if (scope >= 0) end = Math.min(end, scope);
  return raw.slice(0, end);
}

export function annotateTokens(text) {
  const tokens = tokenizeQuantities(text);
  const annotated = tokens.map((token, index) => {
    const bounds = hostFragmentBounds(text, token);
    const fragment = text.slice(bounds.start, bounds.end);
    const prevForName =
      token.kind === "date"
        ? null
        : [...tokens.slice(0, index)].reverse().find((row) => row.kind !== "date");
    const nextForName =
      token.kind === "date" ? null : tokens.slice(index + 1).find((row) => row.kind !== "date");
    const prevEnd = prevForName ? Math.max(prevForName.end, bounds.start) : bounds.start;
    const nextStart = nextForName ? Math.min(nextForName.start, bounds.end) : bounds.end;
    const left = sliceWords(text, Math.max(bounds.start, prevEnd), token.start);
    const rightRaw = trimRightWindow(text, token.end, Math.max(token.end, nextStart));
    const rightWords = contentWordList(rightRaw.split(/\s+/)).slice(0, 6);
    const paren = nearbyParens(text, token, bounds);
    const names = nameSets(`${left} ${paren} ${rightWords.join(" ")}`);
    const measurePhrase = immediateMeasurePhrase(rightRaw, token.kind);
    const qualifierText = `${left} ${paren} ${rightRaw}`;
    const cueAt = fragment.search(COMPONENT_CUES);
    const afterCue = cueAt >= 0 && token.start >= bounds.start + cueAt;
    const component = afterCue && (DEPARTMENT_WORD.test(fragment) || COMPONENT_CUES.test(fragment));
    const total = TOTAL_CUE.test(fragment) && !component;
    return {
      ...token,
      fragment,
      fragmentStart: bounds.start,
      fragmentEnd: bounds.end,
      names,
      measurePhrase,
      qualifierText,
      component,
      total,
      rangeRole: rangeRole(text, token),
    };
  });
  for (let i = 0; i < annotated.length; i++) {
    const token = annotated[i];
    if (token.kind === "date" || token.rangeRole !== "to" || !namesEmpty(token.names)) continue;
    const prev = [...annotated.slice(0, i)].reverse().find((row) => row.kind === token.kind);
    if (!prev || namesEmpty(prev.names)) continue;
    token.names = copyNames(prev.names);
  }
  return annotated;
}

function namesCoveredBy(source, draft) {
  if (!source || !draft) return false;
  if (source.abbrevs.size === 0 && source.content.size === 0) return false;
  if (source.abbrevs.size > 0) {
    for (const key of source.abbrevs) {
      if (draft.abbrevs.has(key)) return true;
    }
    return false;
  }
  for (const word of source.content) {
    if (!draft.content.has(word)) return false;
  }
  return source.content.size > 0;
}

function namesBind(a, b) {
  return namesMatch(a, b) || namesCoveredBy(b, a);
}

function namesMatch(a, b) {
  if (a.abbrevs.size === 0 && a.content.size === 0) return false;
  if (b.abbrevs.size === 0 && b.content.size === 0) return false;
  if (a.abbrevs.size > 0 || b.abbrevs.size > 0) {
    for (const key of a.abbrevs) {
      if (b.abbrevs.has(key)) return true;
    }
    return false;
  }
  let inter = 0;
  for (const word of a.content) {
    if (b.content.has(word)) inter += 1;
  }
  if (inter === 0) return false;
  const union = new Set([...a.content, ...b.content]);
  return inter / union.size >= 0.6;
}

function extractQualifiers(fragment) {
  const text = String(fragment ?? "");
  const families = {};
  if (/\bnet\b/i.test(text)) families.basis = "net";
  else if (/\bgross\b/i.test(text)) families.basis = "gross";
  if (/\bunrealis(?:ed|zed)\b/i.test(text)) families.realised = "unrealised";
  else if (/\brealis(?:ed|zed)\b/i.test(text)) families.realised = "realised";
  if (/\b(?:since inception|inception)\b/i.test(text)) families.window = "inception";
  else if (/\b(?:annualis(?:ed|zed))\b/i.test(text)) families.window = "annualised";
  else if (/\b(?:last twelve months|ltm|trailing twelve months|ttm)\b/i.test(text)) families.window = "ltm";
  else if (/\b(?:year to date|ytd)\b/i.test(text)) families.window = "ytd";
  if (/\bper[-\s]?share\b/i.test(text) || /\/share\b/i.test(text)) families.perShare = "per-share";
  if (/\b(?:constant currency|fx-neutral|\bcc\b)\b/i.test(text)) families.fx = "cc";
  if (/\bpro[-\s]?forma\b/i.test(text)) families.proForma = "pro-forma";
  if (/\b(?:net of fees|after fees)\b/i.test(text)) families.fees = "after";
  else if (/\b(?:before fees|gross of fees)\b/i.test(text)) families.fees = "before";
  if (/\bunlevered\b/i.test(text)) families.leverage = "unlevered";
  else if (/\blevered\b/i.test(text)) families.leverage = "levered";
  else if (/\bequity\b/i.test(text) && /\b(?:irr|moic)\b/i.test(text)) families.leverage = "equity";
  return families;
}

function sourceNamesDraftFigure(excerpt, draftToken) {
  const ranges = citationRanges(excerpt);
  if (ranges.length === 0) return false;
  for (const token of tokenizeQuantities(excerpt)) {
    if (!sameQuantity(token, draftToken)) continue;
    if (tokenInCitation(token, ranges)) return true;
  }
  return false;
}

function qualifierAllows(draftToken, sourceToken, excerpt) {
  const draftQ = extractQualifiers(draftToken.qualifierText || draftToken.fragment);
  const sourceQ = extractQualifiers(sourceToken.qualifierText || sourceToken.fragment);
  const families = new Set([...Object.keys(draftQ), ...Object.keys(sourceQ)]);
  const named = sourceNamesDraftFigure(excerpt, draftToken);
  for (const family of families) {
    const d = draftQ[family];
    const s = sourceQ[family];
    if (d && s && d !== s) return false;
    if (d && s && d === s) continue;
    if (!d && !s) continue;
    if (d && !s) {
      if (named) continue;
      return false;
    }
    if (!d && s) return false;
  }
  return true;
}

export function compatibleTokens(draft, source, excerpt) {
  const bothMoney = draft.kind === "money" && source.kind === "money";
  if (bothMoney) {
    if (Boolean(draft.currency) !== Boolean(source.currency)) return false;
    if (draft.currency && source.currency && draft.currency !== source.currency) return false;
    if (draft.value === source.value && draft.scale === source.scale) return false;
  } else {
    if (kindKey(draft) !== kindKey(source)) return false;
    if (draft.kind === "money" && Boolean(draft.currency) !== Boolean(source.currency)) return false;
    if (draft.value === source.value) return false;
  }
  if (draft.component) return false;
  if (source.component) return false;
  if (draft.rangeRole && source.rangeRole && draft.rangeRole !== source.rangeRole) return false;
  if (!namesBind(draft.names, source.names)) return false;
  if (!qualifierAllows(draft, source, excerpt)) return false;
  return true;
}

function parentheticalRanges(excerpt) {
  const text = String(excerpt ?? "");
  const ranges = [];
  const rx = /\([^)]*\)/g;
  let match;
  while ((match = rx.exec(text))) {
    ranges.push({ start: match.index, end: match.index + match[0].length });
  }
  return ranges;
}

function assertedSourceTokens(excerpt, sourceTokens, extraRanges = []) {
  const cited = [...citationRanges(excerpt), ...extraRanges];
  return sourceTokens.filter((token) => !tokenInCitation(token, cited));
}

export function kindNameSame(draft, source) {
  if (kindKey(draft) !== kindKey(source)) return false;
  if (draft.kind === "money" && Boolean(draft.currency) !== Boolean(source.currency)) return false;
  if (draft.component) return false;
  if (source.component) return false;
  if (!namesMatch(draft.names, source.names)) return false;
  return true;
}

function figureAgrees(draft, source) {
  if (draft.value !== source.value) return false;
  return kindNameSame(draft, source);
}

/**
 * AGREEMENT pass. A draft numeric token is AGREED when an asserted source
 * token (citation ranges and parentheticals excluded) has the same kind, the
 * same name set, and an equal value. Reuses kindNameSame / namesMatch /
 * kindKey. Does not use compatibleTokens, which excludes equal values.
 */
export function findFigureAgreements(statement, excerpt) {
  const draftTokens = annotateTokens(statement);
  const sourceTokens = annotateTokens(excerpt);
  const asserted = assertedSourceTokens(excerpt, sourceTokens, parentheticalRanges(excerpt));
  const agreements = [];
  for (const draft of draftTokens) {
    if (draft.kind === "date") continue;
    const source = asserted.find((token) => figureAgrees(draft, token));
    if (!source) continue;
    agreements.push({ draft, source });
  }
  return agreements;
}

function agreedDraftStarts(statement, excerpt) {
  return new Set(findFigureAgreements(statement, excerpt).map((row) => row.draft.start));
}

function agreementExplain(agreements) {
  const first = Array.isArray(agreements) ? agreements[0] : null;
  if (!first) return null;
  return {
    code: "conflict_suppressed_figure_agrees",
    values: {
      draftRaw: first.draft.raw,
      sourceRaw: first.source.raw,
    },
  };
}

function proposalChangesAgreed(statement, resultingSentence, agreements) {
  if (!Array.isArray(agreements) || agreements.length === 0) return false;
  const before = quantityRawCounts(statement);
  const after = quantityRawCounts(resultingSentence);
  for (const { draft } of agreements) {
    const key = draft.raw;
    if ((after.get(key) || 0) < (before.get(key) || 0)) return true;
  }
  return false;
}

function datesPairable(draft, source) {
  if (draft.kind !== "date" || source.kind !== "date") return false;
  if (draft.year === source.year && draft.month === source.month && draft.day === source.day) {
    return false;
  }
  const draftFull = draft.month != null && draft.year != null;
  const sourceFull = source.month != null && source.year != null;
  if (!draftFull || !sourceFull) return false;
  if (draft.day != null && source.day == null) return false;
  if (source.day != null && draft.day == null) return false;
  return namesBind(draft.names, source.names);
}

/**
 * Identity pairs only (name, kind, R6). R1/R3/R4/R5 are applied in applyConflictProposal.
 * Two source figures for one draft name: no pairs (decline the statement).
 * AGREED draft tokens are never the `from` side of a pair.
 * Dates pair when the source passage asserts a date for the same subject (B352).
 * Ambiguous date binding stands down rather than aborting the money pairs.
 */
export function findCandidatePairs(statement, excerpt) {
  const draftTokens = annotateTokens(statement);
  const sourceTokens = annotateTokens(excerpt);
  const asserted = assertedSourceTokens(excerpt, sourceTokens);
  const assertedDates = assertedSourceTokens(excerpt, sourceTokens, parentheticalRanges(excerpt)).filter(
    (token) => token.kind === "date"
  );
  const agreedStarts = agreedDraftStarts(statement, excerpt);
  const pairs = [];
  const seen = new Set();

  function addPair(from, to) {
    const key = `${kindKey(from)}:${from.value}->${to.value}:${from.start}`;
    if (seen.has(key)) return;
    seen.add(key);
    pairs.push({ from, to });
  }

  const usedSource = new Set();
  for (const draft of draftTokens) {
    if (draft.kind === "date") {
      const matches = assertedDates.filter(
        (token) => !usedSource.has(token.start) && datesPairable(draft, token)
      );
      if (matches.length !== 1) continue;
      usedSource.add(matches[0].start);
      addPair(draft, matches[0]);
      continue;
    }
    if (agreedStarts.has(draft.start)) continue;
    const matches = asserted.filter(
      (token) => !usedSource.has(token.start) && compatibleTokens(draft, token, excerpt)
    );
    if (matches.length === 0) continue;
    if (matches.length !== 1) return [];
    usedSource.add(matches[0].start);
    addPair(draft, matches[0]);
  }

  return pairs;
}

function kindNameCompatible(draft, source) {
  if (draft.value === source.value) return false;
  return kindNameSame(draft, source);
}

function qualifierDisplay(token) {
  const q = extractQualifiers(token.qualifierText || token.fragment);
  const abbr = [...(token.names?.abbrevs || [])][0] || "";
  const bits = [token.raw];
  if (q.basis && !new RegExp(`\\b${q.basis}\\b`, "i").test(token.raw)) bits.push(q.basis);
  if (abbr && !new RegExp(`\\b${abbr}\\b`, "i").test(bits.join(" "))) bits.push(abbr);
  return bits.join(" ");
}

function findQualifierClash(statement, excerpt) {
  const draftTokens = annotateTokens(statement);
  const sourceTokens = annotateTokens(excerpt);
  const asserted = assertedSourceTokens(excerpt, sourceTokens);
  const agreedStarts = agreedDraftStarts(statement, excerpt);
  const usedSource = new Set();
  for (const draft of draftTokens) {
    if (draft.kind === "date") continue;
    if (agreedStarts.has(draft.start)) continue;
    const matches = asserted.filter(
      (token) => !usedSource.has(token.start) && kindNameCompatible(draft, token)
    );
    if (matches.length !== 1) continue;
    const source = matches[0];
    usedSource.add(source.start);
    if (qualifierAllows(draft, source, excerpt)) continue;
    return { from: draft, to: source };
  }
  return null;
}

function serializeWritePairs(pairs) {
  return (Array.isArray(pairs) ? pairs : []).map((pair) => ({
    fromRaw: pair.from.raw,
    toRaw: pair.to.raw,
    measurePhrase: pair.from.measurePhrase || "",
  }));
}

function silentQualifier(pairs, excerpt) {
  for (const pair of pairs) {
    if (pair.companion || pair.from?.kind === "date") continue;
    const draftQ = extractQualifiers(pair.from.qualifierText || pair.from.fragment);
    const sourceQ = extractQualifiers(pair.to.qualifierText || pair.to.fragment);
    for (const family of Object.keys(draftQ)) {
      if (draftQ[family] && !sourceQ[family] && sourceNamesDraftFigure(excerpt, pair.from)) {
        return { word: draftQ[family], value: pair.to.raw };
      }
    }
  }
  return null;
}

function figureLabel(token) {
  const measure = token?.measurePhrase ? ` ${token.measurePhrase}` : "";
  return `${token.raw}${measure}`.trim();
}

function remainingDraftTokens(statement, writable) {
  const licensed = licensedStarts(writable);
  return annotateTokens(statement).filter((token) => !licensed.has(token.start));
}

function confirmedFigureLabel(token) {
  const measure = String(token?.measurePhrase || "").trim();
  if (token?.kind === "count" && measure) {
    if (/\bunits?\b/i.test(measure)) {
      const singularized = measure.replace(/\bunits\b/i, "unit");
      return /\bcount\b/i.test(singularized) ? singularized : `${singularized} count`;
    }
    return measure;
  }
  if (measure) return measure;
  return String(token?.raw || "").trim();
}

function spanIsConflictingExcerpt(span, excerpt) {
  const passage = collapse(span?.passage);
  const conflict = collapse(excerpt);
  if (!passage || !conflict) return false;
  return passage.includes(conflict) || conflict.includes(passage);
}

/**
 * A confirming passage from the pairing document that supports a draft figure
 * the locator is not changing. Reads supportSpans already on the card.
 * Does not re-read source files or widen pairing.
 * When more than one span qualifies, the first in card order wins.
 */
export function selectConfirmingPassage(finding, statement, excerpt, writable) {
  const remaining = remainingDraftTokens(statement, writable);
  if (remaining.length === 0) return null;
  const pairingSource = pairingSourceRefId(finding, excerpt);
  if (pairingSource == null) return null;
  const ofSource = supportSpansOf(finding).filter((span) => span.sourceRefId === pairingSource);
  for (const span of ofSource) {
    if (!SUPPORTING_CLASS.has(span.classification)) continue;
    if (typeof span.passage !== "string" || !span.passage.trim()) continue;
    if (spanIsConflictingExcerpt(span, excerpt)) continue;
    const matched = remaining.find((token) => passageAssertsDraftValue(span.passage, token));
    if (!matched) continue;
    const figureLabelText = confirmedFigureLabel(matched);
    if (!figureLabelText) continue;
    return {
      passage: span.passage.trim(),
      label: CONFIRMING_PASSAGE_LABEL,
      figureLabel: figureLabelText,
    };
  }
  return null;
}

export function excerptTextForFinding(finding) {
  const fromPrimary = excerptPassage(finding?.primaryExcerpt);
  if (fromPrimary) return fromPrimary;
  const card = finding?.card;
  const fromCardPrimary = excerptPassage(card?.primaryExcerpt);
  if (fromCardPrimary) return fromCardPrimary;
  const fromConflict = excerptPassage(card?.conflictExcerpt);
  if (fromConflict) return fromConflict;
  const thing2 = typeof finding?.thing2 === "string" ? finding.thing2.trim() : "";
  return thing2 || "";
}

export function displayedExcerpt(finding) {
  const fromCard = excerptPassage(finding?.card?.primaryExcerpt);
  if (fromCard) return fromCard;
  return excerptTextForFinding(finding);
}

function sourceFigureVisibleOnCard(finding, writable) {
  const surfaces = [displayedExcerpt(finding)];
  for (const span of supportSpansOf(finding)) {
    if (typeof span.passage === "string" && span.passage.trim()) surfaces.push(span.passage);
  }
  const text = surfaces.join("\n");
  for (const pair of writable) {
    if (pair.companion || pair.r3) continue;
    const raw = String(pair?.to?.raw ?? "").trim();
    if (!raw || !text.includes(raw)) return false;
  }
  return true;
}

export function isContradictedEvidenceFinding(finding) {
  if (finding?.kind !== "evidence") return false;
  const rule = norm(finding.rule || finding.sort?.rule);
  return rule === "conflicting" || rule === "conflict";
}

export function supportSpansOf(finding) {
  const spans = finding?.card?.supportSpans;
  return Array.isArray(spans) ? spans : [];
}

function passagesForNamePairing(finding, excerpt) {
  const out = [];
  const seen = new Set();
  function add(text) {
    const value = typeof text === "string" ? text.trim() : "";
    if (!value || seen.has(value)) return;
    seen.add(value);
    out.push(value);
  }
  add(excerpt);
  add(displayedExcerpt(finding));
  for (const span of supportSpansOf(finding)) add(span.passage);
  add(excerptPassage(finding?.card?.conflictExcerpt));
  return out;
}

function uniqueByValue(tokens) {
  const seen = new Set();
  const out = [];
  for (const token of tokens) {
    const key = `${kindKey(token)}:${token.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(token);
  }
  return out;
}

function uniqueKindQuantityPairs(statement, sourceText) {
  const draft = annotateTokens(statement).filter((token) => token.kind !== "date");
  const source = annotateTokens(sourceText).filter((token) => token.kind !== "date");
  const agreed = agreedDraftStarts(statement, sourceText);
  const pairs = [];
  const kinds = new Set([...draft, ...source].map(kindKey));
  for (const key of kinds) {
    const dUn = uniqueByValue(
      draft.filter(
        (token) =>
          kindKey(token) === key &&
          !agreed.has(token.start) &&
          !source.some((row) => sameQuantity(token, row))
      )
    );
    const sUn = uniqueByValue(
      source.filter((token) => kindKey(token) === key && !draft.some((row) => sameQuantity(row, token)))
    );
    if (dUn.length === 1 && sUn.length === 1 && dUn[0].value !== sUn[0].value) {
      pairs.push({ from: dUn[0], to: sUn[0] });
    }
  }
  return pairs;
}

function leftoverQuantityDisagrees(statement, sourceText, writable) {
  const licensed = licensedStarts(writable);
  const agreed = agreedDraftStarts(statement, sourceText);
  const draft = annotateTokens(statement).filter((token) => token.kind !== "date");
  const source = annotateTokens(sourceText).filter((token) => token.kind !== "date");
  for (const token of draft) {
    if (licensed.has(token.start) || agreed.has(token.start)) continue;
    const sameKind = source.filter((row) => kindKey(row) === kindKey(token));
    if (sameKind.some((row) => row.value !== token.value)) return true;
  }
  return false;
}

function mergeWritePairs(...lists) {
  const out = [];
  const seen = new Set();
  for (const list of lists) {
    for (const pair of Array.isArray(list) ? list : []) {
      const start = pair?.from?.start;
      if (start == null || seen.has(start)) continue;
      seen.add(start);
      out.push(pair);
    }
  }
  return out;
}

export function pairingSourceRefId(finding, excerpt) {
  const excerptNorm = collapse(excerpt).toLowerCase();
  if (!excerptNorm) return null;
  for (const span of supportSpansOf(finding)) {
    const passage = collapse(span?.passage).toLowerCase();
    if (!passage) continue;
    if (passage.includes(excerptNorm) || excerptNorm.includes(passage)) {
      if (span.sourceRefId != null) return span.sourceRefId;
    }
  }
  const primary = finding?.card?.primaryExcerpt;
  if (primary && typeof primary === "object" && primary.sourceRefId != null) {
    return primary.sourceRefId;
  }
  return null;
}

export function passageAssertsDraftValue(passage, draftToken) {
  const tokens = tokenizeQuantities(passage);
  const cited = citationRanges(passage);
  return tokens.some((token) => sameQuantity(token, draftToken) && !tokenInCitation(token, cited));
}

function r1Vetoes(finding, excerpt, pair) {
  const spans = supportSpansOf(finding);
  const pairingSource = pairingSourceRefId(finding, excerpt);
  if (pairingSource == null) return false;
  const ofSource = spans.filter((span) => span.sourceRefId === pairingSource);
  const supporting = ofSource.filter((span) => SUPPORTING_CLASS.has(span.classification));
  for (const span of supporting) {
    if (typeof span.passage === "string" && passageAssertsDraftValue(span.passage, pair.from)) {
      return true;
    }
  }
  const matches = Array.isArray(finding?.card?.sourceMatches) ? finding.card.sourceMatches : [];
  const compact = matches.find((row) => {
    const id = row.sourceRefId ?? row.sourceIndex;
    return id === pairingSource && SUPPORTING_CLASS.has(row.classification);
  });
  if (compact && supporting.every((span) => typeof span.passage !== "string" || !span.passage.trim())) {
    return true;
  }
  return false;
}

function fromToStart(statement, tokenA, tokens) {
  const before = statement.slice(0, tokenA.start);
  for (const tokenB of tokens) {
    if (tokenB.start <= tokenA.end) continue;
    const between = statement.slice(tokenA.end, tokenB.start);
    const after = statement.slice(tokenB.end, tokenB.end + 48);
    const fromTo = /\bfrom\s+$/i.test(before) && /^\s*to\b/i.test(between);
    const growth = /\bgrowth\s+from\s+$/i.test(before) && /^\s*to\b/i.test(between);
    const toOver = /^\s*to\b/i.test(between) && /\bover\b/i.test(after);
    if (fromTo || growth || toOver) return tokenB;
  }
  return null;
}

function percentageOfBase(statement, baseToken, tokens) {
  return tokens.some((pct) => {
    if (pct.kind !== "percentage") return false;
    const between = statement.slice(pct.end, baseToken.start);
    return /^\s*(?:percent|%)?\s*of\s+$/i.test(between) || /^\s*of\s+$/i.test(between);
  });
}

function hangingComponents(tokens, totalToken) {
  return tokens.filter((token) => token !== totalToken && token.component);
}

function licensedStarts(pairs) {
  return new Set(pairs.map((pair) => pair.from.start));
}

function r5Dependent(statement, pair, licensed) {
  const tokens = annotateTokens(statement);
  const dest = fromToStart(statement, pair.from, tokens);
  if (dest && !licensed.has(dest.start)) return dest;
  if (pair.from.total) {
    const hanging = hangingComponents(tokens, pair.from);
    const unlicensed = hanging.find((token) => !licensed.has(token.start));
    if (unlicensed) return unlicensed;
  }
  if (percentageOfBase(statement, pair.from, tokens)) {
    const pct = tokens.find((token) => {
      if (token.kind !== "percentage") return false;
      const between = statement.slice(token.end, pair.from.start);
      return /^\s*(?:percent|%)?\s*of\s+$/i.test(between) || /^\s*of\s+$/i.test(between);
    });
    if (pct && !licensed.has(pct.start)) return pct;
  }
  return null;
}

function monthNameFromIndex(index) {
  const names = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return names[index - 1] || null;
}

function assembleR3Write(sourceToken, draftToken) {
  if (sourceToken.kind !== "date" || draftToken.kind !== "date") return { ok: false, reason: "not-date" };
  if (sourceToken.year != null) {
    return { ok: true, raw: sourceToken.raw, r3: false };
  }
  if (sourceToken.month == null) return { ok: false, reason: "no-source-month" };
  if (draftToken.year == null) return { ok: false, reason: "no-draft-year" };
  if (draftToken.month == null) return { ok: false, reason: "no-draft-month" };
  if (sourceToken.month < draftToken.month) return { ok: false, reason: "year-ambiguous" };
  const monthName = sourceToken.raw.match(new RegExp(MONTHS, "i"))?.[0] || monthNameFromIndex(sourceToken.month);
  return { ok: true, raw: `${monthName} ${draftToken.year}`, r3: true };
}

function companionDatePairs(statement, excerpt, licensedPairs) {
  const draftDates = annotateTokens(statement).filter((token) => token.kind === "date");
  const cited = [...citationRanges(excerpt), ...parentheticalRanges(excerpt)];
  const sourceDates = annotateTokens(excerpt).filter(
    (token) => token.kind === "date" && !tokenInCitation(token, cited)
  );
  const extra = [];
  const alreadyDateStarts = new Set(
    (Array.isArray(licensedPairs) ? licensedPairs : [])
      .filter((pair) => pair?.from?.kind === "date")
      .map((pair) => pair.from.start)
  );
  for (const pair of licensedPairs) {
    const draftDate = draftDates.filter(
      (token) => token.fragmentStart === pair.from.fragmentStart && token.fragmentEnd === pair.from.fragmentEnd
    );
    const sourceDate = sourceDates.filter(
      (token) => token.fragmentStart === pair.to.fragmentStart && token.fragmentEnd === pair.to.fragmentEnd
    );
    if (draftDate.length !== 1 || sourceDate.length !== 1) continue;
    const from = draftDate[0];
    const to = sourceDate[0];
    if (alreadyDateStarts.has(from.start)) continue;
    if (from.month != null && to.month != null && from.month === to.month && from.year === to.year) continue;
    extra.push({ from, to, companion: true });
  }
  return extra;
}

function applyReplacements(statement, pairs) {
  const ordered = [...pairs].sort((a, b) => b.from.start - a.from.start);
  let text = String(statement ?? "");
  for (const pair of ordered) {
    text = `${text.slice(0, pair.from.start)}${pair.to.raw}${text.slice(pair.from.end)}`;
  }
  return text;
}

function quantityRawCounts(text) {
  const counts = new Map();
  for (const token of tokenizeQuantities(text)) {
    const key = token.raw;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function excerptHasBareMonth(excerpt, monthWord) {
  const rx = new RegExp(`\\b${monthWord}\\b(?!\\s+(?:19|20)\\d{2})`, "i");
  return rx.test(excerpt);
}

export function finishedSentenceIsLicensed(draft, resultingSentence, excerpt) {
  const draftCounts = quantityRawCounts(draft);
  const resultTokens = tokenizeQuantities(resultingSentence);
  const excerptRaws = tokenizeQuantities(excerpt).map((row) => row.raw);
  for (const token of resultTokens) {
    const remaining = draftCounts.get(token.raw) || 0;
    if (remaining > 0) {
      draftCounts.set(token.raw, remaining - 1);
      continue;
    }
    if (String(excerpt).includes(token.raw)) continue;
    if (offeredTokenLicensedByExcerptTokens(token.raw, excerptRaws)) continue;
    const date = parseDateParts(token.raw);
    if (date.month == null || date.year == null || date.day != null) return false;
    const monthWord = token.raw.match(new RegExp(MONTHS, "i"))?.[0];
    if (!monthWord || !excerptHasBareMonth(excerpt, monthWord)) return false;
    if (!String(draft).includes(String(date.year))) return false;
    const replacedDates = tokenizeQuantities(draft).filter((row) => {
      if (row.kind !== "date" || row.year == null || row.month == null) return false;
      return !String(resultingSentence).includes(row.raw);
    });
    if (!replacedDates.some((row) => row.month <= date.month)) return false;
  }
  return true;
}

function stylePair(pair) {
  const offered = houseStyleOfferedToken(pair?.to?.raw);
  if (!offered || offered === pair.to.raw) return pair;
  return { ...pair, to: { ...pair.to, raw: offered } };
}

function buildReplaceProposal(statement, pairs) {
  const styled = (Array.isArray(pairs) ? pairs : []).map(stylePair);
  const resultingSentence = applyReplacements(statement, styled);
  const ordered = [...styled].sort((a, b) => a.from.start - b.from.start);
  const bits = ordered.map((pair) => `'${pair.from.raw}' with '${pair.to.raw}'`);
  const proposedChange =
    bits.length === 1 ? `Replace ${bits[0]}.` : `Replace ${bits[0]} and ${bits.slice(1).join(" and ")}.`;
  return { proposedChange, resultingSentence, why: "" };
}

export function proposalAddressesConflict(statement, resultingSentence, pairs) {
  const list = Array.isArray(pairs) ? pairs : pairs ? [pairs] : [];
  if (list.length === 0) return false;
  const expected = buildReplaceProposal(statement, list).resultingSentence;
  return collapse(resultingSentence) === collapse(expected);
}

function unaddressed(explain = null, extra = {}) {
  return {
    status: "unaddressed",
    pairs: [],
    proposal: null,
    explain: explain || null,
    confirming: extra.confirming ?? null,
    governancePair: extra.governancePair,
  };
}

function disagreementUnaddressed(finding, disagreement, code, governsSourceId) {
  const includeGoverns = code === "sources_disagree_neither" || code === "sources_agreed_kept";
  return unaddressed(
    {
      code,
      values: disagreementCopyValues(finding, disagreement, governsSourceId),
    },
    {
      governancePair: includeGoverns
        ? governancePairFrom(finding, disagreement, governsSourceId ?? null)
        : governancePairFrom(finding, disagreement),
    }
  );
}

function governsFromDecision(decided, disagreement) {
  if (!decided || !disagreement) return undefined;
  if (decided.action === "proceed") return Number(disagreement.pairingSourceId);
  if (decided.action === "use_other") return decided.governs;
  if (decided.code === "sources_disagree_neither") return null;
  if (decided.code === "sources_agreed_kept") return decided.governs;
  return undefined;
}

export function disagreementPassagesFrom(finding, disagreement, excerpt, governsSourceId) {
  if (!disagreement) return undefined;
  const pairingPassage = typeof excerpt === "string" ? excerpt.trim() : "";
  const otherPassage = typeof disagreement.otherPassage === "string" ? disagreement.otherPassage.trim() : "";
  const named =
    governsSourceId === undefined || governsSourceId === null ? null : Number(governsSourceId);
  const pairingId = Number(disagreement.pairingSourceId);
  const otherId = Number(disagreement.otherSourceId);
  return [
    {
      sourceId: pairingId,
      label: labelForSource(finding, pairingId),
      passage: pairingPassage,
      governs: named != null && Number.isInteger(named) && named === pairingId,
    },
    {
      sourceId: otherId,
      label: labelForSource(finding, otherId),
      passage: otherPassage,
      governs: named != null && Number.isInteger(named) && named === otherId,
    },
  ];
}

function decorateDisagreement(outcome, finding, disagreement, excerpt, governsSourceId, rulingConsulted) {
  if (!outcome || !disagreement) return outcome;
  outcome.disagreementPassages = disagreementPassagesFrom(
    finding,
    disagreement,
    excerpt,
    rulingConsulted ? governsSourceId : undefined
  );
  // Once the reviewer has answered, the answer is part of the card
  // whatever else happens.
  outcome.governancePair = rulingConsulted
    ? governancePairFrom(finding, disagreement, governsSourceId)
    : governancePairFrom(finding, disagreement);
  return outcome;
}

function applyDisagreementRuling(finding, disagreement, rulings) {
  if (!disagreement) return { action: "proceed" };
  const ruling = rulingForPair(rulings, disagreement.pairingSourceId, disagreement.otherSourceId);
  if (!ruling) {
    return { action: "unaddressed", code: "sources_disagree" };
  }
  if (ruling.governs === null) {
    return { action: "unaddressed", code: "sources_disagree_neither" };
  }
  if (Number(ruling.governs) === Number(disagreement.pairingSourceId)) {
    return { action: "proceed", disagreement };
  }
  if (Number(ruling.governs) === Number(disagreement.otherSourceId)) {
    if (disagreement.otherMatchesDraft) {
      return { action: "unaddressed", code: "sources_agreed_kept", governs: ruling.governs };
    }
    return { action: "use_other", disagreement, governs: ruling.governs };
  }
  return { action: "unaddressed", code: "sources_disagree" };
}

/**
 * @returns {{
 *   status: "replace" | "unaddressed" | "unengaged",
 *   pairs: object[],
 *   proposal: { proposedChange: string, resultingSentence: string, why: string } | null,
 *   explain: { code: string, values: object } | null
 * }}
 */
export function applyConflictProposal(finding, candidate = null, options = {}) {
  const statement = String(finding?.statement ?? "");
  const excerpt = excerptTextForFinding(finding);
  const rulings = normalizeSourceRulings(options?.sourceRulings);
  let pairs = findCandidatePairs(statement, excerpt);
  const passages = passagesForNamePairing(finding, excerpt);
  const namePairs = findNamePairs(statement, passages);
  const sourceBlob = passages.join("\n");
  let nameBackedDecline = false;
  if (namePairs.length === 1) {
    const extraQty = uniqueKindQuantityPairs(statement, sourceBlob);
    const merged = mergeWritePairs(namePairs, pairs, extraQty);
    if (leftoverQuantityDisagrees(statement, sourceBlob, merged)) {
      nameBackedDecline = true;
      pairs = [];
    } else {
      pairs = merged;
    }
  }
  const agreements = findFigureAgreements(statement, excerpt);
  let cardDisagreement = null;
  let cardGoverns = undefined;
  let rulingConsulted = false;

  function remember(disagreement) {
    if (!disagreement) return { action: "proceed" };
    cardDisagreement = disagreement;
    const decided = applyDisagreementRuling(finding, disagreement, rulings);
    const ruling = rulingForPair(rulings, disagreement.pairingSourceId, disagreement.otherSourceId);
    rulingConsulted = ruling != null;
    cardGoverns = governsFromDecision(decided, disagreement);
    return decided;
  }

  function finish(outcome) {
    return decorateDisagreement(
      outcome,
      finding,
      cardDisagreement,
      excerpt,
      cardGoverns,
      rulingConsulted
    );
  }

  if (nameBackedDecline) return finish(unaddressed());

  if (pairs.length === 0) {
    const clash = findQualifierClash(statement, excerpt);
    const disagreement = detectDisagreementOnFinding(finding, excerpt, []);
    const decided = disagreement ? remember(disagreement) : null;
    if (clash) {
      return finish(
        unaddressed({
          code: "qualifier_clash",
          values: {
            sourcePhrase: qualifierDisplay(clash.to),
            draftPhrase: qualifierDisplay(clash.from),
            unnamedRaw: clash.from.raw,
          },
        })
      );
    }
    if (disagreement) {
      if (decided.action === "unaddressed") {
        return finish(disagreementUnaddressed(finding, disagreement, decided.code, decided.governs));
      }
      if (decided.action === "use_other" && disagreement.otherToken) {
        const draftFrom = annotateTokens(statement).find((token) =>
          compatibleTokens(token, disagreement.otherToken, disagreement.otherPassage)
        );
        if (draftFrom) {
          const writableOther = [{ from: draftFrom, to: disagreement.otherToken }];
          const proposal = buildReplaceProposal(statement, writableOther);
          const license = disagreement.otherPassage || excerpt;
          if (finishedSentenceIsLicensed(statement, proposal.resultingSentence, license)) {
            return finish({
              status: "replace",
              pairs: writableOther,
              proposal,
              explain: {
                code: "correction",
                values: { pairs: serializeWritePairs(writableOther), confirmedLabel: "" },
              },
              confirming: null,
              governancePair: governancePairFrom(finding, disagreement, decided.governs),
            });
          }
        }
      }
    }
    if (agreements.length > 0) return finish(unaddressed(agreementExplain(agreements)));
    return finish(unaddressed());
  }

  const licensedStartsSet = licensedStarts(pairs);
  const writable = [];
  const licensePassages = [excerpt];
  let appliedDisagreement = null;
  let appliedGoverns = undefined;
  for (const pair of pairs) {
    if (pair.from?.kind === "name") {
      writable.push(pair);
      continue;
    }
    if (r1Vetoes(finding, excerpt, pair)) {
      return finish(
        unaddressed({
          code: "self_disagreement",
          values: { figure: figureLabel(pair.from) },
        })
      );
    }
    const pairingSourceId = pairingSourceRefId(finding, excerpt);
    const disagreement = detectSourceDisagreement({
      finding,
      pairingSourceId,
      statement,
      pair,
      excerpt,
    });
    if (disagreement) {
      const decided = remember(disagreement);
      if (decided.action === "unaddressed") {
        return finish(disagreementUnaddressed(finding, disagreement, decided.code, decided.governs));
      }
      appliedDisagreement = disagreement;
      if (decided.action === "use_other" && disagreement.otherToken) {
        appliedGoverns = decided.governs;
        writable.push({ from: pair.from, to: disagreement.otherToken });
        if (disagreement.otherPassage) licensePassages.push(disagreement.otherPassage);
        continue;
      }
      if (decided.action === "proceed") {
        appliedGoverns = Number(disagreement.pairingSourceId);
      }
    }
    const dest = r5Dependent(statement, pair, licensedStartsSet);
    if (dest) {
      return finish(
        unaddressed({
          code: "dependents",
          values: {
            fromRaw: pair.from.raw,
            toRaw: pair.to.raw,
            destRaw: dest.raw,
          },
        })
      );
    }
    writable.push(pair);
  }

  const dates = companionDatePairs(statement, excerpt, writable);
  for (const datePair of dates) {
    const assembled = assembleR3Write(datePair.to, datePair.from);
    if (!assembled.ok) {
      if (assembled.reason === "no-draft-year") continue;
      if (assembled.reason === "year-ambiguous") {
        const sourceMonth =
          datePair.to.raw.match(new RegExp(MONTHS, "i"))?.[0] || monthNameFromIndex(datePair.to.month);
        return finish(
          unaddressed({
            code: "year_ambiguous",
            values: {
              sourceMonth,
              draftDate: datePair.from.raw,
            },
          })
        );
      }
      return finish(unaddressed());
    }
    if (!excerpt.includes(datePair.to.raw.match(new RegExp(MONTHS, "i"))?.[0] || datePair.to.raw)) {
      return finish(unaddressed());
    }
    writable.push({
      from: datePair.from,
      to: { ...datePair.to, raw: assembled.raw },
      r3: assembled.r3,
    });
  }

  if (writable.length === 0) return finish(unaddressed());

  if (!sourceFigureVisibleOnCard(finding, writable)) {
    return finish(unaddressed());
  }

  const proposal = buildReplaceProposal(statement, writable);
  if (proposalChangesAgreed(statement, proposal.resultingSentence, agreements)) {
    return finish(unaddressed(agreementExplain(agreements)));
  }
  const license = licensePassages.filter(Boolean).join(" ");
  if (!finishedSentenceIsLicensed(statement, proposal.resultingSentence, license)) {
    return finish(unaddressed());
  }
  const silent = silentQualifier(writable, excerpt);
  const confirming = selectConfirmingPassage(finding, statement, excerpt, writable);
  const explain = silent
    ? {
        code: "qualifier_silent",
        values: {
          pairs: serializeWritePairs(writable),
          silentWord: silent.word,
          silentValue: silent.value,
          confirmedLabel: confirming?.figureLabel || "",
        },
      }
    : {
        code: "correction",
        values: {
          pairs: serializeWritePairs(writable),
          confirmedLabel: confirming?.figureLabel || "",
        },
      };
  if (candidate && typeof candidate.resultingSentence === "string") {
    if (!proposalAddressesConflict(statement, candidate.resultingSentence, writable)) {
      console.error(CONFLICT_PROPOSAL_UNENGAGED);
      return finish({ status: "unengaged", pairs: writable, proposal: null, explain: null, confirming: null });
    }
  }
  return finish({
    status: "replace",
    pairs: writable,
    proposal,
    explain,
    confirming,
    governancePair: appliedDisagreement
      ? governancePairFrom(finding, appliedDisagreement, appliedGoverns)
      : undefined,
  });
}

export function resolveConflictEngagement(finding) {
  return applyConflictProposal(finding, null);
}
