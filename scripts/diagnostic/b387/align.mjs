/**
 * B387 throwaway. Token alignment of a statement against one passage.
 * Pure. No model, no network, no product-code edits.
 *
 * The product quantity tokeniser (tokenizeQuantities in
 * lib/revise-actions/conflict-engagement.mjs) is not the alignment alphabet:
 * it emits figures, dates and currencies only, and it refuses number words.
 * A word that is not a quantity (MAIT, bartered, commenced) would never
 * become a position. This file tokenises words and uses its own quantity
 * and date keys for the equivalence tiers. See REPORT.md.
 */

const MATCH = 2;
const MISMATCH = -1;
const GAP = -1;

const MONTHS = {
  january: 1, jan: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sept: 9, sep: 9,
  october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
};

const NUMBER_WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90,
};

const SCALE_EXP = {
  hundred: 2, thousand: 3, million: 6, billion: 9,
  m: 6, mm: 6, bn: 9, k: 3,
};

const CURRENCY_WORDS = {
  usd: "usd", dollar: "usd", dollars: "usd",
  gbp: "gbp", pound: "gbp", pounds: "gbp", sterling: "gbp",
  eur: "eur", euro: "eur", euros: "eur",
};

const SYMBOL_CURRENCY = { "$": "usd", "£": "gbp", "€": "eur", "¥": "jpy" };

function isSpace(ch) {
  return ch === " " || ch === "\n" || ch === "\t" || ch === "\r" || ch === "\f";
}

function isDigit(ch) {
  return ch >= "0" && ch <= "9";
}

function isLetter(ch) {
  return (ch >= "A" && ch <= "Z") || (ch >= "a" && ch <= "z");
}

function foldKey(text) {
  return String(text)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’‛]/g, "")
    .replace(/[“”]/g, "")
    .replace(/[–—−]/g, "");
}

function makeToken(text, start, end, key) {
  return { text: text.slice(start, end), start, end, key };
}

function readNumber(text, i) {
  const start = i;
  if (text[i] === "-" || text[i] === "−") i += 1;
  const digitStart = i;
  while (i < text.length && isDigit(text[i])) i += 1;
  if (i === digitStart) return start;
  if (text[i] === "," && isDigit(text[i + 1])) {
    while (text[i] === "," && isDigit(text[i + 1])) {
      i += 1;
      let k = 0;
      while (k < 3 && isDigit(text[i])) {
        i += 1;
        k += 1;
      }
    }
  }
  if (text[i] === "." && isDigit(text[i + 1])) {
    i += 1;
    while (i < text.length && isDigit(text[i])) i += 1;
  }
  if (text[i] === "%") i += 1;
  const tail = text.slice(i, i + 7).toLowerCase();
  if (tail.startsWith("bn") && !isLetter(text[i + 2] || "")) i += 2;
  else if ((text[i] === "m" || text[i] === "M" || text[i] === "k" || text[i] === "K") && !isLetter(text[i + 1] || "")) {
    if (!tail.startsWith("million")) i += 1;
  } else if (isLetter(text[i] || "")) {
    const wordStart = i;
    while (i < text.length && (isLetter(text[i]) || isDigit(text[i]))) i += 1;
    const glued = text.slice(wordStart, i).toLowerCase();
    if (glued === "million" || glued === "billion" || glued === "thousand" || glued === "percent") {
      i = wordStart;
    }
  }
  return i;
}

/**
 * tier 0: whitespace-separated tokens, punctuation left attached.
 * tier >= 1: punctuation, quotes and dashes are separators; case is folded
 * into the key. Number commas and decimal points stay inside the number.
 */
export function tokenize(text, tier) {
  const s = String(text ?? "");
  const tokens = [];
  let i = 0;
  if (tier <= 0) {
    while (i < s.length) {
      while (i < s.length && isSpace(s[i])) i += 1;
      if (i >= s.length) break;
      const start = i;
      while (i < s.length && !isSpace(s[i])) i += 1;
      tokens.push(makeToken(s, start, i, s.slice(start, i)));
    }
    return tokens;
  }
  while (i < s.length) {
    const ch = s[i];
    if (isSpace(ch) || ch === "," || ch === ";" || ch === ":" || ch === "!" || ch === "?"
      || ch === "(" || ch === ")" || ch === "[" || ch === "]" || ch === "{" || ch === "}"
      || ch === "\"" || ch === "'" || ch === "“" || ch === "”" || ch === "‘" || ch === "’"
      || ch === "/" || ch === "|" || ch === "…" || ch === "•" || ch === "-" || ch === "–"
      || ch === "—" || ch === "−") {
      if ((ch === "-" || ch === "−") && isDigit(s[i + 1] || "")) {
        const start = i;
        i = readNumber(s, i);
        if (i > start) {
          tokens.push(makeToken(s, start, i, foldKey(s.slice(start, i))));
          continue;
        }
      }
      i += 1;
      continue;
    }
    if (ch === "." && !isDigit(s[i + 1] || "")) {
      i += 1;
      continue;
    }
    if (SYMBOL_CURRENCY[ch]) {
      let j = i + 1;
      while (j < s.length && isSpace(s[j])) j += 1;
      if (isDigit(s[j] || "") || s[j] === "-" || s[j] === "−") {
        const start = i;
        i = readNumber(s, j);
        tokens.push(makeToken(s, start, i, foldKey(s.slice(start, i))));
        continue;
      }
      i += 1;
      continue;
    }
    if (isDigit(ch)) {
      const start = i;
      i = readNumber(s, i);
      tokens.push(makeToken(s, start, i, foldKey(s.slice(start, i))));
      continue;
    }
    if (isLetter(ch)) {
      const start = i;
      while (i < s.length && (isLetter(s[i]) || isDigit(s[i]) || s[i] === "'" || s[i] === "’")) i += 1;
      tokens.push(makeToken(s, start, i, foldKey(s.slice(start, i))));
      continue;
    }
    i += 1;
  }
  return tokens;
}

function canonical(numStr, exp) {
  let neg = false;
  let s = String(numStr);
  if (s.startsWith("-")) {
    neg = true;
    s = s.slice(1);
  }
  const [whole, frac = ""] = s.split(".");
  let digits = `${whole}${frac}`.replace(/^0+/, "") || "0";
  const shift = exp - frac.length;
  let out;
  if (shift >= 0) out = digits + "0".repeat(shift);
  else {
    const cut = digits.length + shift;
    if (cut <= 0) out = `0.${"0".repeat(-cut)}${digits}`;
    else {
      const fracPart = digits.slice(cut).replace(/0+$/, "");
      out = fracPart ? `${digits.slice(0, cut)}.${fracPart}` : digits.slice(0, cut);
    }
  }
  out = out.replace(/^0+(\d)/, "$1");
  return (neg ? "-" : "") + out;
}

function parseNumberText(raw) {
  let s = String(raw).trim().toLowerCase().replace(/[–—−]/g, "-").replace(/,/g, "");
  let currency = null;
  const sym = s[0];
  if (SYMBOL_CURRENCY[sym]) {
    currency = SYMBOL_CURRENCY[sym];
    s = s.slice(1).trim();
  }
  let percent = false;
  if (s.endsWith("%")) {
    percent = true;
    s = s.slice(0, -1);
  }
  let scale = null;
  const scaleMatch = s.match(/(bn|mm|m|k)$/);
  if (scaleMatch && /\d/.test(s)) {
    scale = scaleMatch[1];
    s = s.slice(0, -scale.length);
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return { value: s, currency, percent, scale };
}

function quantityKey(currency, value, exp, percent) {
  if (percent) return `q:pct:${canonical(value, 0)}`;
  const cur = currency || "bare";
  return `q:${cur}:${canonical(value, exp)}`;
}

function tryDate(tokens, i) {
  const a = tokens[i];
  const b = tokens[i + 1];
  const c = tokens[i + 2];
  if (!a || !b) return null;
  const day = (t) => {
    if (!t) return null;
    const m = String(t.key).match(/^(\d{1,2})(?:st|nd|rd|th)?$/);
    if (!m) return null;
    const n = Number(m[1]);
    return n >= 1 && n <= 31 ? n : null;
  };
  const year = (t) => (t && /^(19|20)\d{2}$/.test(t.key) ? t.key : null);
  const pad = (n) => String(n).padStart(2, "0");
  const d1 = day(a);
  const d2 = day(b);
  if (d1 && MONTHS[b.key] && year(c)) {
    return { end: i + 3, key: `d:${year(c)}-${pad(MONTHS[b.key])}-${pad(d1)}` };
  }
  if (MONTHS[a.key] && d2 && year(c)) {
    return { end: i + 3, key: `d:${year(c)}-${pad(MONTHS[a.key])}-${pad(d2)}` };
  }
  if (MONTHS[a.key] && year(b)) {
    return { end: i + 2, key: `d:${year(b)}-${pad(MONTHS[a.key])}` };
  }
  return null;
}

function tryQuantity(tokens, i) {
  let j = i;
  let currency = null;
  if (CURRENCY_WORDS[tokens[j].key]) {
    currency = CURRENCY_WORDS[tokens[j].key];
    j += 1;
  }
  if (j >= tokens.length) return null;
  const wordNum = NUMBER_WORDS[tokens[j].key];
  const parsed = wordNum == null ? parseNumberText(tokens[j].text) : null;
  if (wordNum == null && !parsed) return null;
  let value = wordNum != null ? String(wordNum) : parsed.value;
  let percent = parsed ? parsed.percent : false;
  if (parsed && parsed.currency) currency = parsed.currency;
  let exp = parsed && parsed.scale ? SCALE_EXP[parsed.scale] : 0;
  j += 1;
  if (!percent && j < tokens.length && tokens[j].key === "percent") {
    percent = true;
    j += 1;
  } else if (!percent && j + 1 < tokens.length && tokens[j].key === "per" && tokens[j + 1].key === "cent") {
    percent = true;
    j += 2;
  } else if (!percent && j < tokens.length && SCALE_EXP[tokens[j].key] != null && tokens[j].key !== "m") {
    exp += SCALE_EXP[tokens[j].key];
    j += 1;
  } else if (!percent && j < tokens.length && tokens[j].key === "m" && (wordNum != null || parsed)) {
    exp += SCALE_EXP.m;
    j += 1;
  }
  if (percent) exp = 0;
  const key = quantityKey(currency, value, exp, percent);
  return { end: j, key };
}

function mergedToken(source, tokens, from, to, key) {
  return {
    text: source.slice(tokens[from].start, tokens[to - 1].end),
    start: tokens[from].start,
    end: tokens[to - 1].end,
    key,
  };
}

export function tokensForTier(text, tier, synonymMap) {
  const base = tokenize(text, tier >= 1 ? 1 : 0);
  if (tier < 2) return base;
  const out = [];
  for (let i = 0; i < base.length;) {
    if (tier >= 3) {
      const date = tryDate(base, i);
      if (date) {
        out.push(mergedToken(String(text ?? ""), base, i, date.end, date.key));
        i = date.end;
        continue;
      }
    }
    const qty = tryQuantity(base, i);
    if (qty && qty.end > i) {
      out.push(mergedToken(String(text ?? ""), base, i, qty.end, qty.key));
      i = qty.end;
      continue;
    }
    out.push(base[i]);
    i += 1;
  }
  if (tier >= 4 && synonymMap) {
    for (const token of out) {
      if (token.key.startsWith("q:") || token.key.startsWith("d:")) continue;
      const mapped = synonymMap.get(token.key);
      if (mapped) token.key = mapped;
    }
  }
  return out;
}

function toSpan(token) {
  if (!token) return null;
  return { start: token.start, end: token.end, text: token.text };
}

/**
 * Global token alignment (Needleman-Wunsch).
 * Match +2, mismatch -1, gap -1. On a tie the diagonal wins, so a pair of
 * tokens is a substitution rather than an add plus a drop.
 *
 * same: keys equal. substituted: both sides have a token and the keys differ.
 * added: statement token with no passage token. dropped: passage token with
 * no statement token. Dropped is not a defect; the caller decides that.
 */
export function alignStatementToPassage(statement, passage, options = {}) {
  const tier = options.tier ?? 0;
  const synonymMap = options.synonymMap || null;
  const a = tokensForTier(statement, tier, synonymMap);
  const b = tokensForTier(passage, tier, synonymMap);
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  const bt = Array.from({ length: n + 1 }, () => new Int8Array(m + 1));
  for (let i = 1; i <= n; i += 1) {
    dp[i][0] = i * GAP;
    bt[i][0] = 1;
  }
  for (let j = 1; j <= m; j += 1) {
    dp[0][j] = j * GAP;
    bt[0][j] = 2;
  }
  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      const eq = a[i - 1].key.length > 0 && a[i - 1].key === b[j - 1].key;
      const diag = dp[i - 1][j - 1] + (eq ? MATCH : MISMATCH);
      const up = dp[i - 1][j] + GAP;
      const left = dp[i][j - 1] + GAP;
      let best = diag;
      let how = 0;
      if (up > best) {
        best = up;
        how = 1;
      }
      if (left > best) {
        best = left;
        how = 2;
      }
      dp[i][j] = best;
      bt[i][j] = how;
    }
  }
  const ops = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const how = i === 0 ? 2 : j === 0 ? 1 : bt[i][j];
    if (how === 0) {
      const eq = a[i - 1].key.length > 0 && a[i - 1].key === b[j - 1].key;
      ops.push({
        class: eq ? "same" : "substituted",
        statementSpan: toSpan(a[i - 1]),
        passageSpan: toSpan(b[j - 1]),
      });
      i -= 1;
      j -= 1;
    } else if (how === 1) {
      ops.push({ class: "added", statementSpan: toSpan(a[i - 1]), passageSpan: null });
      i -= 1;
    } else {
      ops.push({ class: "dropped", statementSpan: null, passageSpan: toSpan(b[j - 1]) });
      j -= 1;
    }
  }
  ops.reverse();
  return { positions: ops };
}

export function defectPositions(positions) {
  return positions.filter((p) => p.class === "substituted" || p.class === "added");
}

/**
 * Page furniture: the excerpt opens on website chrome rather than a sentence.
 * Nav bar: the first 240 characters of the whitespace-collapsed text contain
 * "Log In", "Sign Up" and "Newsroom".
 * Related-story chrome: the first 300 characters contain "MONTH AGO" and the
 * excerpt is longer than 1000 characters (a page dump, not a sentence).
 */
export function furnitureReason(text) {
  const raw = String(text ?? "");
  const flat = raw.replace(/\s+/g, " ").trim();
  if (!flat) return null;
  const head = flat.slice(0, 240);
  if (/log in/i.test(head) && /sign up/i.test(head) && /newsroom/i.test(head)) {
    return "navigation bar leads the excerpt";
  }
  if (raw.length > 1000 && /month ago/i.test(flat.slice(0, 300))) {
    return "related-story chrome leads the excerpt";
  }
  return null;
}
