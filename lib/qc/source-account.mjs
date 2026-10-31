/**
 * B456 frames, kept so a stored card can still be recognised.
 * B457 retired the span call. The evidence line is lib/qc/evidence-line.mjs.
 * This module does not call a model.
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

export function quoteIsVerbatim(quote, sources) {
  const text = typeof quote === "string" ? quote : "";
  if (!text) return false;
  const list = Array.isArray(sources) ? sources : [];
  return list.some((source) => typeof source?.text === "string" && source.text.includes(text));
}

export function spanIn(host, span) {
  const needle = typeof span === "string" ? span : "";
  if (needle.length < 2 || needle.includes('"')) return false;
  return String(host || "").includes(needle);
}

export function accountKind({ displayVerdict, supportState } = {}) {
  const verdict = String(displayVerdict || "").toLowerCase();
  const support = String(supportState || "").toLowerCase();
  if (verdict === "not reviewed" || verdict === "unverifiable" || support === "skipped" || support === "not_reviewed") {
    return "unchecked";
  }
  if (verdict === "conflict" || verdict === "conflicting" || support === "conflicting") return "conflict";
  if (verdict === "supported_partial" || verdict === "partially_confirmed" || support === "partial") return "partial";
  if (verdict === "supported_full" || verdict === "confirmed" || support === "supported") return "full";
  if (verdict === "not_supported" || verdict === "no_support" || support === "not_supported" || support === "no_support") {
    return "uncovered";
  }
  return "unchecked";
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

function codeWrittenDifference(evidenceSummary) {
  const first = String(evidenceSummary || "").split(/(?<=\.)\s+/)[0]?.trim() || "";
  return sentenceIsTemplate(first) ? first : "";
}

/**
 * @returns {Promise<{ sourceAccount: boolean, sourceQuote?: string, sourceDifference?: string, readerProse?: string, missingDifference?: boolean, quoteRejected?: boolean }>}
 */
export async function buildSourceAccount({
  statement,
  passage,
  sources,
  displayVerdict,
  supportState,
  evidenceSummary,
  framingNote,
  commentaryNotReviewed,
  traceId,
  statementIndex,
} = {}) {
  if (commentaryNotReviewed === true) return { sourceAccount: false };
  const kind = accountKind({ displayVerdict, supportState });
  if (kind === "unchecked") return { sourceAccount: false };

  const sourceList = Array.isArray(sources) ? sources : [];
  const haveSources = sourceList.some((source) => typeof source?.text === "string" && source.text.length > 0);
  if (!haveSources) {
    console.warn(`[source-account] sources missing statementIndex=${statementIndex}`);
    return { sourceAccount: false };
  }

  const rawQuote = typeof passage === "string" ? passage : "";
  const quoteOk = rawQuote.trim() && quoteIsVerbatim(rawQuote, sourceList);
  if (rawQuote.trim() && !quoteOk) {
    console.warn(`[source-account] quote is not in the cited source statementIndex=${statementIndex}`);
  }
  const sourceQuote = quoteOk ? rawQuote : "";

  if (kind === "full") {
    return { sourceAccount: true, sourceQuote, sourceDifference: "", readerProse: "", quoteRejected: Boolean(rawQuote.trim()) && !quoteOk };
  }
  if (kind === "uncovered") {
    return {
      sourceAccount: true,
      sourceQuote: "",
      sourceDifference: UNCOVERED_LINE,
      readerProse: UNCOVERED_LINE,
    };
  }

  const writtenByCode = codeWrittenDifference(evidenceSummary);
  if (writtenByCode) {
    return { sourceAccount: true, sourceQuote, sourceDifference: writtenByCode, readerProse: writtenByCode };
  }

  const framing = typeof framingNote === "string" ? framingNote.trim() : "";
  if (sentenceIsTemplate(framing) && framing !== UNCOVERED_LINE) {
    return { sourceAccount: true, sourceQuote, sourceDifference: framing, readerProse: framing };
  }

  console.warn(`[source-account] no code sentence for the difference statementIndex=${statementIndex}`);
  return {
    sourceAccount: true,
    sourceQuote,
    sourceDifference: "",
    readerProse: "",
    missingDifference: true,
    quoteRejected: Boolean(rawQuote.trim()) && !quoteOk,
  };
}
