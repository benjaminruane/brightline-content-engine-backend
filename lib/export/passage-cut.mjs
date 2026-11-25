/**
 * B592 / B593 / B594. When a quoted piece stops at a source line break mid-sentence
 * (no closing punctuation), append " …". Table rows and finished figure lines stay as they are.
 * Line refs use "(line n)" / "(lines n to m)".
 */

const CLOSING = /[.!?…]"?$|[.’”"]$/;
const EXISTING_REF = /\s*\(lines?\s+\d+(?:\s+to\s+\d+|[\u2013\-]\d+)?\)\s*$/i;
const TABLE_ROW = /\|/;
// A finished figure or percentage (12%, 862.5p, 1.6x, or a bare trailing figure
// such as "678 652" from a cleaned table row). A cut like "(31" is mid-sentence
// and still takes " …" because the open paren is not a finished figure line.
const ENDS_IN_FIGURE = /(?:\d+(?:\.\d+)?\s*%|\d+(?:\.\d+)?\s*(?:p|p\.|pence|bn|m|mm|k|x)|(?<![\d.(])\d+(?:[.,]\d+)?(?:\s+\d+(?:[.,]\d+)?)*)\s*$/i;

/**
 * True when the next source line continues this piece mid-sentence.
 * Lowercase letter, digit continuing a figure, or closing punctuation.
 */
export function nextLineContinuesSentence(nextLine) {
  const next = typeof nextLine === "string" ? nextLine.replace(/^\s+/, "") : "";
  if (!next) return false;
  if (/^[a-z]/.test(next)) return true;
  if (/^[,;:)\]}'"…]/.test(next)) return true;
  if (/^\d/.test(next)) return true;
  return false;
}

/** Complete table rows and lines that already end in a figure or percentage stay without " …". */
export function isCompleteCutLine(text) {
  const body = typeof text === "string" ? text.replace(/\s+/g, " ").trim() : "";
  if (!body) return true;
  if (TABLE_ROW.test(body)) return true;
  if (ENDS_IN_FIGURE.test(body)) return true;
  // Space-separated table / key-figures rows without pipes (F12 / B598).
  // e.g. "NAV Per Share 862.5p 845.5p" or "KEY FIGURES 30 Jun 2026 … 678 652"
  if (/\b(?:nav|key figures|net asset value|irr|moic|aum)\b/i.test(body) && /\d/.test(body)) {
    return true;
  }
  if (CLOSING.test(body)) return true;
  if (body.endsWith("…") || body.endsWith("...")) return true;
  return false;
}

/**
 * Append " …" only when the piece ends mid-sentence AND the next source line
 * continues that sentence. When nextLine is omitted, keep the B593 behaviour
 * for incomplete non-table pieces (callers that already know the cut is mid-sentence).
 */
export function cutLineEllipsis(text, nextLine) {
  const body = typeof text === "string" ? text.replace(/\s+/g, " ").trim() : "";
  if (!body) return "";
  if (isCompleteCutLine(body)) return body;
  if (arguments.length >= 2) {
    if (!nextLineContinuesSentence(nextLine)) return body;
  }
  return `${body} …`;
}

/** Strip a trailing "(line n)" / "(lines n to m)" so a later append cannot duplicate it. */
export function stripTrailingLineRef(text) {
  return String(text || "").replace(EXISTING_REF, "").replace(/\s+/g, " ").trim();
}

/** "L15" or "15" or "L15–L17" → "(line 15)" / "(lines 15 to 17)". */
export function lineRefLabel(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  const nums = value.match(/\d+/g);
  if (!nums || !nums.length) return "";
  if (nums.length === 1) return `(line ${nums[0]})`;
  const first = nums[0];
  const last = nums[nums.length - 1];
  if (first === last) return `(line ${first})`;
  return `(lines ${first} to ${last})`;
}

/** Passage text with cut ellipsis and exactly one line ref when lines are known. */
export function passageWithLineRef(text, lines, nextLine) {
  const cleaned = stripTrailingLineRef(text);
  const body = arguments.length >= 3 ? cutLineEllipsis(cleaned, nextLine) : cutLineEllipsis(cleaned);
  const ref = lineRefLabel(lines);
  if (!body) return "";
  return ref ? `${body} ${ref}` : body;
}
