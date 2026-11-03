/**
 * B468. A list of three or more is missing its final comma, or it is not.
 * Two items and one 'and' are not a list of three. A comma already before
 * the final 'and' is not a miss. The scan does not rewrite the list.
 */
import { quotationRanges } from "./mechanics-scan.mjs";

const BAD_START = /^(?:is|are|was|were|has|have|had|will|would|can|could|should|may|might|in|on|at|by|for|from|with|to|of|and|or|but|as|if|when|while|although|because|since|after|before|during|despite|including|into|over|under|between|among|across|through|without|within|about|than|then|that|which|who|whose|where|this|these|those|it|its|their|his|her|a|an|the)$/i;
const LEFT_VERB = /\b(?:included|include|includes|has|have|had|is|are|was|were|made|makes)\b/i;

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

/**
 * One concern for the statement. Every missing comma is a span.
 * @param {{ statement: string }} args
 */
export function scanListCommas({ statement } = {}) {
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
      const first = (value) => value.split(/\s+/)[0];
      if (BAD_START.test(first(mid)) || BAD_START.test(first(right))) continue;
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
      hits.push({ quote, start: quoteStart, end: quoteEnd, conj: match[3].toLowerCase() });
    }
  }
  if (!hits.length) return [];
  const named = hits.map((hit) => `'${hit.quote}'`);
  const list = named.length === 1
    ? named[0]
    : named.length === 2
      ? `${named[0]} and ${named[1]}`
      : `${named.slice(0, -1).join(", ")}, and ${named[named.length - 1]}`;
  const conj = hits.length === 1 ? hits[0].conj : "and";
  const note = hits.length === 1
    ? `The list is written ${list}. It is missing the comma before ${conj}.`
    : `The lists are written ${list}. Each is missing the comma before ${conj}.`;
  return [{
    concernCode: "oxford_comma",
    rule: "oxford_comma",
    category: "style_guide",
    note,
    concernText: note,
    text: note,
    suggestedDirection: `Add the comma before ${conj}.`,
    quote: hits[0].quote,
    span: hits.map((hit) => ({ startChar: hit.start, endChar: hit.end })),
  }];
}
