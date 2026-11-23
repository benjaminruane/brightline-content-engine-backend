/**
 * B540. The length line is the length fact. A reviewer's note that
 * also judges length is shortened to the sentences that do not.
 */

import { sentenceList } from "../text/sentences.mjs";

const LENGTH_SENTENCE =
  /\b(?:length|word count|word limit|word range|words)\b|\bwithin range\b|\b(?:above|over|under|below) (?:the |your )?(?:\d[\d,]*-word )?(?:range|limit|allowance|floor)\b|\b\d[\d,]*-word floor\b/i;

export function stripLengthClaims(note) {
  if (typeof note !== "string") throw new Error("stripLengthClaims: note is missing");
  const paragraphs = note.split(/\n\s*\n/).map((paragraph) => (
    sentenceList(paragraph).filter((sentence) => !LENGTH_SENTENCE.test(sentence)).join(" ")
  )).filter(Boolean);
  return paragraphs.join("\n\n").trim();
}
