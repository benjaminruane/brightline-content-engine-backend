/**
 * B498. The closing-document sentence is never shown.
 */
export const CLEARING_LINE = "Adding the closing document will clear this.";

function sentences(text) {
  return String(text || "").split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter(Boolean);
}

function isClearing(sentence) {
  return sentence.replace(/\s+/g, " ").replace(/[.!?]+$/, "") === CLEARING_LINE.replace(/\.$/, "");
}

/** The sentence removed wherever reader text is sealed. */
export function applyClearingLine(text) {
  if (typeof text !== "string" || !text.includes(CLEARING_LINE)) return text;
  const parts = sentences(text);
  const rest = parts.filter((part) => !isClearing(part));
  if (rest.length === parts.length) return text;
  return rest.join(" ");
}
