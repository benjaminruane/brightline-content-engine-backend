/**
 * B490. The closing-document sentence stays only when the deal's state
 * is the only difference the note reports.
 */
export const CLEARING_LINE = "Adding the closing document will clear this.";

function sentences(text) {
  return String(text || "").split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter(Boolean);
}

function isClearing(sentence) {
  return sentence.replace(/\s+/g, " ").replace(/[.!?]+$/, "") === CLEARING_LINE.replace(/\.$/, "");
}

function otherDifference(parts) {
  return parts.some((sentence) => (
    /^Also\b/.test(sentence) || /\bnot by\b[^.]{0,120}\balone\b/i.test(sentence)
  ));
}

/** The same string when the sentence stays. The sentence removed when another difference is named. */
export function applyClearingLine(text) {
  if (typeof text !== "string" || !text.includes(CLEARING_LINE)) return text;
  const parts = sentences(text);
  const rest = parts.filter((part) => !isClearing(part));
  if (rest.length === parts.length || !otherDifference(rest)) return text;
  return rest.join(" ");
}
