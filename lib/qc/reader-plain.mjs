/**
 * B486. The words a reader is allowed to see.
 * An em dash or an en dash becomes a spaced hyphen.
 * A sentence that is only an internal category name is dropped.
 * The ladder words stay in the prompt. They do not stay in the sentence.
 */

function sentencesOf(text) {
  const parts = [];
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (!/[.!?]/.test(text[i])) continue;
    let j = i + 1;
    while (j < text.length && /\s/.test(text[j])) j += 1;
    if (j > i + 1 && /[A-Z]/.test(text[j] || "")) {
      parts.push(text.slice(start, i + 1).trim());
      start = j;
      i = j - 1;
    }
  }
  const tail = text.slice(start).trim();
  if (tail) parts.push(tail);
  return parts;
}

export function plainReaderText(text) {
  if (typeof text !== "string") return "";
  const kept = sentencesOf(text).filter((part) => !/^this is a (?:status\/)?modality conflict\.?$/i.test(part));
  let out = kept.join(" ");
  out = out.replace(/[\u2014\u2013]/g, " - ");
  out = out.replace(/\ba higher rung than\b/gi, "further than");
  out = out.replace(/\bon a higher rung\b/gi, "further");
  out = out.replace(/\brungs?\b/gi, "");
  out = out.replace(/\bmodality\b/gi, "");
  out = out.replace(/[ \t]{2,}/g, " ");
  out = out.replace(/\s+([.,;:])/g, "$1");
  return out.trim();
}
