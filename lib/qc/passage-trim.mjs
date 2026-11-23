/**
 * The passage on a card is the sentence that carries the matched fact.
 * At most three sentences, or about 400 characters. One extra location.
 * Furniture and a repeated "Also in the source" line are not evidence.
 */
import { sentenceList } from "../text/sentences.mjs";
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

function carrying(unitsList, keys) {
  if (!keys.length) return unitsList;
  return unitsList.filter((unit) => keys.some((key) => unit.toLowerCase().includes(key.toLowerCase())));
}

/**
 * @returns {{ passage: string, also: string }}
 */
export function passageForCard(card, sourceText = "") {
  const keys = furnitureKeys(sourceText);
  const tokens = keyTokens(card, sourceText);
  const wanted = disputedSourceValues(card?.readingNote?.text).filter((token) => String(sourceText).includes(token));
  const excerpt = withoutFurniture(stripAlsoInSource(card?.primaryExcerpt || card?.primaryExcerptText || ""), keys);
  const excerptUnits = units(excerpt);
  let chosen = carrying(excerptUnits, wanted.length ? wanted : tokens);
  if (wanted.length && !chosen.length) chosen = [];
  if (!chosen.length && excerpt && !tokens.length) chosen = excerptUnits;
  if (!chosen.length) {
    const sourceUnits = units(withoutFurniture(sourceText, keys));
    chosen = carrying(sourceUnits, wanted.length ? wanted : tokens).slice(0, 1);
  }
  const focus = wanted.length ? wanted : tokens;
  const passage = cap(chosen, focus);
  let also = "";
  const conflict = card?.conflictExcerpt;
  const second = stripAlsoInSource(typeof conflict === "string" ? conflict : conflict?.passage || "");
  if (second && clean(second) !== clean(passage)) {
    const secondUnits = carrying(units(withoutFurniture(second, keys)), tokens);
    also = cap(secondUnits.length ? secondUnits : [], focus);
    if (also && clean(also) === clean(passage)) also = "";
  }
  return { passage, also };
}
