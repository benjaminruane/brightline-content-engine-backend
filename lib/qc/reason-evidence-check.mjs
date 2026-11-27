/**
 * B598. Named gaps checked against the source lines shown on the card.
 * Deterministic. No model call.
 */

const STOP = new Set([
  "a", "an", "the", "and", "or", "of", "to", "in", "on", "at", "for", "with",
  "by", "from", "as", "is", "are", "was", "were", "be", "been", "being",
  "that", "this", "these", "those", "it", "its", "their", "than", "then",
  "into", "over", "under", "about", "across", "between", "through", "while",
  "when", "where", "which", "who", "whom", "has", "have", "had", "do", "does",
  "did", "not", "no", "nor", "but", "if", "so", "such", "also", "more", "most",
  "other", "some", "any", "only", "own", "same", "too", "very", "just", "can",
  "could", "should", "would", "may", "might", "must", "shall", "will",
]);

// Counting words only — magnitude units stay as words (million/billion).
const NUMBER_WORDS = {
  zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5",
  six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
  eleven: "11", twelve: "12", thirteen: "13", fourteen: "14", fifteen: "15",
  sixteen: "16", seventeen: "17", eighteen: "18", nineteen: "19", twenty: "20",
  thirty: "30", forty: "40", fifty: "50", sixty: "60", seventy: "70",
  eighty: "80", ninety: "90", hundred: "100",
};

const MAGNITUDE = {
  thousand: "thousand",
  million: "million",
  billion: "billion",
  bn: "billion",
  mm: "million",
};

function clean(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function normalizeNumber(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return String(raw);
  return Number.isInteger(n) ? String(n) : String(n);
}

/** Normalize one token for overlap: lowercase, strip punctuation, expand number words, unify currency. */
export function normalizeToken(raw) {
  let token = String(raw || "").toLowerCase();
  token = token.replace(/[^\p{L}\p{N}.%-]+/gu, "");
  // Trailing sentence period (not a decimal): "billion." → "billion"
  if (/\.$/.test(token) && !/\d\.$/.test(token)) token = token.slice(0, -1);
  if (!token) return "";
  if (NUMBER_WORDS[token]) return NUMBER_WORDS[token];
  if (MAGNITUDE[token]) return MAGNITUDE[token];
  if (token === "percent" || token === "pct" || token === "%") return "%";
  if (token === "pence" || token === "p") return "p";
  if (token === "usd" || token === "eur" || token === "gbp" || token === "dollars" || token === "dollar") {
    return token === "dollars" || token === "dollar" ? "usd" : token;
  }
  // $3 / $3.0 / $3bn — currency sigil required (bare digits stay bare).
  const money = token.match(/^\$(\d+(?:\.\d+)?)(k|m|mm|bn|b)?$/i);
  if (money) {
    const n = normalizeNumber(money[1]);
    const unit = (money[2] || "").toLowerCase();
    if (unit === "k") return `usd${n}thousand`;
    if (unit === "m" || unit === "mm") return `usd${n}million`;
    if (unit === "bn" || unit === "b") return `usd${n}billion`;
    return `usd${n}`;
  }
  // 862.5p / 15.9% / 3bn
  const unitNum = token.match(/^(\d+(?:\.\d+)?)(p|pence|%|percent|pct|k|m|mm|bn|b)$/i);
  if (unitNum) {
    const n = normalizeNumber(unitNum[1]);
    const unit = unitNum[2].toLowerCase();
    if (unit === "p" || unit === "pence") return `${n}p`;
    if (unit === "%" || unit === "percent" || unit === "pct") return `${n}%`;
    if (unit === "k") return `${n}thousand`;
    if (unit === "m" || unit === "mm") return `${n}million`;
    if (unit === "bn" || unit === "b") return `${n}billion`;
  }
  // usd3 / usd3.0 / eur678
  const glued = token.match(/^(usd|eur|gbp)(\d+(?:\.\d+)?)(k|m|mm|bn|b)?$/i);
  if (glued) {
    const cur = glued[1].toLowerCase();
    const n = normalizeNumber(glued[2]);
    const unit = (glued[3] || "").toLowerCase();
    if (unit === "k") return `${cur}${n}thousand`;
    if (unit === "m" || unit === "mm") return `${cur}${n}million`;
    if (unit === "bn" || unit === "b") return `${cur}${n}billion`;
    return `${cur}${n}`;
  }
  if (/^\d+\.\d+$/.test(token) || /^\d+$/.test(token)) return normalizeNumber(token);
  return token;
}

/** Light stem so doubled ≈ doubling, retailers ≈ retailer. */
export function stemToken(token) {
  const t = String(token || "");
  if (t.length <= 4) return t;
  if (t.endsWith("ing") && t.length > 5) {
    const base = t.slice(0, -3);
    return base.endsWith(base.slice(-1)) ? base.slice(0, -1) || base : base;
  }
  if (t.endsWith("ied") && t.length > 5) return `${t.slice(0, -3)}y`;
  if (t.endsWith("ed") && t.length > 5) {
    const base = t.slice(0, -2);
    return base.endsWith(base.slice(-1)) ? base.slice(0, -1) || base : base;
  }
  if (t.endsWith("ies") && t.length > 5) return `${t.slice(0, -3)}y`;
  if (t.endsWith("es") && t.length > 5) return t.slice(0, -2);
  if (t.endsWith("s") && !t.endsWith("ss") && t.length > 4) return t.slice(0, -1);
  return t;
}

export function tokenizeForOverlap(text) {
  const body = clean(text);
  if (!body) return [];
  const spaced = body
    .replace(/\$(\d+(?:\.\d+)?)/g, " usd$1 ")
    .replace(/£(\d+(?:\.\d+)?)/g, " gbp$1 ")
    .replace(/€(\d+(?:\.\d+)?)/g, " eur$1 ")
    .replace(/\b(usd|eur|gbp)\s+/gi, " $1 ")
    .replace(/(\d),(\d{3})\b/g, "$1$2")
    .replace(/(\d+(?:\.\d+)?)\s*%/g, " $1% ")
    .replace(/(\d+(?:\.\d+)?)\s*(p|pence)\b/gi, " $1p ")
    .replace(/\b(\d+(?:\.\d+)?)\s*(percent|pct)\b/gi, " $1% ");
  const out = [];
  for (const part of spaced.split(/\s+/)) {
    const token = normalizeToken(part);
    if (!token || STOP.has(token)) continue;
    out.push(token);
  }
  // Collapse "usd" + "3" + "billion" so $3 billion ≈ USD 3.0 billion.
  const collapsed = [];
  for (let i = 0; i < out.length; i += 1) {
    const cur = out[i];
    const next = out[i + 1];
    const third = out[i + 2];
    if ((cur === "usd" || cur === "eur" || cur === "gbp") && next && /^\d/.test(next)) {
      const joined = `${cur}${next}`;
      collapsed.push(joined);
      if (third && (third === "million" || third === "billion" || third === "thousand")) {
        collapsed.push(third);
        collapsed.push(`${joined}${third}`);
        i += 2;
      } else {
        i += 1;
      }
      continue;
    }
    if (/^\d/.test(cur) && next && (next === "million" || next === "billion" || next === "thousand")) {
      collapsed.push(cur);
      collapsed.push(next);
      collapsed.push(`${cur}${next}`);
      i += 1;
      continue;
    }
    // usd3 + billion (from $3 billion) → also usd3billion
    if (/^(usd|eur|gbp)\d/.test(cur) && next && (next === "million" || next === "billion" || next === "thousand")) {
      collapsed.push(cur);
      collapsed.push(next);
      collapsed.push(`${cur}${next}`);
      i += 1;
      continue;
    }
    collapsed.push(cur);
  }
  return collapsed;
}

export function figuresOf(text) {
  const tokens = tokenizeForOverlap(text);
  return tokens.filter((t) => /^(?:usd|eur|gbp)?\d/.test(t) || /^\d/.test(t));
}

/**
 * True when every content word and every figure in `gap` appears in the union of `lines`.
 * Uses stem matching so doubled ≈ doubling.
 */
export function gapAppearsInLines(gap, lines) {
  const gapTokens = tokenizeForOverlap(gap);
  if (!gapTokens.length) return false;
  const corpus = Array.isArray(lines) ? lines.map(clean).filter(Boolean).join("\n") : clean(lines);
  if (!corpus) return false;
  const hayExact = new Set(tokenizeForOverlap(corpus));
  const hayStem = new Set([...hayExact].map(stemToken));
  for (const token of gapTokens) {
    if (hayExact.has(token) || hayStem.has(stemToken(token))) continue;
    return false;
  }
  return true;
}

/**
 * Source lines shown on the card: primary excerpt, reading-note quote, fact extracts,
 * support spans, matcher passages. Never the reason face (avoids circular "gap present"
 * when the reason itself names the gap).
 */
export function shownSourceLines(card) {
  const lines = [];
  const push = (value) => {
    const body = clean(value);
    if (body) lines.push(body);
  };
  push(card?.primaryExcerpt);
  push(card?.primaryExcerptText);
  push(card?.sourceQuote);
  // Never include readingNote.text / shownReason — those name the gap and make I2 circular.
  for (const row of Array.isArray(card?.readingNote?.documentValues) ? card.readingNote.documentValues : []) {
    push(row?.value);
  }
  for (const part of Array.isArray(card?.primaryExcerptParts) ? card.primaryExcerptParts : []) {
    push(typeof part === "string" ? part : (part?.text || part?.passage));
  }
  for (const fact of Array.isArray(card?.readingFacts) ? card.readingFacts : []) {
    push(fact?.extract);
    push(fact?.surface);
    for (const shown of Array.isArray(fact?.shown?.shown) ? fact.shown.shown : []) {
      push(shown?.extract || shown?.text);
    }
  }
  for (const span of Array.isArray(card?.supportSpans) ? card.supportSpans : []) {
    push(span?.text || span?.extract || span?.passage);
  }
  for (const match of Array.isArray(card?.matchExplanations) ? card.matchExplanations : []) {
    // Passage/excerpt only — not the matcher explanation (that names the gap).
    push(match?.passage || match?.excerpt);
  }
  return lines;
}

/**
 * Drop gaps that already appear in the shown source lines.
 */
export function filterPresentGaps(gaps, card) {
  const lines = shownSourceLines(card);
  const list = Array.isArray(gaps) ? gaps : [];
  return list.filter((gap) => !gapAppearsInLines(gap, lines));
}

/**
 * A gap that is really a full explanation (not a short noun phrase for "differ on").
 * Starts with "The sentence" / "The source", or a capital letter that is not a
 * proper noun taken from the draft sentence.
 */
export function isFullExplanationGap(gap, sentence = "") {
  const body = clean(gap);
  if (!body) return false;
  if (/^the sentence\b/i.test(body) || /^the source\b/i.test(body) || /^the draft\b/i.test(body)) {
    return true;
  }
  if (!/^[A-Z]/.test(body)) return false;
  // Short noun phrases stay phrases (no sentence terminator, under ~12 words).
  const words = body.split(/\s+/);
  if (words.length <= 12 && !/[.!?]$/.test(body) && !/\b(states|confirms|says|while|but|however)\b/i.test(body)) {
    // Capital may be a proper noun from the sentence.
    const first = words[0].replace(/[^A-Za-z]/g, "");
    const sentenceWords = new Set(
      clean(sentence).split(/\s+/).map((w) => w.replace(/[^A-Za-z]/g, "")).filter(Boolean),
    );
    if (sentenceWords.has(first) || sentenceWords.has(words[0])) return false;
    // Lowercase continuation after first word → likely a phrase headed by a name.
    if (words.length >= 2 && /^[a-z]/.test(words[1])) return false;
  }
  // Capital start plus clause verbs / length → full explanation.
  if (/\b(states|confirms|says|while|but|however|which|that the)\b/i.test(body)) return true;
  if (words.length > 12) return true;
  if (/[.!?]$/.test(body)) return true;
  return /^[A-Z]/.test(body) && words.length > 8;
}

/** Cut at the end of a sentence. Never mid-word. Never a fixed character count. */
export function asCompleteSentence(text) {
  const body = clean(text);
  if (!body) return "";
  // Prefer the first complete sentence that is not a mid-word stump.
  const match = body.match(/^(.+?[.!?])(?:\s|$)/);
  if (match) {
    const sentence = clean(match[1]);
    const lastWord = (sentence.replace(/[.!?]"?$/, "").match(/\S+$/) || [""])[0];
    // Reject a trailing 1-2 letter stump (e.g. "… in li.") left by a char cap.
    if (lastWord.length >= 1 && lastWord.length <= 2 && !/^(a|an|as|at|be|by|do|if|in|is|it|me|my|no|of|on|or|so|to|up|us|we)$/i.test(lastWord)) {
      return "";
    }
    return sentence;
  }
  // No terminator: do not invent a period on a truncated phrase.
  if (/[.!?]$/.test(body)) return body;
  return "";
}

/**
 * Build the reason from remaining named gaps.
 * Full explanations stand alone. Short noun phrases use the "differ on" template.
 */
export function reasonFromNamedGaps(gaps, sentence = "") {
  const list = (Array.isArray(gaps) ? gaps : []).map(clean).filter(Boolean);
  if (!list.length) return "";
  const first = list[0];
  if (isFullExplanationGap(first, sentence)) {
    return asCompleteSentence(first);
  }
  // Prefer a short noun phrase.
  const phrase = first.replace(/[.!?]+$/, "").trim();
  if (!phrase) return "";
  return `The sentence and the source differ on ${phrase}.`;
}

/**
 * True when a reason names at least one specific sentence element
 * (figure, date, name, or quoted/phrase-sized token from the sentence).
 */
export function reasonNamesSpecificElement(reason, sentence = "") {
  const body = clean(reason);
  if (!body) return false;
  if (figuresOf(body).length) return true;
  if (/\b(?:19|20)\d{2}\b/.test(body)) return true;
  if (/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\b/i.test(body)) {
    return true;
  }
  const sTokens = new Set(tokenizeForOverlap(sentence));
  const rTokens = tokenizeForOverlap(body).filter((t) => t.length > 2);
  // A content word shared with the sentence counts as naming an element.
  if (rTokens.some((t) => sTokens.has(t) && !/^(source|sentence|draft|statement|support|confirm)$/.test(t))) {
    return true;
  }
  if (/['"][^'"]{3,}['"]/.test(body)) return true;
  return false;
}
