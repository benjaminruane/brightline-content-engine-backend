/**
 * B465. A partial reason is two spans the card already holds.
 * The first is the compliant account. The second is the explanation
 * with the clause that grades the statement removed.
 * A split that is not a clean cut is not returned. The caller keeps
 * the sentence it already had.
 */
import { endorsementHit } from "./endorsement-phrases.mjs";
import { maskVerbatimQuotes, sourceCorpus } from "./quoted-span.mjs";

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
  const phrase = endorsementHit(maskVerbatimQuotes(clause, corpus));
  if (phrase) return { text: "", blocked: phrase, split: true };
  return { text: clause, blocked: "", split: true };
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
    if (cut.blocked) {
      return { reason: "", account, differences, why: `the difference still contains "${cut.blocked}"` };
    }
    if (!differences.includes(cut.text)) differences.push(cut.text);
  }
  const reason = flat(`${account} ${differences.join(" ")}`);
  const phrase = endorsementHit(maskVerbatimQuotes(reason, corpus));
  if (phrase) return { reason: "", account, differences, why: `the joined reason still contains "${phrase}"` };
  return { reason, account, differences, why: "" };
}
