/**
 * B606 C4. Drop heading-only and unrelated source lines from card passages.
 * Always keep at least the best remaining passage.
 */
import { normalizeToken, stemToken, tokenizeForOverlap } from "./reason-evidence-check.mjs";

function clean(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

// Avoid bare "report" / "note" / "state" stems: they appear in headings.
const SENTENCE_VERB =
  /\b(?:is|are|was|were|been|being|has|have|had|does|did|will|would|could|might|shall|should|must|reports|reported|shows|showed|includes|included|completed|agreed|sold|grew|reached|expects|expected|announced|confirmed|states|stated|provides|provided|remains|remained)\b/i;

const TITLE_LINE =
  /^(?:date:|as at|for immediate release|confidential|quarterly report|fact sheet|key figures|table of|contents\b|document:)/i;

/**
 * Mostly capitals, no sentence verb → heading furniture.
 * A title-shaped line that still carries a figure is kept (NAV Per Share 862.5p).
 */
export function isHeadingOnlyLine(text) {
  const body = clean(text);
  if (!body) return true;
  if (TITLE_LINE.test(body) && body.length < 180) return true;
  const letters = body.replace(/[^A-Za-z]/g, "");
  if (letters.length < 8) return false;
  const caps = body.replace(/[^A-Z]/g, "");
  if (caps.length / letters.length < 0.72) return false;
  // A mostly-caps line that still carries a money/percent figure is a data row.
  if (/\d[\d,]*(?:\.\d+)?(?:%|p)\b|(?:EUR|USD|GBP|\$|€|£)\s*\d/i.test(body)) return false;
  return !SENTENCE_VERB.test(body);
}

function contentWords(text) {
  return tokenizeForOverlap(text)
    .map((token) => stemToken(normalizeToken(token)))
    .filter((token) => token && token.length >= 3 && !/^\d+$/.test(token));
}

function factSurfaces(text) {
  const body = clean(text);
  const out = [];
  for (const match of body.matchAll(/\d[\d,]*(?:\.\d+)?(?:%|p|x)?/gi)) {
    out.push(match[0].replace(/,/g, "").toLowerCase());
  }
  for (const match of body.matchAll(/\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+\d{4}\b/gi)) {
    out.push(match[0].toLowerCase());
  }
  for (const match of body.matchAll(/\b\d{1,2}\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}\b/gi)) {
    out.push(match[0].toLowerCase());
  }
  return out;
}

export function passageSharesWithStatement(passage, statement) {
  const line = clean(passage);
  const claim = clean(statement);
  if (!line || !claim) return false;
  const stmtFacts = factSurfaces(claim);
  const lineFacts = new Set(factSurfaces(line));
  if (stmtFacts.some((fact) => lineFacts.has(fact))) return true;
  const stmtWords = contentWords(claim);
  const lineWords = new Set(contentWords(line));
  const shared = stmtWords.filter((word) => lineWords.has(word));
  return shared.length >= 3;
}

function overlapScore(passage, statement) {
  const stmtWords = contentWords(statement);
  const lineWords = new Set(contentWords(passage));
  let score = stmtWords.filter((word) => lineWords.has(word)).length;
  const stmtFacts = factSurfaces(statement);
  const lineFacts = new Set(factSurfaces(passage));
  score += stmtFacts.filter((fact) => lineFacts.has(fact)).length * 3;
  return score;
}

function pieceText(piece) {
  if (typeof piece === "string") return piece;
  return typeof piece?.text === "string" ? piece.text : "";
}

/**
 * @param {Array<string|{text?: string}>} pieces
 * @param {string} statement
 * @returns {typeof pieces}
 */
export function filterRelevantPassages(pieces, statement) {
  const list = Array.isArray(pieces) ? pieces : [];
  const claim = clean(statement);
  if (!list.length || !claim) return [];
  const scored = list.map((piece, index) => {
    const text = pieceText(piece);
    return {
      piece,
      index,
      text,
      heading: isHeadingOnlyLine(text),
      relevant: passageSharesWithStatement(text, claim),
      score: overlapScore(text, claim),
    };
  });
  // B617 / B606: keep only passages that share facts or content words.
  // Never fall back to a heading or unrelated first line.
  const kept = scored.filter((row) => !row.heading && row.relevant);
  kept.sort((a, b) => a.index - b.index);
  return kept.map((row) => row.piece);
}
