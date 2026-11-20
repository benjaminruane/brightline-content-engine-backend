/**
 * B468. A list of three or more is missing its final comma, or it is not.
 * Two items and one 'and' are not a list of three. A comma already before
 * the final 'and' is not a miss. The scan does not rewrite the list.
 */
import { quotationRanges } from "./mechanics-scan.mjs";

const BAD_START = /^(?:is|are|was|were|has|have|had|will|would|can|could|should|may|might|in|on|at|by|for|from|with|to|of|and|or|but|as|if|when|while|although|because|since|after|before|during|despite|including|into|over|under|between|among|across|through|without|within|about|than|then|that|which|who|whose|where|this|these|those|it|its|their|his|her|a|an|the)$/i;
const INTRO = /^(?:meanwhile|however|moreover|furthermore|also|additionally|separately|elsewhere|notably|importantly|overall|finally|first|second|third|today|yesterday|in addition|for example|for instance|at the same time|in particular|as a result|in contrast|by contrast|on the other hand|in the meantime|after all|of course)$/i;
const LEFT_VERB = /\b(?:included|include|includes|has|have|had|is|are|was|were|made|makes|owns|own)\b/i;

function requireStatement(statement) {
  if (typeof statement !== "string") throw new Error("scanListCommas: statement is missing");
  return statement;
}

function inside(start, end, ranges) {
  return ranges.some(([from, to]) => start >= from && end <= to);
}

function sentenceSpans(statement) {
  const spans = [];
  let start = 0;
  for (let i = 0; i < statement.length; i += 1) {
    if (!/[.!?]/.test(statement[i])) continue;
    let j = i + 1;
    while (j < statement.length && /\s/.test(statement[j])) j += 1;
    if (j > i + 1 && /[A-Z]/.test(statement[j] || "")) {
      spans.push([start, i + 1]);
      start = j;
      i = j - 1;
    }
  }
  if (start < statement.length) spans.push([start, statement.length]);
  return spans;
}

function parenRanges(statement) {
  const ranges = [];
  let depth = 0;
  let open = -1;
  for (let i = 0; i < statement.length; i += 1) {
    if (statement[i] === "(") {
      if (depth === 0) open = i;
      depth += 1;
    } else if (statement[i] === ")" && depth > 0) {
      depth -= 1;
      if (depth === 0 && open >= 0) ranges.push([open, i + 1]);
    }
  }
  return ranges;
}

function sourceWritesList(quote, sourceText) {
  if (typeof sourceText !== "string" || !sourceText.trim()) return false;
  const hay = sourceText.replace(/\s+/g, " ").toLowerCase();
  const words = quote.replace(/\s+/g, " ").trim().toLowerCase().split(" ");
  for (let start = 0; start < words.length; start += 1) {
    const slice = words.slice(start).join(" ");
    if (!slice.includes(",")) break;
    if (hay.includes(slice)) return true;
  }
  return false;
}

function withOxfordComma(quote, conj) {
  return quote.replace(new RegExp(`\\s+(${conj})\\b`, "i"), ", $1");
}

const INDEFINITE = /^(?:a|an)\b/i;
const GERUND = /ing$/i;
const CLAUSE = /\b(?:while|although|because|when|if|despite|unless|whereas|though)\b/i;
const LIST_VERB = /\b(?:owns|own|owned|included|include|includes|made|make|making|buys|buy|bought|acquires|acquire|acquired)\b/i;
const FINITE_VERB = /\b(?:support|supports|remain|remains|grew|grow|grows|increase|increases|increased|provide|provides|provided)\b/i;

function lastWord(value) {
  return String(value || "").trim().split(/\s+/).pop() || "";
}

/** A comma before "and" is a serial comma only in a list of three or more. */
function notAList(left, mid, right, before) {
  const leftWords = String(left || "").trim().split(/\s+/).filter(Boolean);
  if (leftWords.length === 1 && /ly$/i.test(leftWords[0])) return true;
  if (/^(?:both|either)\b/i.test(mid)) return true;
  if (INDEFINITE.test(mid) && !INDEFINITE.test(left)) return true;
  const rightFirst = String(right || "").trim().split(/\s+/)[0] || "";
  if (GERUND.test(lastWord(mid)) && GERUND.test(rightFirst) && !GERUND.test(lastWord(left))) return true;
  const followedByVerb = FINITE_VERB.test(mid) || FINITE_VERB.test(right);
  if (CLAUSE.test(before) && !LIST_VERB.test(`${before} ${left}`) && followedByVerb) return true;
  return false;
}

/**
 * One concern for the statement. Every missing comma is a span.
 * An introductory word before the comma is not an item.
 * A list the source already writes this way is not rewritten.
 * @param {{ statement: string, sourceText?: string }} args
 */
export function scanListCommas({ statement, sourceText } = {}) {
  const text = requireStatement(statement);
  const quoted = quotationRanges(text);
  const parens = parenRanges(text);
  const re = /\b((?:[A-Za-z][\w''-]*\s+){0,2}[A-Za-z][\w''-]*),\s+((?:[A-Za-z][\w''-]*\s+){0,2}[A-Za-z][\w''-]*)\s+(and|or)\s+((?:[A-Za-z][\w''-]*\s+){0,3}[A-Za-z][\w''-]*)\b/gi;
  const hits = [];
  for (const [from, to] of sentenceSpans(text)) {
    const sentence = text.slice(from, to);
    if (/,\s+(?:and|or)\b/i.test(sentence)) continue;
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(sentence))) {
      const start = from + match.index;
      const end = start + match[0].length;
      if (inside(start, end, quoted) || inside(start, end, parens)) continue;
      const left = match[1].trim();
      const mid = match[2].trim();
      const right = match[4].trim();
      if (INTRO.test(left)) continue;
      const first = (value) => {
        const words = value.split(/\s+/);
        if (/^(?:the|a|an)$/i.test(words[0]) && words.length > 1) return words[1];
        return words[0];
      };
      if (BAD_START.test(first(mid)) || BAD_START.test(first(right))) continue;
      if (notAList(left, mid, right, sentence.slice(0, match.index))) continue;
      let quoteStart = start;
      let quoteEnd = end;
      let quote = match[0];
      if (LEFT_VERB.test(left)) {
        const last = left.split(/\s+/).pop();
        const at = left.lastIndexOf(last);
        quoteStart = start + at;
        quote = text.slice(quoteStart, quoteEnd);
      }
      const midWords = mid.split(/\s+/).length;
      const rightWords = right.split(/\s+/);
      if (midWords === 1 && rightWords.length > 1) {
        const word = rightWords[0];
        quoteEnd = text.lastIndexOf(word, quoteEnd) + word.length;
        quote = text.slice(quoteStart, quoteEnd);
      }
      if (sourceWritesList(quote, sourceText)) continue;
      hits.push({ quote, start: quoteStart, end: quoteEnd, conj: match[3].toLowerCase() });
    }
  }
  if (!hits.length) return [];
  const conj = hits.length === 1 ? hits[0].conj : "and";
  const fixed = hits.map((hit) => withOxfordComma(hit.quote, hit.conj));
  const shown = fixed.length === 1
    ? fixed[0]
    : `${fixed.slice(0, -1).join("; ")}; ${fixed[fixed.length - 1]}`;
  const note = hits.length === 1
    ? `Oxford comma: add a comma before "${conj}" in this list (${shown}).`
    : `Oxford comma: add a comma before "${conj}" in these lists (${shown}).`;
  return [{
    concernCode: "oxford_comma",
    rule: "oxford_comma",
    category: "style_guide",
    note,
    concernText: note,
    text: note,
    suggestedDirection: note,
    quote: hits[0].quote,
    span: hits.map((hit) => ({ startChar: hit.start, endChar: hit.end })),
  }];
}

/** Insert the missing comma before and or or. A list that already has it stays. */
export function applyListCommas(text) {
  if (typeof text !== "string") throw new Error("applyListCommas: text is missing");
  const found = scanListCommas({ statement: text });
  const spans = found[0]?.span || [];
  const points = [];
  for (const span of spans) {
    const slice = text.slice(span.startChar, span.endChar);
    const at = slice.search(/\s+(?:and|or)\b/i);
    if (at < 0) continue;
    points.push(span.startChar + at);
  }
  let out = text;
  for (const at of points.sort((a, b) => b - a)) {
    out = `${out.slice(0, at)},${out.slice(at)}`;
  }
  return out;
}
