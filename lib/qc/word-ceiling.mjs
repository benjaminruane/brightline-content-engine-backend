/**
 * B540. The length instruction is a ceiling. A draft past it is shortened
 * by dropping the last paragraph, then the last sentence, until it fits.
 * The first sentence is kept. A missing ceiling is refused.
 */
import { countWords } from "./token-estimate.mjs";

function requireCeiling(ceiling) {
  const cap = Number(ceiling);
  if (!Number.isInteger(cap) || cap < 1) {
    throw new Error("fitToWordCeiling: ceiling is missing");
  }
  return cap;
}

export function fitToWordCeiling(text, ceiling) {
  if (typeof text !== "string") throw new Error("fitToWordCeiling: draft is missing");
  const cap = requireCeiling(ceiling);
  let paras = text.trim().split(/\n\s*\n/).filter((part) => part.trim());
  if (!paras.length) return "";
  const joined = () => paras.join("\n\n");
  while (paras.length > 1 && countWords(joined()) > cap) paras.pop();
  if (countWords(joined()) > cap) {
    const sentences = paras[0].match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) || [paras[0]];
    const kept = sentences.map((part) => part.trim()).filter(Boolean);
    while (kept.length > 1 && countWords(kept.join(" ")) > cap) kept.pop();
    paras = [kept.join(" ")];
  }
  return paras.join("\n\n").trim();
}
