/**
 * B568. An explicit length instruction becomes a word target from the current draft.
 * The target replaces the document word limit for that rewrite.
 */

export function countRewriteWords(text) {
  if (typeof text !== "string" || !text.trim()) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function roundTarget(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
}

/**
 * @returns {number|null} words to write, or null when the instruction is not a length
 */
export function lengthTargetFromInstruction(instruction, currentWords) {
  const text = typeof instruction === "string" ? instruction.trim() : "";
  const words = Number(currentWords);
  if (!text || !Number.isFinite(words) || words < 1) return null;
  if (/\b(halve|half the length|half as long|cut it in half|cut in half)\b/i.test(text)) {
    return roundTarget(words / 2);
  }
  const absolute = text.match(/\b(\d+)\s+words?\b/i);
  if (absolute && /\b(to|about|around|exactly|under|max(?:imum)?|limit|cut|shorten|length|words?)\b/i.test(text)) {
    return roundTarget(absolute[1]);
  }
  const percent = text.match(/\b(\d+(?:\.\d+)?)\s*(?:%|percent\b)/i);
  if (!percent) return null;
  const shorter = /\b(shorten|shorter|cut|trim|reduce|condense|brief)\b/i.test(text);
  const longer = /\b(lengthen|longer|expand|increase)\b/i.test(text);
  if (!shorter && !longer) return null;
  const pct = Number(percent[1]) / 100;
  if (!Number.isFinite(pct) || pct <= 0) return null;
  const factor = longer && !shorter ? 1 + pct : 1 - pct;
  if (factor <= 0) return null;
  return roundTarget(words * factor);
}

export function lengthIsOff(actual, target) {
  const words = Number(actual);
  const goal = Number(target);
  if (!Number.isFinite(words) || !Number.isFinite(goal) || goal < 1) return false;
  return Math.abs(words - goal) / goal > 0.15;
}

export function lengthPromptLine(target) {
  const n = roundTarget(target);
  if (!n) return "";
  return `Write about ${n} words. This word target replaces the document word limit.`;
}

export function lengthGapLine(actualWords, target) {
  return `The last draft was ${Number(actualWords)} words. Write about ${roundTarget(target)} words.`;
}

export function lengthMissLine(actualWords, target) {
  return `This rewrite is ${Number(actualWords)} words; you asked for about ${roundTarget(target)}.`;
}
