/**
 * B457. The one evidence line.
 * B458. A wording note may say what the source says. It may not explain
 * that two written forms are the same thing. That sentence is the product
 * talking about its own matching.
 */

const INTERNAL_REJECTION = /^A note (?:was written|on the draft was written)/;

const EQUIVALENCE = [
  /\bsame (?:claim|claims|figures?|point|assertion|headcount|recommendation|role|term|quantity|thing)\b/i,
  /\bphrased differently\b/i,
  /\b(?:different|other|slightly different) words\b/i,
  /\bin other words\b/i,
  /\b(?:conveys|expresses) the same\b/i,
  /\bdoes not change\b/i,
  /\bwithout changing\b/i,
  /\bno claim differs\b/i,
  /\bsynonym\b/i,
  /\bthousands separator\b/i,
  /\bdifferent separator\b/i,
  /\bequivalent\b/i,
  /\brestates?\b/i,
  /\bmatches the source\b/i,
  /\bfigures? match\b/i,
  /\bdates match\b/i,
  /\bmatch exactly\b/i,
  /\brounded restatement\b/i,
  /\bnot a different (?:claim|quantity|term)\b/i,
  /\bthe claim is the same\b/i,
  /\breordering of the same\b/i,
  /\bsame (?:judgement|judgment)\b/i,
];

const REAL_DIFFERENCE = /\b(?:not the same|does not match|a different (?:figure|number|amount|period|date)|does not (?:state|say|support))\b/i;

const STATEMENT_TURN = /\s+(?:while|whereas)\s+the statement\b|;\s*the statement\b|,\s+(?:but|while)\s+the statement\b|\s+which the statement\b|\s+The statement\b/i;

export function quoteIsVerbatim(quote, sources) {
  const text = typeof quote === "string" ? quote : "";
  if (!text) return false;
  const list = Array.isArray(sources) ? sources : [];
  return list.some((source) => typeof source?.text === "string" && source.text.includes(text));
}

export function sentencesOf(text) {
  return String(text || "")
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function isEquivalenceSentence(sentence) {
  const text = String(sentence || "").trim();
  if (!text || REAL_DIFFERENCE.test(text)) return false;
  return EQUIVALENCE.some((pattern) => pattern.test(text));
}

function sourceClause(sentence) {
  const at = sentence.search(STATEMENT_TURN);
  const body = (at > 0 ? sentence.slice(0, at) : sentence).replace(/[,;]\s*$/, "").trim();
  if (!body) return "";
  return /[.!?]["']?$/.test(body) ? body : `${body}.`;
}

/**
 * Keep what the source says. Drop a sentence whose job is to say the
 * draft's wording is the same claim. A wording note that never says what
 * the source says returns empty, and the caller quotes the passage instead.
 */
export function withoutEquivalence(noteText, noteBucket) {
  const wording = String(noteBucket || "").trim().toLowerCase() === "wording";
  const kept = [];
  for (const sentence of sentencesOf(noteText)) {
    const clause = wording ? sourceClause(sentence) : sentence;
    if (!clause || isEquivalenceSentence(clause)) continue;
    if (wording && !/\bsource\b/i.test(clause)) continue;
    kept.push(clause);
  }
  return kept.join(" ");
}

export function equivalencePatternRecords() {
  return EQUIVALENCE.map((pattern) => ({ source: pattern.source, flags: pattern.flags }));
}

export function realDifferenceRecord() {
  return { source: REAL_DIFFERENCE.source, flags: REAL_DIFFERENCE.flags };
}

export function statementTurnRecord() {
  return { source: STATEMENT_TURN.source, flags: STATEMENT_TURN.flags };
}

/** Line breaks and runs of whitespace become one space. Nothing else changes. */
export function collapseWhitespace(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function figuresOf(text) {
  const flat = String(text || "").replace(/(\d),(?=\d)/g, "$1");
  const found = new Set();
  for (const match of flat.matchAll(/(\d+(?:\.\d+)?)(?:\s*(%|percent\b))?/gi)) {
    const num = match[1];
    const pct = match[2];
    if (!pct && !num.includes(".") && num.length < 2) continue;
    found.add(pct ? `${num}%` : num);
  }
  return found;
}

const WORD_STOP = new Set([
  "about", "after", "their", "there", "these", "those", "which", "would", "could",
  "other", "under", "where", "across", "being", "still", "every",
]);

function wordsOf(text) {
  const found = new Set();
  for (const word of String(text || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)) {
    if (word.length < 5 || WORD_STOP.has(word)) continue;
    found.add(word);
  }
  return found;
}

/**
 * The one sentence of the passage that carries what the statement turns on.
 * Null when no sentence does. The caller then quotes the whole passage.
 * The sentence is a span of the whitespace-collapsed passage.
 */
export function bearingSentence(passage, statement) {
  const flat = collapseWhitespace(passage);
  if (!flat) return null;
  const sentences = sentencesOf(flat);
  if (sentences.length <= 1) return flat;
  const wantFigs = figuresOf(statement);
  const wantWords = wordsOf(statement);
  let best = null;
  let bestScore = 0;
  for (const sentence of sentences) {
    const figs = figuresOf(sentence);
    let figHits = 0;
    for (const fig of wantFigs) if (figs.has(fig)) figHits += 1;
    if (wantFigs.size > 0 && figHits === 0) continue;
    const words = wordsOf(sentence);
    let wordHits = 0;
    for (const word of wantWords) if (words.has(word)) wordHits += 1;
    const score = figHits * 10 + wordHits;
    if (score > bestScore) {
      bestScore = score;
      best = sentence;
    }
  }
  if (!best || !flat.includes(best)) return null;
  return best;
}

function quoteLine(name, body) {
  const who = name ? `${name} states` : "The source states";
  const ended = /[.!?]["']?$/.test(body);
  return ended ? `${who} "${body}"` : `${who} "${body}".`;
}

export function evidenceLine({ fileName, quote, noteText, noteBucket, statement } = {}) {
  const note = typeof noteText === "string" ? noteText.trim() : "";
  const kept = note && !INTERNAL_REJECTION.test(note) ? withoutEquivalence(note, noteBucket) : "";
  if (kept) return kept;
  const passage = collapseWhitespace(quote);
  if (!passage) {
    console.warn("[evidence-line] passage is missing");
    return "";
  }
  const chosen = typeof statement === "string" && statement.trim()
    ? bearingSentence(passage, statement)
    : null;
  const shown = chosen || passage;
  const name = typeof fileName === "string" ? fileName.trim().replace(/\.(pdf|txt|docx)$/i, "") : "";
  if (!name) {
    console.warn("[evidence-line] source filename is missing");
  }
  return quoteLine(name, shown);
}
