/**
 * B468. A numeral from 0 to the configured ceiling is spelled out only when
 * the word is the same number. B538 reads that ceiling from the house style
 * rule, and leaves a mixed range, a carve-out, and an identifier as written.
 */
import { numberSpellingHits } from "./number-spelling.mjs";

function requireStatement(statement) {
  if (typeof statement !== "string") throw new Error("scanNumberForm: statement is missing");
  return statement;
}

function named(parts) {
  if (parts.length <= 1) return parts[0] || "";
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

/**
 * One concern for the statement. Every numeral that should be a word is a span.
 * @param {{ statement: string, styleRules?: object[], outputType?: string }} args
 */
export function scanNumberForm({ statement, styleRules, outputType } = {}) {
  const text = requireStatement(statement);
  const hits = numberSpellingHits(text, { styleRules, outputType });
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
