/**
 * B599. Transaction status ruling for Review.
 * Chosen status covers a status claim as fact for status only; all other facts
 * are still checked. Deterministic. No model call.
 */
import { DEAL_STATUS_DEFAULT, dealStatusValue } from "../deal-status.mjs";
import { decisionStatedAsMade } from "./decision-as-made.mjs";
import { sourceCorpus } from "./quoted-span.mjs";

export const TRANSACTION_STATUS_DEFAULT = DEAL_STATUS_DEFAULT;

export const TRANSACTION_STATUS_OPTIONS = Object.freeze([
  TRANSACTION_STATUS_DEFAULT,
  "Approved",
  "Signed or agreed",
  "Completed",
]);

/** Rank: higher means a stronger claim. Default / unknown = 0. */
const STATUS_RANK = Object.freeze({
  Approved: 1,
  "Signed or agreed": 2,
  Completed: 3,
});

const CLAIM_COMPLETED = /\b(?:completed|completion|has invested|have invested|invested in|was acquired|were acquired|has acquired|have acquired|closed the (?:sale|acquisition|transaction)|transaction closed)\b/i;
const CLAIM_SIGNED = /\b(?:agreed to (?:sell|invest|acquire|commit)|signed|committed(?:\s+to)?|has committed|have committed)\b/i;
const CLAIM_APPROVED = /\b(?:approved|approval (?:was|has been) (?:granted|received)|received approval)\b/i;

const SOURCE_RECOMMENDS = /\b(?:recommends?|recommended|proposes?|proposed|plans to|plan to|seek(?:s|ing)? approval)\b/i;
const SOURCE_AGREED_EXIT = /\b(?:agreed to sell|agreement to sell|has agreed to sell)\b/i;
const SOURCE_EXPECTED = /\b(?:expected to complete|completion expected|subject to)\b/i;

/** Earlier investments / prior funds — not the transaction this text is about. */
const PRIOR_HISTORY = /\b(?:prior funds?|earlier funds?|since \d{4}|co-investments?|alongside the manager|advisory committees?|across (?:two|three|\d+) prior)\b/i;

function clean(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Name of the transaction / fund / company this text is about.
 * Prefers an explicit subject, else the source's proposal target.
 */
export function transactionSubject({ subject, sourceText, statement } = {}) {
  const named = clean(subject);
  if (named) return named;
  const source = clean(sourceText);
  const toFund = source.match(
    /\bto\s+([A-Z][A-Za-z0-9 &.'-]{2,80}?Fund\s+[IVXLC\d]+)\b/,
  );
  if (toFund) return clean(toFund[1]);
  const fundOnly = source.match(/\b([A-Z][A-Za-z0-9 &.'-]{2,60}Fund\s+[IVXLC\d]+)\b/);
  if (fundOnly) return clean(fundOnly[1]);
  const draft = clean(statement);
  const draftTo = draft.match(
    /\b(?:committed to|invested in|acquisition of|sale of)\s+([A-Z][A-Za-z0-9 &.'-]{2,80}?Fund\s+[IVXLC\d]+)\b/,
  );
  if (draftTo) return clean(draftTo[1]);
  return "";
}

/**
 * True when a status claim is about this transaction (the subject), not earlier
 * funds, co-investments, or history dated before the source's own proposal.
 */
export function isThisTransactionStatusClaim(statement, { subject, sourceText } = {}) {
  const body = clean(statement);
  if (!body) return false;
  const claimed = claimedTransactionStatus(body);
  const needsDefault = defaultStatusNeedsConfirm(body, sourceText);
  if (!claimed && !needsDefault) return false;

  const subjectName = transactionSubject({ subject, sourceText, statement: body });
  const shortFund = subjectName.match(/\bFund\s+[IVXLC\d]+\b/i)?.[0] || "";
  const mentionsSubject = Boolean(
    subjectName
    && (body.includes(subjectName)
      || (shortFund && new RegExp(`\\b${escapeRegExp(shortFund)}\\b`, "i").test(body))),
  );

  if (PRIOR_HISTORY.test(body)) {
    // Prior-history sentence that also states the subject commitment still counts.
    if (mentionsSubject && /\b(?:committed to|invested in|agreed to (?:invest|acquire|commit)|approved)\b/i.test(body)) {
      return true;
    }
    return false;
  }

  if (subjectName) {
    if (mentionsSubject) return true;
    if (/\b(?:the (?:transaction|investment|sale|acquisition|commitment)|this (?:transaction|investment|sale))\b/i.test(body)) {
      return true;
    }
    // Status claim with a known subject never named → not this transaction.
    return false;
  }

  return true;
}

/** Strongest status claim the draft sentence makes. Null when none. */
export function claimedTransactionStatus(statement) {
  const body = clean(statement);
  if (!body) return null;
  if (CLAIM_COMPLETED.test(body)) return "Completed";
  if (CLAIM_SIGNED.test(body)) return "Signed or agreed";
  if (CLAIM_APPROVED.test(body)) return "Approved";
  return null;
}

export function statusRank(option) {
  if (!option || option === TRANSACTION_STATUS_DEFAULT) return 0;
  return STATUS_RANK[option] || 0;
}

export function statusQuietLine(chosen) {
  const value = dealStatusValue(chosen) || clean(chosen);
  if (!value) return "";
  return `Transaction status as set by you: ${value}.`;
}

function sourceStatusPhrase(sourceText) {
  const body = clean(sourceText);
  if (!body) return "does not confirm the transaction status";
  if (SOURCE_AGREED_EXIT.test(body) || SOURCE_EXPECTED.test(body)) {
    return "agreed to sell and does not say it has completed";
  }
  if (SOURCE_RECOMMENDS.test(body)) {
    return "recommends this transaction and does not say it has completed";
  }
  if (/\bagreed to (?:invest|acquire|commit)\b/i.test(body)) {
    return "agreed the transaction and does not say it has completed";
  }
  return "does not say this transaction has completed";
}

/**
 * Default-status amber when the draft states a decision the source only
 * recommends / agrees / expects, and the writer has not confirmed status.
 */
export function defaultStatusNeedsConfirm(statement, sourceText) {
  const draft = clean(statement);
  const source = clean(sourceText);
  if (!draft || !source) return false;
  if (decisionStatedAsMade(draft, source)) return true;
  // Exit / completion-expected path: draft says completed while source only expects.
  if (CLAIM_COMPLETED.test(draft) && (SOURCE_EXPECTED.test(source) || SOURCE_AGREED_EXIT.test(source) || SOURCE_RECOMMENDS.test(source))) {
    return true;
  }
  if (CLAIM_SIGNED.test(draft) && SOURCE_RECOMMENDS.test(source) && !/\b(?:has committed|have committed|agreed to invest|agreed to acquire)\b/i.test(source)) {
    return true;
  }
  return false;
}

export function defaultStatusConfirmReason(sourceText) {
  const phrase = sourceStatusPhrase(sourceText);
  return `The source ${phrase}. Confirm its status below, or add the closing document.`;
}

/**
 * Decide how the chosen transaction status interacts with one draft sentence.
 *
 * @returns {{
 *   statusDependent: boolean,
 *   claimedStatus: string|null,
 *   chosenStatus: string|null,
 *   covered: boolean,
 *   exceeds: boolean,
 *   needsConfirm: boolean,
 *   reason: string,
 *   quietLine: string,
 *   state: "nothing_raised"|"note_withheld"|null,
 * }}
 */
export function decideTransactionStatus({ statement, dealStatus, sourceText, subject } = {}) {
  const claimed = claimedTransactionStatus(statement);
  const chosenRaw = dealStatusValue(dealStatus);
  const chosen = chosenRaw || null;
  const source = clean(sourceText);
  const quiet = chosen ? statusQuietLine(chosen) : "";

  // No status claim about THIS transaction → not status-dependent.
  if (!isThisTransactionStatusClaim(statement, { subject, sourceText: source })) {
    return {
      statusDependent: false,
      claimedStatus: claimed,
      chosenStatus: chosen,
      covered: false,
      exceeds: false,
      needsConfirm: false,
      reason: "",
      quietLine: "",
      state: null,
    };
  }

  // Default: source predates / only recommends → amber confirm.
  if (!chosen) {
    if (defaultStatusNeedsConfirm(statement, source) || claimed) {
      const needs = defaultStatusNeedsConfirm(statement, source) || Boolean(claimed);
      if (!needs) {
        return {
          statusDependent: false,
          claimedStatus: claimed,
          chosenStatus: null,
          covered: false,
          exceeds: false,
          needsConfirm: false,
          reason: "",
          quietLine: "",
          state: null,
        };
      }
      return {
        statusDependent: true,
        claimedStatus: claimed,
        chosenStatus: null,
        covered: false,
        exceeds: false,
        needsConfirm: true,
        reason: defaultStatusConfirmReason(source),
        quietLine: "",
        state: "note_withheld",
      };
    }
    return {
      statusDependent: false,
      claimedStatus: claimed,
      chosenStatus: null,
      covered: false,
      exceeds: false,
      needsConfirm: false,
      reason: "",
      quietLine: "",
      state: null,
    };
  }

  if (!claimed) {
    // Chosen status set but sentence makes no status claim → not dependent.
    return {
      statusDependent: false,
      claimedStatus: null,
      chosenStatus: chosen,
      covered: false,
      exceeds: false,
      needsConfirm: false,
      reason: "",
      quietLine: "",
      state: null,
    };
  }

  const claimRank = statusRank(claimed);
  const chosenRank = statusRank(chosen);

  if (claimRank > chosenRank) {
    return {
      statusDependent: true,
      claimedStatus: claimed,
      chosenStatus: chosen,
      covered: false,
      exceeds: true,
      needsConfirm: false,
      reason: `The sentence says the transaction is ${claimed.toLowerCase()}, but transaction status is set to ${chosen}.`,
      quietLine: "",
      state: "note_withheld",
    };
  }

  // Chosen covers the claim.
  return {
    statusDependent: true,
    claimedStatus: claimed,
    chosenStatus: chosen,
    covered: true,
    exceeds: false,
    needsConfirm: false,
    reason: "",
    quietLine: quiet,
    state: "nothing_raised",
  };
}

/** Join source corpus from a card for status ruling. */
export function cardSourceText(card) {
  const lines = sourceCorpus(card);
  if (lines.length) return lines.join("\n");
  const parts = [
    card?.primaryExcerpt,
    card?.primaryExcerptText,
    card?.sourceQuote,
    ...(Array.isArray(card?.matchExplanations)
      ? card.matchExplanations.map((row) => row?.explanation || "")
      : []),
  ];
  return parts.filter(Boolean).join("\n");
}
