/**
 * B473. A later transaction state is a disagreement.
 * Proposed binds nobody. Committed pledges the capital. Invested means the money has left.
 * The stored verdict is not rewritten. The source passage is the one the card already holds.
 */

import { sourceCorpus } from "./quoted-span.mjs";

const QUIET = new Set(["nothing_raised", "nothing_to_raise"]);

const READS = [
  { kind: "done", via: "invested", rank: 2, re: /\b(?:have|has)\s+invested\b/i },
  { kind: "done", via: "completion", rank: 2, re: /\b(?:confirm completion of the transaction|completion of (?:the transaction|its acquisition)|completed the (?:sale|acquisition|transaction))\b/i },
  { kind: "done", via: "closed", rank: 2, re: /\b(?:transaction closed|closed (?:its |the )?acquisition|which closed)\b/i },
  { kind: "done", via: "acquired", rank: 2, re: /\bacquired\b/i },
  { kind: "committed", via: "committed", rank: 1, re: /\b(?:have|has|having)\s+committed\b/i },
  { kind: "proposed", via: "approval", rank: 0, re: /\bseek(?:s|ing)?\s+(?:(?:partnership|IC)\s+)?approval\b/i },
  { kind: "proposed", via: "recommend", rank: 0, re: /\bwe recommend\b/i },
  { kind: "proposed", via: "would", rank: 0, re: /\bwould acquire\b/i },
];

function clean(text) {
  return typeof text === "string" ? text.trim() : "";
}

function readingState(card) {
  const fromVerdict = card?.statementVerdict?.state;
  if (typeof fromVerdict === "string" && fromVerdict) return fromVerdict;
  if (typeof card?.sentenceState === "string" && card.sentenceState) return card.sentenceState;
  return "";
}

function readState(text) {
  const body = clean(text);
  if (!body) return null;
  let best = null;
  for (const row of READS) {
    if (!row.re.test(body)) continue;
    if (!best || row.rank > best.rank) best = row;
  }
  return best;
}

function sourcePhrase(hit) {
  if (hit.via === "recommend") return "is still recommending the investment";
  if (hit.via === "would") return "is still proposing the acquisition";
  if (hit.kind === "proposed") return "is still seeking approval";
  if (hit.kind === "committed") return "describes the money as committed";
  if (hit.via === "completion") return "describes the transaction as complete";
  if (hit.via === "closed") return "describes the transaction as closed";
  if (hit.via === "acquired") return "describes the company as acquired";
  return "describes the money as invested";
}

function draftPhrase(hit) {
  if (hit.via === "recommend") return "says the firm is recommending the investment";
  if (hit.via === "would") return "says the firm would acquire the company";
  if (hit.kind === "proposed") return "says the firm is seeking approval";
  if (hit.kind === "committed") return "says the firm has committed";
  if (hit.via === "completion") return "says the transaction is complete";
  if (hit.via === "closed") return "says the transaction has closed";
  if (hit.via === "acquired") return "says the firm has acquired the company";
  return "says the firm has invested";
}

/**
 * The draft states a later transaction state than the source passage.
 * Null when the source states no transaction state, or the two states match.
 */
export function transactionShift(card) {
  if (!card || typeof card !== "object") return null;
  const statement = clean(card.statement);
  if (!statement) return null;
  const draft = readState(statement);
  if (!draft) return null;
  const source = readState(sourceCorpus(card).join("\n"));
  if (!source) return null;
  if (draft.rank <= source.rank) return null;
  return {
    draft: draft.kind,
    draftVia: draft.via,
    source: source.kind,
    sourceVia: source.via,
    sentence: `The source and the statement disagree, because the source ${sourcePhrase(source)} while the statement ${draftPhrase(draft)}.`,
  };
}

/** A quiet card whose draft is a later state than the source. */
export function transactionDemand(card) {
  if (!QUIET.has(readingState(card))) return null;
  return transactionShift(card);
}
