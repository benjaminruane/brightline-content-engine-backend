/**
 * B405. Page furniture is stripped from the head of a stored source only.
 * A line after the first real sentence is left alone. If the cut would
 * remove more than 30% of the text, the original is returned unchanged.
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

export function stripLeadingPageFurniture(text) {
  if (typeof text !== "string") return "";
  if (!text) return text;
  const lines = text.split("\n");
  const boundary = firstRealSentenceIndex(lines);
  if (boundary === 0) return text;
  const kept = [];
  for (let i = 0; i < boundary; i += 1) {
    if (!isPageFurnitureLine(lines[i])) kept.push(lines[i]);
  }
  if (kept.length === boundary) return text;
  const headJoined = lines.slice(0, boundary).join("\n");
  const suffix = text.slice(headJoined.length === 0 ? 0 : headJoined.length + 1);
  const head = kept.join("\n");
  const next = head ? `${head}\n${suffix}` : suffix;
  if (text.length > 0 && (text.length - next.length) / text.length > 0.3) return text;
  return next;
}
