/**
 * A quantity is a number and the word beside it, read inside one passage.
 * Notation (a sign, a currency mark, a scale) is kept. No unit is named here.
 */

const FUNCTION_WORDS = new Set([
  "a", "an", "the", "of", "to", "from", "and", "or", "but", "is", "are", "was", "were",
  "be", "been", "being", "in", "on", "at", "by", "for", "with", "as", "than", "per",
  "up", "about", "approximately", "nearly", "around", "over", "under", "some",
  "that", "this", "these", "those", "its", "their", "our", "has", "have", "had",
  "into", "across", "between", "against", "during", "after", "before", "within",
  "without", "via", "not",
]);

const SCALE_WORDS = new Set(["million", "billion", "thousand", "bn", "mm"]);
const CURRENCY_WORDS = new Set(["usd", "eur", "gbp", "aud", "cad"]);
const VERBS = new Set(["is", "are", "was", "were", "be", "been", "being", "has", "have", "had"]);
const ARTICLES = new Set(["a", "an", "the"]);
const JOINERS = new Set(["of"]);

function collapse(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function showsAsQuantity(raw) {
  const words = raw.toLowerCase().split(/[^a-z0-9%€£$]+/).filter(Boolean);
  if (words.some((word) => VERBS.has(word))) return false;
  return /\d/.test(raw);
}

function notationKey(raw) {
  const s = raw.toLowerCase();
  const bits = [];
  if (s.includes("$")) bits.push("$");
  else if (s.includes("€")) bits.push("€");
  else if (s.includes("£")) bits.push("£");
  else {
    const code = s.match(/\b(usd|eur|gbp|aud|cad)\b/);
    if (code) bits.push(code[1]);
  }
  if (s.includes("%") || /\bpercent\b/.test(s)) bits.push("%");
  if (/(?:^|\s)x\b/.test(s) || /\dx\b/.test(s)) bits.push("x");
  const scale = s.match(/\b(million|billion|thousand|bn|mm)\b/);
  if (scale) bits.push(scale[1]);
  return bits.join(" ");
}

function followingPhrase(text, end) {
  let i = end;
  const words = [];
  while (i < text.length) {
    const gap = text.slice(i).match(/^[ \t]+/);
    if (!gap) break;
    const at = i + gap[0].length;
    const word = text.slice(at).match(/^[A-Za-z][A-Za-z'-]*/);
    if (!word) break;
    const lower = word[0].toLowerCase();
    if (FUNCTION_WORDS.has(lower) || SCALE_WORDS.has(lower) || VERBS.has(lower)) break;
    words.push(word[0]);
    i = at + word[0].length;
  }
  return { words, end: i };
}

function wordBefore(text, index) {
  const slice = text.slice(0, index);
  const match = slice.match(/([A-Za-z][A-Za-z'-]*)\s*$/);
  if (!match) return null;
  return { word: match[1], start: index - match[0].length };
}

/**
 * The naming word and where the quote starts. A verb stops the quote at the
 * number. The word beyond that verb can still name the quantity.
 */
function leftOfNumber(text, start) {
  let i = start;
  let quoteStart = start;
  let anchor = "";
  let crossedVerb = false;
  while (i > 0) {
    const prev = wordBefore(text, i);
    if (!prev) break;
    const lower = prev.word.toLowerCase();
    if (CURRENCY_WORDS.has(lower) || SCALE_WORDS.has(lower)) break;
    if (VERBS.has(lower)) {
      crossedVerb = true;
      i = prev.start;
      continue;
    }
    if (ARTICLES.has(lower) || JOINERS.has(lower)) {
      if (!crossedVerb && JOINERS.has(lower)) quoteStart = prev.start;
      i = prev.start;
      continue;
    }
    if (FUNCTION_WORDS.has(lower)) break;
    if (!anchor) anchor = lower;
    if (crossedVerb) break;
    quoteStart = prev.start;
    i = prev.start;
  }
  return { quoteStart, anchor };
}

/**
 * @param {string} text
 * @returns {Array<{ value: number, raw: string, key: string }>}
 */
export function readQuantities(text) {
  const t = typeof text === "string" ? text : "";
  const re = /\d[\d,]*(?:\.\d+)?/g;
  const out = [];
  let match;
  while ((match = re.exec(t))) {
    const numberStart = match.index;
    if (numberStart > 0 && /[A-Za-z]/.test(t[numberStart - 1])) continue;
    const numeric = Number(match[0].replace(/,/g, ""));
    if (!Number.isFinite(numeric)) continue;
    let start = numberStart;
    let end = numberStart + match[0].length;
    const currency = t.slice(0, start).match(/(?:USD|EUR|GBP|AUD|CAD|\$|€|£)\s*$/i);
    if (currency) start -= currency[0].length;
    const suffix = t.slice(end).match(/^\s*(?:%|x\b)/i);
    if (suffix) end += suffix[0].length;
    else {
      const spelled = t.slice(end).match(/^\s+(?:percent\b|per\s+cent\b)/i);
      if (spelled) end += spelled[0].length;
    }
    const scale = t.slice(end).match(/^\s+(million|billion|thousand|bn|mm)\b/i);
    if (scale) end += scale[0].length;
    const after = followingPhrase(t, end);
    let quoteStart = start;
    let quoteEnd = end;
    let anchor = "";
    if (after.words.length) {
      anchor = after.words.join(" ").toLowerCase();
      quoteEnd = after.end;
    } else {
      const before = leftOfNumber(t, start);
      anchor = before.anchor;
      quoteStart = before.quoteStart;
    }
    const raw = collapse(t.slice(quoteStart, quoteEnd));
    if (!raw || !showsAsQuantity(raw)) continue;
    const notation = notationKey(raw);
    const wordKey = anchor ? `w:${anchor}` : "";
    const notationKeyId = notation ? `n:${notation}` : "";
    out.push({
      value: numeric,
      raw,
      key: wordKey || notationKeyId,
      wordKey,
      notationKey: notationKeyId,
    });
  }
  return out;
}

/**
 * Keys that name one quantity in this text, and keys used more than once.
 * @param {string} text
 * @returns {{ one: Map<string, { value: number, raw: string, key: string }>, many: Set<string> }}
 */
export function quantityGroups(text) {
  const one = new Map();
  const many = new Set();
  const seen = new Map();
  for (const row of readQuantities(text)) {
    if (!row.key) continue;
    const list = seen.get(row.key) || [];
    list.push(row);
    seen.set(row.key, list);
  }
  for (const [key, rows] of seen) {
    if (rows.length === 1) one.set(key, rows[0]);
    else many.add(key);
  }
  return { one, many };
}
