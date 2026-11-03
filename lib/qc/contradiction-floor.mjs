import { absentElementLine } from "./absent-element-line.mjs";

/**
 * B469. What the reader is shown when a check has already found a disagreement.
 * The stored verdict, sentence state, and label are not rewritten.
 * A conflicting match written for a confirmed card is the record of a repair.
 * A fully backed card is not given a demand.
 */

const RAISABLE = new Set(["not_in_source", "beyond", "partial", "note_withheld"]);

function clean(text) {
  return typeof text === "string" ? text.trim() : "";
}

function readingState(card) {
  const fromVerdict = card?.statementVerdict?.state;
  if (typeof fromVerdict === "string" && fromVerdict) return fromVerdict;
  if (typeof card?.sentenceState === "string" && card.sentenceState) return card.sentenceState;
  return "";
}

/**
 * A live disagreement already on the card.
 * Null when the match was written for a confirmed repair, or the verdict is fully backed.
 */
export function liveContradiction(card) {
  if (!card || typeof card !== "object") return null;
  if (String(card.displayVerdict || "") === "supported_full") return null;
  const matches = Array.isArray(card.matchExplanations) ? card.matchExplanations : [];
  const live = matches.find((row) => row?.classification === "conflicting" && row?.writtenFor !== "confirmed");
  if (!live) return null;
  return { explanation: clean(live.explanation) };
}

/**
 * "conflicts" when the reader must be shown the disagreement.
 * "" when the stored state stands.
 */
export function floorState(card) {
  if (!card || typeof card !== "object") return "";
  const state = readingState(card);
  if (!RAISABLE.has(state)) return "";
  if (!liveContradiction(card)) return "";
  return "conflicts";
}

function fold(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/(\d+(?:\.\d+)?)\s*%/g, "$1 percent")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The quotation states a claim the statement also states. */
export function quoteStatesStatement(statement, reason) {
  const bodies = [...String(reason || "").matchAll(/"([^"]+)"/g)].map((match) => fold(match[1]));
  const stmt = fold(statement);
  if (!bodies.length || !stmt) return false;
  for (const quote of bodies) {
    const words = quote.split(" ").filter(Boolean);
    for (let i = 0; i <= words.length - 4; i += 1) {
      if (stmt.includes(words.slice(i, i + 4).join(" "))) return true;
    }
    for (const match of quote.matchAll(/\b\d{4}\b|\b\d+(?:\.\d+)? percent\b|\b\d+(?:\.\d+)?\b/g)) {
      const token = match[0];
      if (token.length < 2) continue;
      if (new RegExp(`(?:^| )${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?: |$)`).test(stmt)) return true;
    }
  }
  return false;
}

function mentions(host, surface) {
  const folded = fold(host);
  const needle = fold(surface);
  if (!needle) return false;
  return new RegExp(`(?:^| )${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?: |$)`).test(folded);
}

function absenceHeadline(card) {
  if (floorState(card) === "conflicts") return false;
  if (card.sentenceLabel === "Not in the source") return true;
  if (card.sentenceLabel) return false;
  const state = readingState(card);
  return state === "not_in_source";
}

/**
 * A sentence that names the absent fact, when the reason would otherwise
 * quote the source stating what the draft says.
 * "" when this card is not that pairing.
 * null when the quotation states the draft and the card stores no absent
 * fact to name. The caller does not show the quotation.
 */
export function absenceOverQuote(card, reason) {
  if (!card || typeof card !== "object") {
    throw new Error("absenceOverQuote: card is missing");
  }
  const text = clean(reason);
  if (!text || !absenceHeadline(card) || !/\bstates "/.test(text)) return "";
  const statement = typeof card.statement === "string" ? card.statement.trim() : "";
  if (!statement) throw new Error("absenceOverQuote: statement is missing");
  if (!quoteStatesStatement(statement, text)) return "";
  const facts = Array.isArray(card.readingFacts) ? card.readingFacts : [];
  const missing = facts.filter((fact) => fact?.status === "not_found" && clean(fact.surface) && !mentions(text, fact.surface));
  if (!missing.length) return null;
  return missing.map((fact) => absentElementLine(fact, statement)).join(" ");
}

const QUIET_STATE = new Set(["nothing_raised", "nothing_to_raise"]);

/**
 * The evidence check recorded a reason for not running, and the stored
 * state would otherwise say nothing was raised.
 */
export function uncheckedLook(card) {
  if (!card || typeof card !== "object") return false;
  const reason = typeof card.evidenceNotReviewedReason === "string" ? card.evidenceNotReviewedReason.trim() : "";
  if (!reason) return false;
  return QUIET_STATE.has(readingState(card));
}

/** The old reading: fully backed, and the stored state says Not in the source. */
export function backedAbsence(card) {
  return card?.displayVerdict === "supported_full" && card?.sentenceState === "not_in_source";
}

/** The reading that does not stop at a fully backed verdict. */
export function absenceOverQuotedFact(card, reason) {
  if (!absenceHeadline(card)) return false;
  return quoteStatesStatement(card?.statement, reason) && /\bstates "/.test(String(reason || ""));
}
