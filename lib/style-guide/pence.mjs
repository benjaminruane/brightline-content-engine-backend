/**
 * Pence stays pence. The choice is "862.5 pence" or "862.5p".
 * Neither form is turned into pounds.
 */

const WORDS = /(\d[\d,]*(?:\.\d+)?)\s+pence\b/gi;
const SYMBOL = /(\d[\d,]*(?:\.\d+)?)p\b/g;

export function applyPence(text, choice) {
  const body = typeof text === "string" ? text : "";
  if (choice === "symbol") return body.replace(WORDS, "$1p");
  return body.replace(SYMBOL, "$1 pence");
}

function concern(note, quote, start, end) {
  return {
    concernCode: "pence_form",
    rule: "pence_form",
    category: "style_guide",
    note,
    concernText: note,
    text: note,
    suggestedDirection: note,
    quote,
    span: [{ startChar: start, endChar: end }],
  };
}

/** Review flags the form the account did not choose. */
export function scanPenceForm({ statement, pence } = {}) {
  if (typeof statement !== "string") throw new Error("scanPenceForm: statement is missing");
  const choice = pence === "symbol" ? "symbol" : "words";
  const pattern = choice === "symbol" ? WORDS : SYMBOL;
  const match = new RegExp(pattern.source, pattern.flags).exec(statement);
  if (!match) return [];
  const written = match[0];
  const note = choice === "symbol"
    ? `Write ${written} as ${match[1]}p.`
    : `Write ${written} as ${match[1]} pence.`;
  return [concern(note, written, match.index, match.index + written.length)];
}
