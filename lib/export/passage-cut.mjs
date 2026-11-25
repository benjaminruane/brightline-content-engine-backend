/**
 * B592. When a quoted piece stops at a source line break mid-sentence
 * (no closing punctuation), append " …".
 */

const CLOSING = /[.!?…]"?$|[.’”"]$/;

export function cutLineEllipsis(text) {
  const body = typeof text === "string" ? text.replace(/\s+/g, " ").trim() : "";
  if (!body) return "";
  if (CLOSING.test(body)) return body;
  if (body.endsWith("…") || body.endsWith("...")) return body;
  return `${body} …`;
}

/** "L15" or "15" or "L15–L17" → "(line 15)" / "(lines 15–17)". */
export function lineRefLabel(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  const nums = value.match(/\d+/g);
  if (!nums || !nums.length) return "";
  if (nums.length === 1) return `(line ${nums[0]})`;
  return `(lines ${nums[0]}–${nums[nums.length - 1]})`;
}

/** Passage text with cut ellipsis and optional line ref on the same line. */
export function passageWithLineRef(text, lines) {
  const body = cutLineEllipsis(text);
  const ref = lineRefLabel(lines);
  if (!body) return "";
  return ref ? `${body} ${ref}` : body;
}
