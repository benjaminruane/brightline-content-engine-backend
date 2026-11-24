/**
 * The passage on a card is the sentence the reason relies on.
 * Windowing around a figure applies only when the reason is about that figure.
 * At most three sentences, or about 400 characters. One extra location.
 * Furniture and a repeated "Also in the source" line are not evidence.
 */
import { sentenceList } from "../text/sentences.mjs";
import { alsoRelevant, factPassage } from "./fact-passages.mjs";
import { isBareUrl, isPageCounter, pageFurnitureIndexes } from "../extract/page-furniture.mjs";

const MAX_SENTENCES = 3;
const MAX_CHARS = 400;

function clean(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

export function stripAlsoInSource(text) {
  const parts = String(text || "").split(/\bAlso in the source \(line [^)]+\):\s*/i);
  return parts[0].replace(/\s+/g, " ").trim();
}

function furnitureKeys(sourceText) {
  const lines = String(sourceText || "").split("\n");
  const indexes = new Set(pageFurnitureIndexes(sourceText));
  const keys = new Set();
  lines.forEach((line, index) => {
    if (indexes.has(index)) keys.add(line.trim());
  });
  return keys;
}

function withoutFurniture(text, keys) {
  const lines = String(text || "").split("\n").filter((line) => {
    const key = line.trim();
    if (!key) return false;
    if (isBareUrl(key) || isPageCounter(key)) return false;
    if (keys.has(key)) return false;
    return true;
  });
  return lines.join(" ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\b\d{1,4}\s*\/\s*\d{1,4}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function aroundKey(text, keys) {
  const flat = clean(text);
  if (flat.length <= MAX_CHARS) return flat;
  const key = keys.find((item) => flat.toLowerCase().includes(String(item).toLowerCase()));
  if (!key) return flat.slice(0, MAX_CHARS).trim();
  const at = flat.toLowerCase().indexOf(String(key).toLowerCase());
  const start = Math.max(0, at - 60);
  return flat.slice(start, start + MAX_CHARS).trim();
}

function cap(sentences, keys = []) {
  const kept = [];
  let chars = 0;
  for (const sentence of sentences) {
    if (kept.length >= MAX_SENTENCES) break;
    if (sentence.length > MAX_CHARS && kept.length === 0) {
      kept.push(aroundKey(sentence, keys));
      break;
    }
    if (chars > 0 && chars + sentence.length > MAX_CHARS) break;
    kept.push(sentence);
    chars += sentence.length;
  }
  return kept.join(" ");
}

function disputedSourceValues(note) {
  const found = [];
  const pattern = /(\d[\d,]*(?:\.\d+)?\s*(?:%|p\b|pence|million|billion))\s*,?\s*not\b/gi;
  for (const match of String(note || "").matchAll(pattern)) found.push(match[1]);
  return found;
}

function keyTokens(card, sourceText) {
  const note = clean(card?.readingNote?.text);
  const source = String(sourceText || "");
  const found = [];
  const pattern = /\d[\d,]*(?:\.\d+)?\s*(?:%|p\b|pence|x\b|million|billion)|10 new investments|\bsix months to\b/gi;
  for (const match of note.matchAll(pattern)) {
    const token = match[0];
    if (source.toLowerCase().includes(token.toLowerCase())) found.push(token);
  }
  const facts = Array.isArray(card?.readingFacts) ? card.readingFacts : [];
  for (const fact of facts) {
    const surface = clean(fact?.surface);
    if (!surface || surface.length < 3) continue;
    if (fact.status !== "matched" && fact.status !== "matched_disputed") continue;
    if (source.includes(surface)) found.push(surface);
  }
  return [...new Set(found)];
}

function units(text) {
  const sentences = sentenceList(text);
  if (sentences.length) return sentences;
  return String(text || "").split("\n").map((line) => line.trim()).filter(Boolean);
}

function reasonText(card) {
  return clean(card?.readingNote?.text) || clean(card?.evidenceLine) || clean(card?.displayedEvidenceProse);
}

function reasonIsAboutFigure(note) {
  if (disputedSourceValues(note).length) return true;
  return /\d[\d,]*(?:\.\d+)?\s*(?:%|p\b|pence|x\b|million|billion)|\b10 new investments\b|\bsix months to\b/i.test(note);
}

const REASON_STOP = new Set([
  "source", "says", "said", "statement", "draft", "this", "that", "with", "from", "about",
  "their", "there", "where", "which", "while", "have", "has", "been", "were", "into",
  "over", "under", "than", "then", "also", "after", "before", "does", "not",
]);

function reasonWords(text) {
  const words = String(text || "").toLowerCase().match(/[a-z][a-z'-]{3,}/g) || [];
  return [...new Set(words.filter((word) => !REASON_STOP.has(word)))];
}

function carryingReason(sentences, reason) {
  const words = reasonWords(reason);
  if (words.length < 2) return [];
  return sentences.filter((sentence) => {
    const lower = sentence.toLowerCase();
    let hits = 0;
    for (const word of words) {
      if (lower.includes(word)) hits += 1;
      if (hits >= 2) return true;
    }
    return false;
  });
}

function carrying(unitsList, keys) {
  if (!keys.length) return unitsList;
  return unitsList.filter((unit) => keys.some((key) => unit.toLowerCase().includes(key.toLowerCase())));
}

/**
 * @returns {{ passage: string, also: string }}
 */
export function passageForCard(card, sourceText = "") {
  const built = factPassage(card);
  if (built.passage) {
    const also = alsoRelevant(card, sourceText);
    return { passage: built.passage, also, alsoHeading: also ? "Also relevant" : "", lineIds: built.lineIds };
  }
  const keys = furnitureKeys(sourceText);
  const reason = reasonText(card);
  const aboutFigure = reasonIsAboutFigure(reason);
  const tokens = keyTokens(card, sourceText);
  const wanted = disputedSourceValues(card?.readingNote?.text).filter((token) => String(sourceText).includes(token));
  const excerpt = withoutFurniture(stripAlsoInSource(card?.primaryExcerpt || card?.primaryExcerptText || ""), keys);
  const excerptUnits = units(excerpt);
  let chosen;
  let focus;
  if (!aboutFigure && excerptUnits.length) {
    const overlap = carryingReason(excerptUnits, reason);
    chosen = overlap.length ? overlap : excerptUnits;
    focus = [];
  } else {
    chosen = carrying(excerptUnits, wanted.length ? wanted : tokens);
    if (wanted.length && !chosen.length) chosen = [];
    if (!chosen.length && excerpt && !tokens.length) chosen = excerptUnits;
    if (!chosen.length) {
      const sourceUnits = units(withoutFurniture(sourceText, keys));
      chosen = carrying(sourceUnits, wanted.length ? wanted : tokens).slice(0, 1);
    }
    focus = wanted.length ? wanted : tokens;
  }
  const passage = cap(chosen, focus);
  let also = "";
  const conflict = card?.conflictExcerpt;
  const second = stripAlsoInSource(typeof conflict === "string" ? conflict : conflict?.passage || "");
  if (second && clean(second) !== clean(passage)) {
    const secondUnits = carrying(units(withoutFurniture(second, keys)), tokens);
    also = cap(secondUnits.length ? secondUnits : [], focus);
    if (also && clean(also) === clean(passage)) also = "";
  }
  return { passage, also, lineIds: [] };
}
