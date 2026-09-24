/**
 * B325. A displayed excerpt is always a slice of the source text.
 * The model's passage is a pointer used to find that slice. Never shown.
 *
 * Step 1: exact substring.
 * Step 2: normalised substring (whitespace collapse, curly quotes, dashes),
 *         same map as the widened matcher (R7.B40). quote-locate cannot slice
 *         source characters; this one can.
 * Step 3: best-matching window by character-level similarity. Floor is
 *         DEFAULT_SIMILARITY_FLOOR. A tie is a miss.
 * Then the figures guard: every number, currency code, and multi-word proper
 * noun in the pointer must appear in the recovered slice.
 */

/** ASCII + common NBSP whitespace. No regex (R7.B40). */
function isWsChar(ch) {
  const c = ch.charCodeAt(0);
  return (
    c === 0x20 ||
    c === 0x09 ||
    c === 0x0a ||
    c === 0x0d ||
    c === 0x0c ||
    c === 0x0b ||
    c === 0xa0
  );
}

/**
 * Repair-normalise with parallel original-index map (R7.B40).
 * Collapse whitespace runs to one space; curly quotes to straight; en/em dash to hyphen.
 * map[i] = original source index of normalised[i].
 * @param {string} input
 * @returns {{ normalised: string, map: number[] }}
 */
export function repairNormaliseWithMap(input) {
  const text = typeof input === "string" ? input : "";
  let normalised = "";
  const map = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (isWsChar(ch)) {
      const runStart = i;
      while (i < text.length && isWsChar(text[i])) i += 1;
      normalised += " ";
      map.push(runStart);
      continue;
    }
    let out = ch;
    if (ch === "\u2018" || ch === "\u2019") out = "'";
    else if (ch === "\u201C" || ch === "\u201D") out = '"';
    else if (ch === "\u2013" || ch === "\u2014") out = "-";
    normalised += out;
    map.push(i);
    i += 1;
  }
  return { normalised, map };
}

/**
 * Locate a pointer in stored source text. Offsets are relative to source.text.
 * Exact indexOf first; else repair-normalised locate with map translate.
 * First match only; not found → null/null.
 * @param {string} sourceText
 * @param {string} passage
 * @returns {{ start: number|null, end: number|null }}
 */
export function locatePassageInSource(sourceText, passage) {
  const source = typeof sourceText === "string" ? sourceText : "";
  const needle = typeof passage === "string" ? passage : "";
  if (!needle) return { start: null, end: null };

  const exact = source.indexOf(needle);
  if (exact !== -1) {
    return { start: exact, end: exact + needle.length };
  }

  const { normalised: normSource, map } = repairNormaliseWithMap(source);
  const { normalised: normPassage } = repairNormaliseWithMap(needle);
  if (!normPassage) return { start: null, end: null };

  const normStart = normSource.indexOf(normPassage);
  if (normStart === -1) return { start: null, end: null };

  const normEnd = normStart + normPassage.length;
  if (normStart >= map.length || normEnd - 1 >= map.length) {
    return { start: null, end: null };
  }
  return { start: map[normStart], end: map[normEnd - 1] + 1 };
}

/** Character-level similarity floor for step 3. Measured in Part 2. */
export const DEFAULT_SIMILARITY_FLOOR = 0.85;

const TIE_DELTA = 0.005;
const MAX_POINTER_CHARS = 400;

function levenshtein(a, b) {
  const s = String(a ?? "");
  const t = String(b ?? "");
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  const prev = new Array(t.length + 1);
  const cur = new Array(t.length + 1);
  for (let j = 0; j <= t.length; j += 1) prev[j] = j;
  for (let i = 1; i <= s.length; i += 1) {
    cur[0] = i;
    const sc = s.charCodeAt(i - 1);
    for (let j = 1; j <= t.length; j += 1) {
      const cost = sc === t.charCodeAt(j - 1) ? 0 : 1;
      const del = prev[j] + 1;
      const ins = cur[j - 1] + 1;
      const sub = prev[j - 1] + cost;
      cur[j] = del < ins ? (del < sub ? del : sub) : ins < sub ? ins : sub;
    }
    for (let j = 0; j <= t.length; j += 1) prev[j] = cur[j];
  }
  return prev[t.length];
}

export function similarity(a, b) {
  const s = String(a ?? "");
  const t = String(b ?? "");
  const denom = Math.max(s.length, t.length);
  if (denom === 0) return 1;
  return 1 - levenshtein(s, t) / denom;
}

const CURRENCY_RE = /\b(?:EUR|USD|GBP|CHF|JPY|SGD|HKD)\b/g;
const NUMBER_RE = /\d+(?:,\d{3})*(?:\.\d+)?/g;
const PROPER_NOUN_RE = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g;
const MONTH_RE = /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\b/gi;

/**
 * Anchors the figures guard reads. Numbers, currency codes, multi-word proper nouns.
 * @param {string} text
 */
export function pointerAnchors(text) {
  const s = String(text ?? "");
  const numbers = [];
  let m;
  const numRe = new RegExp(NUMBER_RE.source, "g");
  while ((m = numRe.exec(s))) {
    numbers.push(m[0].replace(/,/g, ""));
  }
  const currencies = [];
  const curRe = new RegExp(CURRENCY_RE.source, "g");
  while ((m = curRe.exec(s))) currencies.push(m[0]);
  const nouns = [];
  const nounRe = new RegExp(PROPER_NOUN_RE.source, "g");
  while ((m = nounRe.exec(s))) nouns.push(m[0]);
  const months = [];
  const monthRe = new RegExp(MONTH_RE.source, "gi");
  while ((m = monthRe.exec(s))) months.push(m[0].toLowerCase());
  return { numbers, currencies, nouns, months };
}

/**
 * A recovered window is a miss if it dropped a number, currency code, or
 * multi-word proper noun from the pointer.
 */
export function figuresAgree(pointer, recovered) {
  const p = pointerAnchors(pointer);
  const r = pointerAnchors(recovered);
  for (const n of p.numbers) {
    if (!r.numbers.includes(n)) return false;
  }
  for (const c of p.currencies) {
    if (!r.currencies.includes(c)) return false;
  }
  const recoveredNorm = repairNormaliseWithMap(recovered).normalised;
  for (const noun of p.nouns) {
    const nounNorm = repairNormaliseWithMap(noun).normalised;
    if (!recovered.includes(noun) && !recoveredNorm.includes(nounNorm)) return false;
  }
  for (const month of p.months) {
    if (!r.months.includes(month)) return false;
  }
  return true;
}

function tokenAnchors(text) {
  const s = String(text ?? "");
  const out = [];
  const re = /\d+|[A-Za-z]{5,}/g;
  let m;
  while ((m = re.exec(s))) out.push({ token: m[0], at: m.index });
  return out;
}

/**
 * Candidate window starts: align each number and long word from the pointer
 * onto the same token in the source. n-grams around a typo (25 vs 25th) miss
 * the true start; token alignment does not.
 */
function candidateStarts(hay, needle) {
  const starts = new Set();
  for (const { token, at } of tokenAnchors(needle)) {
    let from = 0;
    while (from <= hay.length - token.length) {
      const hit = hay.indexOf(token, from);
      if (hit < 0) break;
      starts.add(hit - at);
      starts.add(hit - at - 2);
      starts.add(hit - at + 2);
      from = hit + 1;
    }
  }
  return [...starts].filter((s) => s >= 0 && s < hay.length);
}

function windowFromNorm({ map, start, length }) {
  if (start < 0 || length <= 0) return null;
  const endIdx = start + length - 1;
  if (start >= map.length || endIdx >= map.length) return null;
  return { start: map[start], end: map[endIdx] + 1 };
}

function acceptSlice(source, start, end, pointer, step, sim) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const passage = source.slice(start, end);
  if (!passage.trim()) return null;
  if (!figuresAgree(pointer, passage)) {
    return { miss: true, reason: "figures_guard", step, similarity: sim, start, end, rejectedPassage: passage };
  }
  return { passage, start, end, step, similarity: sim, miss: false };
}

/**
 * Recover the source slice the pointer is trying to name.
 * @param {{ pointer?: string, sourceText?: string, floor?: number }} args
 * @returns {{
 *   passage?: string,
 *   start?: number,
 *   end?: number,
 *   step?: "exact"|"normalised"|"window",
 *   similarity?: number,
 *   miss: boolean,
 *   reason?: string,
 *   rejectedPassage?: string
 * }}
 */
export function recoverExcerptFromSource({ pointer, sourceText, floor = DEFAULT_SIMILARITY_FLOOR } = {}) {
  const source = typeof sourceText === "string" ? sourceText : "";
  const raw = typeof pointer === "string" ? pointer : "";
  const needle = raw.trim();
  if (!needle || !source) {
    return { miss: true, reason: !needle ? "empty_pointer" : "empty_source" };
  }
  const clipped = needle.length > MAX_POINTER_CHARS ? needle.slice(0, MAX_POINTER_CHARS) : needle;
  const simFloor = Number.isFinite(floor) ? floor : DEFAULT_SIMILARITY_FLOOR;

  const exact = source.indexOf(clipped);
  if (exact !== -1) {
    const accepted = acceptSlice(source, exact, exact + clipped.length, clipped, "exact", 1);
    if (accepted?.miss) return accepted;
    if (accepted?.passage) return accepted;
  }

  const { normalised: normSource, map } = repairNormaliseWithMap(source);
  const { normalised: normPointer } = repairNormaliseWithMap(clipped);
  if (normPointer) {
    const normStart = normSource.indexOf(normPointer);
    if (normStart !== -1) {
      const loc = windowFromNorm({ map, start: normStart, length: normPointer.length });
      if (loc) {
        const accepted = acceptSlice(source, loc.start, loc.end, clipped, "normalised", 1);
        if (accepted?.miss) return accepted;
        if (accepted?.passage) return accepted;
      }
    }
  }

  if (!normPointer || normPointer.length < 4) {
    return { miss: true, reason: "no_window" };
  }

  const starts = candidateStarts(normSource, normPointer);
  const n = normPointer.length;
  const lengths = [n, n + 2, n + 4];
  if (n > 2) lengths.push(n - 2);
  let best = null;
  let bestScore = -1;
  let tied = false;
  for (const start of starts) {
    for (const length of lengths) {
      if (start + length > normSource.length) continue;
      const window = normSource.slice(start, start + length);
      const score = similarity(normPointer, window);
      if (score + TIE_DELTA < simFloor) continue;
      if (score > bestScore + TIE_DELTA) {
        best = { start, length, score };
        bestScore = score;
        tied = false;
      } else if (best && Math.abs(score - bestScore) <= TIE_DELTA && start !== best.start) {
        tied = true;
      }
    }
  }
  if (tied) return { miss: true, reason: "ambiguous_tie" };
  if (!best || best.score < simFloor) return { miss: true, reason: "below_floor" };
  const loc = windowFromNorm({ map, start: best.start, length: best.length });
  if (!loc) return { miss: true, reason: "map_miss" };
  const accepted = acceptSlice(source, loc.start, loc.end, clipped, "window", best.score);
  if (accepted?.miss) return accepted;
  if (accepted?.passage) return accepted;
  return { miss: true, reason: "no_window" };
}
