/**
 * B592 / B593. When a quoted piece stops at a source line break mid-sentence
 * (no closing punctuation), append " …". Line refs use "(line n)" / "(lines n to m)".
 */

const CLOSING = /[.!?…]"?$|[.’”"]$/;
const EXISTING_REF = /\s*\(lines?\s+\d+(?:\s+to\s+\d+|[\u2013\-]\d+)?\)\s*$/i;

export function cutLineEllipsis(text) {
  const body = typeof text === "string" ? text.replace(/\s+/g, " ").trim() : "";
  if (!body) return "";
  if (CLOSING.test(body)) return body;
  if (body.endsWith("…") || body.endsWith("...")) return body;
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
export function passageWithLineRef(text, lines) {
  const cleaned = stripTrailingLineRef(text);
  const body = cutLineEllipsis(cleaned);
  const ref = lineRefLabel(lines);
  if (!body) return "";
  return ref ? `${body} ${ref}` : body;
}
