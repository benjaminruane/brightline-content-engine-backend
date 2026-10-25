/**
 * B421. A cited span is passive only when an auxiliary is followed
 * within three tokens by a past participle.
 */

const AUXILIARIES = new Set([
  "am",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "get",
  "gets",
  "got",
  "getting",
]);

const IRREGULARS = new Set([
  "given",
  "taken",
  "made",
  "held",
  "seen",
  "known",
  "shown",
  "sold",
  "built",
  "paid",
  "led",
  "drawn",
  "won",
  "kept",
  "left",
  "set",
  "put",
  "brought",
  "found",
  "told",
]);

function wordsOf(cited) {
  return String(cited ?? "").toLowerCase().match(/[a-z]+/g) || [];
}

function isParticiple(word) {
  if (IRREGULARS.has(word)) return true;
  return word.length > 3 && word.endsWith("ed");
}

export function spanIsPassive(cited) {
  const words = wordsOf(cited);
  for (let i = 0; i < words.length; i += 1) {
    if (!AUXILIARIES.has(words[i])) continue;
    const last = Math.min(words.length - 1, i + 3);
    for (let j = i + 1; j <= last; j += 1) {
      if (isParticiple(words[j])) return true;
    }
  }
  return false;
}
