/**
 * B599. Transaction status ruling for Review.
 * Chosen status covers a status claim as fact for status only; all other facts
 * are still checked. Deterministic. No model call.
 */
import {
  DEAL_STATUS_DEFAULT,
  DEAL_STATUS_HIDDEN_TEXT_TYPES,
  DEAL_STATUS_OPTIONAL_TEXT_TYPES,
  DEAL_STATUS_TEXT_TYPES,
  dealStatusValue,
} from "../deal-status.mjs";
import { decisionStatedAsMade } from "./decision-as-made.mjs";
import { sourceCorpus } from "./quoted-span.mjs";

/** True when this text type never shows the status control (unless optional Add). */
export function statusControlHidden(eventType) {
  return typeof eventType === "string" && DEAL_STATUS_HIDDEN_TEXT_TYPES.includes(eventType);
}

export function statusControlShown(eventType, { statusOpened = false } = {}) {
  if (typeof eventType !== "string" || !eventType) return false;
  if (DEAL_STATUS_TEXT_TYPES.includes(eventType)) return true;
  if (DEAL_STATUS_OPTIONAL_TEXT_TYPES.includes(eventType) && statusOpened) return true;
  return false;
}

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

/**
 * B602 F47. A completed-action claim about a different action (invested vs sold)
 * or dated before the current transaction is ordinary history, not status.
 */
const PRIOR_INVESTMENT_YEAR = /\b(?:invested|investment)\b(?:\s+\w+){0,6}\s+in\s+(?:19|20)\d{2}\b|\bin\s+(?:19|20)\d{2}\b(?:\s+\w+){0,6}\s+(?:invested|investment)\b/i;
const EXIT_ACTION = /\b(?:sold|sell|sale|exit|divest|divested|partial sale)\b/i;
const INVEST_ACTION = /\b(?:invested|investment|acquired|acquisition|committed)\b/i;

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

  if (PRIOR_HISTORY.test(body) || PRIOR_INVESTMENT_YEAR.test(body)) {
    // Prior-history sentence that also states the subject commitment still counts
    // when it is the same action as the current transaction (not an earlier buy).
    if (
      mentionsSubject
      && /\b(?:committed to|agreed to (?:invest|acquire|commit)|approved)\b/i.test(body)
      && !PRIOR_INVESTMENT_YEAR.test(body)
    ) {
      return true;
    }
    return false;
  }

  // Different action from the live exit/sale: "invested in 2020" while sources
  // describe a sale is ordinary company history.
  if (INVEST_ACTION.test(body) && !EXIT_ACTION.test(body) && EXIT_ACTION.test(clean(sourceText))) {
    if (PRIOR_INVESTMENT_YEAR.test(body) || /\b(?:family[- ]owned|when .+ was)\b/i.test(body)) {
      return false;
    }
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

const DATE_IN_DRAFT = /\bon\s+(\d{1,2}\s+\w+\s+\d{4})\b/i;
const COMPLETION_EXPECTED = /\bcompletion(?:\s+is|\s+was)?\s+expected\s+(?:on\s+or\s+around|around|on)?\s*(\d{1,2}\s+\w+\s+\d{4})/i;

/** Signing date from "signed … on DATE" or "On DATE … signed". */
export function sourceSignedDate(sourceText) {
  const source = clean(sourceText);
  if (!source) return "";
  const after = source.match(/\bsigned(?:\s+an?\s+agreement)?(?:\s+to\s+\w+)?\s+on\s+(\d{1,2}\s+\w+\s+\d{4})\b/i);
  if (after?.[1]) return clean(after[1]);
  const before = source.match(/\bon\s+(\d{1,2}\s+\w+\s+\d{4})\b[^.!?]{0,100}\bsigned\b/i);
  if (before?.[1]) return clean(before[1]);
  return "";
}

export function sourceExpectedCompletionDate(sourceText) {
  const source = clean(sourceText);
  if (!source) return "";
  return clean(
    source.match(COMPLETION_EXPECTED)?.[1]
    || source.match(/\bexpected\s+(?:on\s+or\s+around|around|on)\s+(\d{1,2}\s+\w+\s+\d{4})/i)?.[1]
    || "",
  );
}

/**
 * When a status claim carries a date/figure/name that the source contradicts
 * (for example completed on the signing date while completion is still pending),
 * return a red conflict reason. Confirmed status never clears this.
 */
export function statusAttachedFactConflict(statement, sourceText) {
  const draft = clean(statement);
  const source = clean(sourceText);
  if (!draft || !source) return null;
  const claimed = claimedTransactionStatus(draft);
  if (!claimed) return null;

  // B603 F64. Memo/source date vs sentence agreement month: name both dates,
  // never truncate mid-sentence, and hide status buttons.
  {
    const draftMonthYear = draft.match(/\b((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})\b/i)?.[1] || "";
    const memoDate = source.match(/\bDate:\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+[A-Za-z]+\s+\d{4})\b/i)?.[1]
      || source.match(/\b(?:dated|as of|as at)\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+[A-Za-z]+\s+\d{4})\b/i)?.[1]
      || "";
    const draftYear = draftMonthYear.match(/\d{4}/)?.[0];
    const memoYear = memoDate.match(/\d{4}/)?.[0];
    if (draftMonthYear && memoDate && draftYear && memoYear && draftYear !== memoYear) {
      const mdy = memoDate.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
      const memoNorm = mdy ? `${mdy[2]} ${mdy[1]} ${mdy[3]}` : memoDate;
      return {
        state: "conflicts",
        label: "Conflicts with the source",
        reason: `The memo is dated ${memoNorm}; the sentence says the agreement was in ${draftMonthYear}.`,
        needsConfirm: false,
        statusDependent: false,
      };
    }
  }

  const draftDate = draft.match(DATE_IN_DRAFT)?.[1] || "";
  const signedOn = sourceSignedDate(source);
  const expectedComplete = sourceExpectedCompletionDate(source);

  // Completed on the signing date while source still expects completion later.
  if (
    claimed === "Completed"
    && draftDate
    && signedOn
    && clean(draftDate).toLowerCase() === clean(signedOn).toLowerCase()
    && (SOURCE_EXPECTED.test(source) || expectedComplete)
  ) {
    const expected = expectedComplete || "a later date";
    return {
      state: "conflicts",
      label: "Conflicts with the source",
      reason: `The source says the agreement was signed on ${signedOn} and completion was expected on or around ${expected}.`,
      needsConfirm: false,
      statusDependent: true,
    };
  }

  // Completed while source only expects completion (no matching attached date path above).
  if (claimed === "Completed" && SOURCE_EXPECTED.test(source) && !/\b(?:has completed|completed the|completion (?:has|was) (?:occurred|taken place))\b/i.test(source)) {
    if (signedOn && expectedComplete) {
      return {
        state: "conflicts",
        label: "Conflicts with the source",
        reason: `The source says the agreement was signed on ${signedOn} and completion was expected on or around ${expectedComplete}.`,
        needsConfirm: false,
        statusDependent: true,
      };
    }
  }

  return null;
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
export function decideTransactionStatus({
  statement,
  dealStatus,
  sourceText,
  subject,
  eventType = null,
  statusOpened = false,
} = {}) {
  const claimed = claimedTransactionStatus(statement);
  const chosenRaw = dealStatusValue(dealStatus);
  const chosen = chosenRaw || null;
  const source = clean(sourceText);
  const quiet = chosen ? statusQuietLine(chosen) : "";
  const controlsShown = statusControlShown(eventType, { statusOpened });
  const controlsHidden = statusControlHidden(eventType) || (eventType && !controlsShown);

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
      factConflict: null,
    };
  }

  // Attached date/figure/name that contradicts a pending source state → red, no buttons.
  const factConflict = statusAttachedFactConflict(statement, source);
  if (factConflict) {
    return {
      statusDependent: factConflict.statusDependent !== false,
      claimedStatus: claimed,
      chosenStatus: chosen,
      covered: false,
      exceeds: false,
      needsConfirm: false,
      reason: factConflict.reason,
      quietLine: "",
      state: factConflict.state,
      factConflict,
    };
  }

  // Default: source predates / only recommends → amber confirm (when controls shown).
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
          factConflict: null,
        };
      }
      // Hidden text types: never offer confirm buttons. Prefer a pending-completion reason.
      if (controlsHidden) {
        const pending = statusAttachedFactConflict(statement, source)
          || (CLAIM_COMPLETED.test(statement)
            ? statusAttachedFactConflict(`completed on ${sourceSignedDate(source) || "the date"}`, source)
            : null);
        if (pending) {
          return {
            statusDependent: true,
            claimedStatus: claimed,
            chosenStatus: null,
            covered: false,
            exceeds: false,
            needsConfirm: false,
            reason: pending.reason,
            quietLine: "",
            state: pending.state,
            factConflict: pending,
          };
        }
        const reason = defaultStatusConfirmReason(source).replace(
          / Confirm its status below, or add the closing document\./,
          "",
        );
        return {
          statusDependent: true,
          claimedStatus: claimed,
          chosenStatus: null,
          covered: false,
          exceeds: false,
          needsConfirm: false,
          reason,
          quietLine: "",
          state: "note_withheld",
          factConflict: null,
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
        factConflict: null,
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
      factConflict: null,
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
      factConflict: null,
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
      factConflict: null,
      reason: `The sentence says the transaction is ${claimed.toLowerCase()}, but transaction status is set to ${chosen}.`,
      quietLine: "",
      state: "note_withheld",
    };
  }

  // Chosen covers the claim. Attached date/figure conflicts still win.
  if (factConflict) {
    return {
      statusDependent: true,
      claimedStatus: claimed,
      chosenStatus: chosen,
      covered: false,
      exceeds: false,
      needsConfirm: false,
      reason: factConflict.reason,
      quietLine: quiet,
      state: factConflict.state,
      factConflict,
    };
  }
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
    factConflict: null,
  };
}

/** Join source corpus from a card for status ruling. */
export function cardSourceText(card) {
  // B603: full source dump when stamped on the card (memo dates, headers).
  if (typeof card?.sourceCorpus === "string" && card.sourceCorpus.trim()) {
    return card.sourceCorpus.trim();
  }
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
