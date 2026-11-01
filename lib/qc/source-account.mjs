/**
 * B456 frames, kept so a stored card can still be recognised.
 * B457 retired the span call. The prompt file is gone.
 * B460 removed the writer. The live path does not import this module.
 * assertsAgreement, sentenceIsTemplate, and productSentences stay, because
 * the diagnostic score and the B459 read still use them on a stored card.
 * The live quote check is lib/qc/evidence-line.mjs.
 */
export const UNCOVERED_LINE = "The sources do not address this sentence.";

const TEMPLATES = [
  /^The sentence says "[^"]+"\. The passage does not\.$/,
  /^The sentence says "[^"]+"\. The passage says "[^"]+"\.$/,
  /^The statement attributes this to .+; the source credits .+\.$/,
  /^The statement uses "[^"]+" but the matched source does not\.$/,
  /^The sources do not address this sentence\.$/,
  /^The source names a valuation uplift in .+, not gains across essentially all of its investments\.$/,
  /^The displayed figures do not support the claimed scale\.$/,
];

const AGREEMENT_RELATION = [
  /\b(?:source|passage|it|this)\b[^.?!]{0,80}\b(?:confirms|supports|verifies|matches|aligns|agrees|backs|corroborates)\b/i,
  /\b(?:matches|aligns with|is consistent with|agrees with)\b[^.?!]{0,40}\b(?:statement|sentence|draft|claim)\b/i,
  /\b(?:statement|sentence|draft|claim)\b[^.?!]{0,50}\b(?:is confirmed|is supported|is verified|is correct|matches the source)\b/i,
];

export function sentenceSaysPassageDoesNot(span) {
  return `The sentence says "${span}". The passage does not.`;
}

export function sentenceSaysPassageSays(sentenceSpan, passageSpan) {
  return `The sentence says "${sentenceSpan}". The passage says "${passageSpan}".`;
}

function spanIn(host, span) {
  const needle = typeof span === "string" ? span : "";
  if (needle.length < 2 || needle.includes('"')) return false;
  return String(host || "").includes(needle);
}

export function sentenceIsTemplate(sentence) {
  const text = String(sentence || "").trim();
  return TEMPLATES.some((pattern) => pattern.test(text));
}

export function productSentences(difference) {
  const body = typeof difference === "string" ? difference.trim() : "";
  if (!body) return [];
  return body.split(/(?<=\.)\s+/).map((part) => part.trim()).filter(Boolean);
}

export function stripQuoted(text) {
  return String(text || "").replace(/"[^"]*"/g, " ").replace(/'[^']*'/g, " ");
}

/**
 * Meaning, not the endorsement list. Quoted copies are removed first.
 * What remains asserts agreement when it says the source and the sentence
 * fit each other.
 */
export function agreementPatternRecords() {
  return AGREEMENT_RELATION.map((pattern) => ({ source: pattern.source, flags: pattern.flags }));
}

export function assertsAgreement(text) {
  const bare = stripQuoted(text);
  return AGREEMENT_RELATION.some((pattern) => pattern.test(bare));
}

export function renderDifference(kind, parsed, statement, passage) {
  if (kind === "conflict") {
    const sentence = typeof parsed?.sentence === "string" ? parsed.sentence : "";
    const fromPassage = typeof parsed?.passage === "string" ? parsed.passage : "";
    if (!spanIn(statement, sentence) || !spanIn(passage, fromPassage)) return { ok: false, text: "" };
    return { ok: true, text: sentenceSaysPassageSays(sentence, fromPassage) };
  }
  const list = Array.isArray(parsed?.claims) ? parsed.claims : [];
  const sentences = [];
  for (const claim of list) {
    if (!spanIn(statement, claim)) continue;
    if (spanIn(passage, claim)) continue;
    sentences.push(sentenceSaysPassageDoesNot(claim));
    if (sentences.length === 2) break;
  }
  if (!sentences.length) return { ok: false, text: "" };
  return { ok: true, text: sentences.join(" ") };
}

