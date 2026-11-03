/**
 * B465. A partial reason is two spans the card already holds.
 * The first is the compliant account. The second is the explanation
 * with the clause that grades the statement removed.
 * B466. The two spans are joined only for a reason that is missing.
 * The difference becomes its own sentence: the leading connective is
 * dropped, the first word is capitalised, and the sentence ends with
 * one stop. The words are not otherwise changed. A clause that cannot
 * be made into a sentence is not returned.
 */
import { endorsementHit } from "./endorsement-phrases.mjs";
import { maskVerbatimQuotes, quotedSpans, sourceCorpus } from "./quoted-span.mjs";

const UNRECORDED = "Part of this statement is in the source. Which part was not recorded.";

const GRADE = /\b(?:confirms|supports|confirmed|supported|aligns|aligning|matches the statement|partially confirmed|partial confirmation|partially supports)\b/i;
const DIFFERENCE = /\b(?:does not|do not|the statement|whereas)\b/i;
const TRAILING_CLASS =
  /(?:,)?\s+(?:making|which makes|so)\s+(?:the statement\s+(?:is\s+)?(?:only\s+)?partially confirmed|the support partial)\.?\s*$/i;

const PIVOTS = [
  { source: "\\s+but\\s+(?=(?:it|the source|this)\\s+does not\\b|does not\\b)", flags: "i", keep: true },
  { source: "\\.\\s+(?=However,\\s)", flags: "", keep: false },
  { source: "\\.\\s+(?=The statement\\b)", flags: "", keep: false },
];

function flat(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function partialExplanations(card) {
  const out = [];
  for (const row of Array.isArray(card?.matchExplanations) ? card.matchExplanations : []) {
    const cls = String(row?.classification || "").toLowerCase();
    if (cls !== "partially_confirmed") continue;
    const written = String(row?.writtenFor || "").toLowerCase();
    if (written && written !== "partially_confirmed") continue;
    const text = flat(row?.explanation);
    if (text && !out.includes(text)) out.push(text);
  }
  return out;
}

function earliestPivot(text) {
  let best = null;
  for (const pivot of PIVOTS) {
    const match = new RegExp(pivot.source, pivot.flags).exec(text);
    if (!match) continue;
    if (best && match.index >= best.index) continue;
    const prefix = text.slice(0, match.index).trim();
    if (!GRADE.test(prefix)) continue;
    best = { index: match.index, length: match[0].length, keep: pivot.keep };
  }
  return best;
}

function finishClause(text) {
  let body = flat(text).replace(TRAILING_CLASS, "").replace(/[,;:\s]+$/, "").trim();
  if (!body) return "";
  if (!/[.!?]$/.test(body)) body += ".";
  return body;
}

const LEADING_CONNECTIVE = /^(?:but|however|and|yet|whereas|so)\b[,:]?\s+/i;
const BARE_VERB = /^(Does not|Do not|Is not|Are not|Was not|Were not)\b/;

function subjectWrittenBefore(prefix) {
  const match = flat(prefix).match(/^(The source|The passage|It|This)\b/);
  return match ? match[1] : "";
}

/**
 * The difference, as a sentence. The leading connective is dropped,
 * the first word is capitalised, and the sentence ends with one stop.
 * A bare verb takes the subject the model already wrote before the join.
 * Empty when that cannot be done without adding a new word.
 */
export function asOwnSentence(clause, subject = "") {
  const body = flat(clause);
  if (!body) return "";
  const stripped = body.replace(LEADING_CONNECTIVE, "");
  if (!stripped || LEADING_CONNECTIVE.test(stripped)) return "";
  let sentence = /[a-z]/.test(stripped[0]) ? `${stripped[0].toUpperCase()}${stripped.slice(1)}` : stripped;
  if (BARE_VERB.test(sentence) && subject) {
    sentence = `${subject} ${sentence[0].toLowerCase()}${sentence.slice(1)}`;
  }
  if (/[.!?]$/.test(sentence) || /[.!?]["']$/.test(sentence)) return sentence;
  return `${sentence}.`;
}

function inQuote(text, index) {
  let quote = "";
  for (let i = 0; i < index; i += 1) {
    const ch = text[i];
    if (!quote && (ch === "\"" || (ch === "'" && (i === 0 || /[\s([\]]/.test(text[i - 1]))))) {
      quote = ch;
    } else if (quote && ch === quote) quote = "";
  }
  return Boolean(quote);
}

/**
 * How many sentences. A stop inside a quotation counts only when the
 * quotation closes on that stop, which is the end of the sentence.
 */
export function sentenceCount(text) {
  const body = flat(text);
  if (!body) return 0;
  let count = 0;
  let consumed = 0;
  for (let i = 0; i < body.length; i += 1) {
    if (!/[.!?]/.test(body[i])) continue;
    let restAt = i + 1;
    if (inQuote(body, i)) {
      const close = body[i + 1];
      if (close !== "\"" && close !== "'") continue;
      restAt = i + 2;
    }
    const rest = body.slice(restAt);
    const gap = /^\s+/.exec(rest);
    const after = rest[gap ? gap[0].length : 0];
    if (after === undefined || /[A-Z"']/.test(after)) {
      count += 1;
      consumed = restAt;
    }
  }
  if (body.slice(consumed).trim()) count += 1;
  return count;
}

function repeatedPhrases(text) {
  const inners = quotedSpans(text)
    .map((span) => span.inner.replace(/^[\s,.;:]+|[\s,.;:]+$/g, "").toLowerCase())
    .filter((inner) => /\s/.test(inner));
  return inners.filter((inner, index) => inners.indexOf(inner) !== index);
}

function repeatedNegations(text) {
  const parts = [...flat(text).matchAll(/\b(?:does not|do not|is not|are not|was not|were not)\b(?:\s+\w+){1,6}/gi)]
    .map((match) => match[0].toLowerCase());
  return parts.filter((part, index) => parts.indexOf(part) !== index);
}

/**
 * Why a reader-facing reason does not read, or "".
 * A repeated phrase is a quoted span of more than one word.
 * A single quoted word used twice is the word under discussion.
 */
export function reasonFault(text) {
  const body = flat(text);
  if (!body) return "";
  if (/(?:^|[.!?])["']?\s+(?:but|and|or|so|yet|because|while|whereas|however)\b/.test(body)) {
    return "a sentence boundary is followed by a lowercase connective";
  }
  if (/(?:^|[.!?]\s+)(?:Does not|Do not|Is not|Are not|Was not|Were not)\b/.test(body)) {
    return "a sentence begins with a bare verb";
  }
  if (/,["']\./.test(body)) return "a comma sits inside a closing quotation mark";
  if (repeatedPhrases(body).length) return "a quoted phrase is repeated";
  if (repeatedNegations(body).length) return "a negation is repeated";
  if (sentenceCount(body) > 3) return "the reason is more than three sentences";
  if (/^(?:However|But|Although)\b/.test(body)) return "a reason opens with a connective";
  if (namesDifference(body) && !namesWhatTheSourceSays(body)) {
    return "the difference is named and what the source says is not";
  }
  return "";
}

function namesDifference(text) {
  return /\b(?:broader|does not state|does not say|does not specify|does not explicitly state|not present in the source)\b/i.test(text);
}

function namesWhatTheSourceSays(text) {
  if (/\bstates "/.test(text)) return true;
  if (/\bthe source\s+(?:states|describes|gives|says|names|reports|shows|records|discusses|attributes)\b/i.test(text)) return true;
  if (/\bthe passage\s+(?:states|describes|says|shows|records)\b/i.test(text)) return true;
  if (/\bthe source\s+(?:has|is)\s+(?!not\b)/i.test(text)) return true;
  if (/\bthe source does not (?:discuss|mention|give|name|include|contain|refer)\b/i.test(text)) return true;
  return false;
}

/**
 * The difference clause, or why it was not taken.
 * @returns {{ text: string, blocked: string, split: boolean }}
 */
export function differenceClause(explanation, corpus) {
  const text = flat(explanation);
  const pivot = earliestPivot(text);
  if (!pivot) return { text: "", blocked: "", split: false };
  const raw = pivot.keep ? text.slice(pivot.index) : text.slice(pivot.index + pivot.length);
  const clause = finishClause(raw);
  if (!clause || (!DIFFERENCE.test(clause) && !/^(?:but|However|The statement)\b/.test(clause))) {
    return { text: "", blocked: "", split: false };
  }
  const sentence = asOwnSentence(clause, subjectWrittenBefore(text.slice(0, pivot.index)));
  if (!sentence) return { text: "", blocked: "", split: true, shape: "not a sentence" };
  const phrase = endorsementHit(maskVerbatimQuotes(sentence, corpus));
  if (phrase) return { text: "", blocked: phrase, split: true };
  return { text: sentence, blocked: "", split: true };
}

export function compliantAccount(card, explanations) {
  const corpus = sourceCorpus(card);
  const blocked = new Set((explanations || []).map(flat));
  for (const field of ["evidenceLine", "evidenceSummary", "reasoningParagraph"]) {
    const text = flat(card?.[field]);
    if (!text || text === UNRECORDED || blocked.has(text)) continue;
    if (endorsementHit(maskVerbatimQuotes(text, corpus))) continue;
    return text;
  }
  return "";
}

/**
 * The two-part reason, or "" when the cut is not clean.
 * Nothing in the returned string is written by this file except the
 * space between the two spans and a full stop the partial editor already adds.
 */
export function partialReason(card) {
  return partialReasonDetail(card).reason;
}

export function partialReasonDetail(card) {
  const empty = { reason: "", account: "", differences: [], why: "" };
  if (!card || card.sourceAccount === true) return { ...empty, why: "not this path" };
  const explanations = partialExplanations(card);
  if (!explanations.length) return { ...empty, why: "no partial explanation" };
  const account = compliantAccount(card, explanations);
  if (!account) return { ...empty, why: "no compliant account" };
  const corpus = sourceCorpus(card);
  const differences = [];
  for (const explanation of explanations) {
    const cut = differenceClause(explanation, corpus);
    if (!cut.split) return { reason: "", account, differences, why: "the explanation did not split" };
    if (cut.shape) return { reason: "", account, differences, why: "the difference could not be made into a sentence" };
    if (cut.blocked) {
      return { reason: "", account, differences, why: `the difference still contains "${cut.blocked}"` };
    }
    if (!differences.includes(cut.text)) differences.push(cut.text);
  }
  const reason = flat(`${account} ${differences.join(" ")}`);
  const fault = reasonFault(reason);
  if (fault) return { reason: "", account, differences, why: fault };
  const phrase = endorsementHit(maskVerbatimQuotes(reason, corpus));
  if (phrase) return { reason: "", account, differences, why: `the joined reason still contains "${phrase}"` };
  return { reason, account, differences, why: "" };
}
