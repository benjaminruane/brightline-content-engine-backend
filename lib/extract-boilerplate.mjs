/**
 * B407. Page furniture is a flag on the head of a stored source.
 * The text is not shortened. isPageFurnitureSentence is unchanged, so a
 * furniture sentence is still skipped when a quote is chosen.
 * B405 deleted those lines, and refused the deletion when it would remove
 * more than 30% of the text. A flag removes nothing, so that valve no
 * longer hides a line.
 */

const NAV_PHRASES = [
  "log in",
  "sign up",
  "sign in",
  "products",
  "pricing",
  "customer stories",
  "resources",
  "newsroom",
  "menu",
  "search",
  "subscribe",
  "contact us",
  "about us",
  "careers",
  "investors",
  "privacy",
  "cookie",
  "terms of use",
];

const NAV_VERBS = new Set([
  "is",
  "are",
  "was",
  "were",
  "has",
  "have",
  "had",
  "will",
  "said",
  "says",
  "reports",
  "reported",
  "announced",
  "grew",
  "rose",
  "fell",
]);

function phraseHits(lower) {
  let n = 0;
  for (const phrase of NAV_PHRASES) {
    if (lower.includes(phrase)) n += 1;
  }
  return n;
}

function isNavWordList(line) {
  if (/[.!?]/.test(line)) return false;
  const words = line.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 8) return false;
  if (!words.every((word) => word.length <= 16 && /^[A-Z][A-Za-z0-9]*$/.test(word))) return false;
  if (words.some((word) => NAV_VERBS.has(word.toLowerCase()))) return false;
  return true;
}

export function isPageFurnitureLine(line) {
  const trimmed = String(line ?? "").trim();
  if (!trimmed || trimmed.length >= 120) return false;
  if (/[$£€¥]/.test(trimmed) || /%/.test(trimmed) || /\b(?:19|20)\d{2}\b/.test(trimmed)) return false;
  const lower = trimmed.toLowerCase();
  if (/^\d+\s+(?:month|year|week|day)s?\s+ago$/.test(lower)) return true;
  if (phraseHits(lower) >= 2) return true;
  if (isNavWordList(trimmed)) return true;
  return false;
}

/**
 * B394. A sentence that opens on page furniture is not selectable.
 * The original two checks stay, so a navigation dump that also names a
 * year is still furniture. A short line the head stripper would drop is
 * furniture as well.
 */
export function isPageFurnitureSentence(text) {
  const flat = String(text || "").replace(/\s+/g, " ").trim();
  if (!flat) return false;
  const head = flat.slice(0, 240);
  if (/log in/i.test(head) && /sign up/i.test(head) && /newsroom/i.test(head)) return true;
  if (/month ago/i.test(flat.slice(0, 300))) return true;
  if (flat.length < 120 && isPageFurnitureLine(flat)) return true;
  return false;
}

function firstRealSentenceIndex(lines) {
  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (trimmed.length >= 40 && /[.!?]$/.test(trimmed)) return i;
  }
  return lines.length;
}

/**
 * Original text, plus the 0-based indexes of head lines isPageFurnitureLine
 * would have dropped. Lines after the first real sentence are not flagged.
 * @param {string} text
 * @returns {{ text: string, furnitureLineIndexes: number[] }}
 */
export function markPageFurniture(text) {
  const original = typeof text === "string" ? text : "";
  if (!original) return { text: original, furnitureLineIndexes: [] };
  const lines = original.split("\n");
  const boundary = firstRealSentenceIndex(lines);
  const furnitureLineIndexes = [];
  for (let i = 0; i < boundary; i += 1) {
    if (isPageFurnitureLine(lines[i])) furnitureLineIndexes.push(i);
  }
  return { text: original, furnitureLineIndexes };
}

/** B407. The name remains. The text is no longer shortened. */
export function stripLeadingPageFurniture(text) {
  return markPageFurniture(text).text;
}

/**
 * Keep `maxChars` of non-furniture line text. A furniture line that sits
 * before that cut stays, so the saved string's line numbers still match
 * the fetched text. The newlines that join lines are not part of the budget.
 * @param {string} text
 * @param {number} maxChars
 * @returns {string}
 */
export function clipKeepingFurniture(text, maxChars) {
  const original = typeof text === "string" ? text : "";
  const cap = Number(maxChars);
  if (!Number.isFinite(cap) || cap < 0) {
    throw new Error("clipKeepingFurniture: maxChars is missing");
  }
  const { furnitureLineIndexes } = markPageFurniture(original);
  const flagged = new Set(furnitureLineIndexes);
  const lines = original.split("\n");
  let body = 0;
  let cutAt = null;
  for (let i = 0; i < lines.length; i += 1) {
    if (flagged.has(i)) continue;
    if (body + lines[i].length <= cap) {
      body += lines[i].length;
      continue;
    }
    cutAt = { line: i, within: cap - body };
    break;
  }
  if (!cutAt) return original;
  const kept = lines.slice(0, cutAt.line);
  if (cutAt.within > 0) kept.push(lines[cutAt.line].slice(0, cutAt.within));
  return kept.join("\n");
}

/**
 * Block closers and line breaks become newlines. Spaces and tabs collapse
 * inside a line. Newlines are kept so the furniture marker can see lines.
 * @param {string} html
 * @returns {string}
 */
export function htmlToReadableText(html) {
  let s = String(html || "");
  s = s.replace(/<script[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<!--[\s\S]*?-->/g, " ");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/(p|div|li|h[1-6]|tr|nav|header|section|article|footer)>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  s = s.replace(/[^\S\n]+/g, " ");
  s = s.replace(/ *\n */g, "\n");
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
}
