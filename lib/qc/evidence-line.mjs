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

export function evidenceLine({ fileName, quote, noteText, noteBucket } = {}) {
  const note = typeof noteText === "string" ? noteText.trim() : "";
  const kept = note && !INTERNAL_REJECTION.test(note) ? withoutEquivalence(note, noteBucket) : "";
  if (kept) return kept;
  const passage = typeof quote === "string" ? quote.trim() : "";
  if (!passage) {
    console.warn("[evidence-line] passage is missing");
    return "";
  }
  const name = typeof fileName === "string" ? fileName.trim().replace(/\.(pdf|txt|docx)$/i, "") : "";
  if (!name) {
    console.warn("[evidence-line] source filename is missing");
    return `The source states "${passage}".`;
  }
  return `${name} states "${passage}".`;
}
