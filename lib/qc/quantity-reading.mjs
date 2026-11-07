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

function collapse(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
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
    if (FUNCTION_WORDS.has(lower) || SCALE_WORDS.has(lower)) break;
    words.push(word[0]);
    i = at + word[0].length;
  }
  return { words, end: i };
}

function precedingWord(text, start) {
  const matches = [...text.slice(0, start).matchAll(/[A-Za-z][A-Za-z'-]*/g)];
  for (let n = matches.length - 1; n >= 0; n -= 1) {
    const word = matches[n][0];
    const lower = word.toLowerCase();
    if (FUNCTION_WORDS.has(lower) || SCALE_WORDS.has(lower) || CURRENCY_WORDS.has(lower)) continue;
    return { word, start: matches[n].index };
  }
  return null;
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
      const before = precedingWord(t, start);
      if (before) {
        anchor = before.word.toLowerCase();
        quoteStart = before.start;
      }
    }
    const raw = collapse(t.slice(quoteStart, quoteEnd));
    if (!raw) continue;
    const key = anchor ? `w:${anchor}` : (notationKey(raw) ? `n:${notationKey(raw)}` : "");
    out.push({ value: numeric, raw, key });
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
