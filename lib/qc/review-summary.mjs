/**
 * One review vocabulary. Pure functions, no I/O.
 * The backend computes this once; every summary surface reads it.
 */

import { evidenceCountClass } from "./evidence-display-verdict.mjs";
import { asReviewOptions } from "./review-options.mjs";

export const READINESS_LABELS = [
  "Ready",
  "Not fully checked",
  "Minor points to address",
  "Needs work",
  "Needs significant work",
];

export const CHECK_DISPLAY_NAMES = {
  evidence: "Evidence review",
  editorial: "Editorial review",
  compliance: "Compliance review",
};

/** Short names for joined lists. Product order, not alphabetical. */
export const CHECK_LIST_ORDER = [
  "Evidence",
  "Editorial",
  "Compliance",
  "Source recency",
  "Framing",
];

export const CHECK_SHORT_NAMES = {
  evidence: "Evidence",
  editorial: "Editorial",
  compliance: "Compliance",
};

export const TURNED_OFF_LINE_PREFIX = "Turned off for this run";
export const CLEAN_LINE_PREFIX = "Clean";
export const CHECK_NOT_CHECKED_LABEL = "Not checked";

/** Same rule as the frontend evidence row. Off is hidden. A requested miss is Not checked. */
export function evidenceRowLabel(clsValue, displayVerdict, displayLabel) {
  if (clsValue == null) return null;
  if (clsValue === "notChecked") return CHECK_NOT_CHECKED_LABEL;
  return displayLabel ?? String(displayVerdict ?? "");
}

const TURNED_OFF_KEYS = ["evidence", "editorial", "compliance"];

/**
 * One joiner for every list of check names shown to a reader.
 * One name stands alone. Two join with " and ". Three or more are comma
 * separated with " and " before the last. No comma before "and".
 *
 * @param {string[]} names
 * @returns {string}
 */
export function joinCheckNames(names) {
  if (!Array.isArray(names) || names.length === 0) return "";
  if (names.length === 1) return String(names[0]);
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * @param {string[]} names
 * @returns {string|null}
 */
export function turnedOffLineFromNames(names) {
  if (!Array.isArray(names) || names.length === 0) return null;
  const noun = names.length === 1 ? "review" : "reviews";
  return `${TURNED_OFF_LINE_PREFIX}: ${joinCheckNames(names)} ${noun}.`;
}

/**
 * Clean line. Same joiner and trailing period as the turned-off line.
 * Does not take the word "review".
 *
 * @param {string[]} names
 * @returns {string|null}
 */
export function cleanLineFromNames(names) {
  if (!Array.isArray(names) || names.length === 0) return null;
  return `${CLEAN_LINE_PREFIX}: ${joinCheckNames(names)}.`;
}

function asOptions(reviewOptions) {
  return asReviewOptions(reviewOptions);
}

/**
 * One footer line for every check that was not requested. Null when all ran.
 * Wording is shared with the card, the results-screen helper, and the export.
 *
 * @param {{ evidence?: string|null, editorial?: string|null, compliance?: string|null }} cls
 * @returns {string|null}
 */
export function turnedOffLineFromClass(cls) {
  if (!cls || typeof cls !== "object") return null;
  const names = TURNED_OFF_KEYS.filter((key) => cls[key] == null).map(
    (key) => CHECK_SHORT_NAMES[key]
  );
  return turnedOffLineFromNames(names);
}

function classifyEvidence(card, evidenceEnabled) {
  if (!evidenceEnabled) return null;
  if (card?.commentaryNotReviewed === true) return "notChecked";
  return evidenceCountClass(card?.displayVerdict);
}

/** Cards from an analyse-statements payload. Used to recompute the summary at the point of use. */
export function cardsFromAnalyseResult(qcResult) {
  const statements = Array.isArray(qcResult?.statements) ? qcResult.statements : [];
  return statements.map((row) => row?.qcCard).filter((card) => card && typeof card === "object");
}

/**
 * Summary for the review that reviewOptions describe, not the stamped copy.
 * Missing cards fall back to the stamp so a legacy snapshot stays legacy.
 */
export function reviewSummaryFromResult(qcResult, reviewOptions) {
  const cards = cardsFromAnalyseResult(qcResult);
  const stamped = qcResult?.meta?.reviewSummary;
  if (cards.length === 0) {
    return stamped && stamped.version === 1 ? stamped : null;
  }
  return summariseReview(cards, reviewOptions ?? qcResult?.meta?.reviewOptions);
}

const KNOWN_SIGNAL_VERDICTS = new Set([
  "clean",
  "concern",
  "soft_concern",
  "hard_concern",
  "not_reviewed",
]);

function classifySignal(verdict, enabled) {
  if (!enabled) return null;
  if (verdict == null) return "notChecked";
  const v = String(verdict).trim();
  if (!KNOWN_SIGNAL_VERDICTS.has(v)) return "notChecked";
  if (v === "hard_concern") return "hardConcern";
  if (v === "soft_concern" || v === "concern") return "concern";
  if (v === "not_reviewed") return "notChecked";
  return "clean";
}

const CARD_TONE_RED = new Set(["notSupported", "conflicting", "hardConcern"]);
const CARD_TONE_AMBER = new Set(["partial", "concern", "notChecked", "unverifiable"]);
const CARD_TONE_GREEN = new Set(["confirmed", "clean"]);

/**
 * Border tone from the same classes QRS uses. Off (`null`) does not vote.
 * A requested miss (`notChecked`) cannot make a card green.
 *
 * @param {{ evidence?: string|null, editorial?: string|null, compliance?: string|null }} cls
 * @returns {"green"|"amber"|"red"|"neutral"}
 */
export function cardToneFromClass(cls) {
  const signals = [cls?.evidence, cls?.editorial, cls?.compliance].filter((s) => s != null);
  if (signals.length === 0) return "neutral";
  if (signals.some((s) => CARD_TONE_RED.has(s))) return "red";
  if (signals.some((s) => CARD_TONE_AMBER.has(s))) return "amber";
  if (signals.every((s) => CARD_TONE_GREEN.has(s))) return "green";
  return "neutral";
}

/**
 * @param {object} card
 * @param {object} [reviewOptions]
 */
export function classifyCard(card, reviewOptions) {
  const opts = asOptions(reviewOptions);
  const counted = card?.suppressInQcWorkbench !== true;
  const evidence = classifyEvidence(card, opts.evidenceEnabled);
  const editorial = classifySignal(card?.editorialVerdict, opts.editorialEnabled);
  const compliance = classifySignal(card?.complianceVerdict, opts.complianceEnabled);
  const needsAttention =
    counted &&
    (evidence === "notSupported" ||
      evidence === "conflicting" ||
      editorial === "concern" ||
      editorial === "hardConcern" ||
      compliance === "concern" ||
      compliance === "hardConcern");
  const signals = { evidence, editorial, compliance };
  const cardTone = cardToneFromClass(signals);
  const turnedOffLine = turnedOffLineFromClass(signals);
  return { counted, evidence, editorial, compliance, needsAttention, cardTone, turnedOffLine };
}

function emptyEvidence() {
  return { confirmed: 0, partial: 0, conflicting: 0, notSupported: 0 };
}

function emptySignal() {
  return { concerns: 0, hardConcerns: 0, notChecked: 0 };
}

function emptyBoundHits() {
  return { editorial: 0, compliance: 0, commentary: 0, statements: 0 };
}

function isRateLimitWindowReason(value) {
  return typeof value === "string" && value.trim() === "rate_limit_window";
}

function readinessFromCounts({
  statements,
  conflicting,
  notSupported,
  partial,
  hardConcernCards,
  softConcern,
  notChecked,
}) {
  if (statements === 0) return null;
  const hard = notSupported + conflicting + hardConcernCards;
  if (conflicting > 0) return "Needs significant work";
  if (hard >= 3) return "Needs significant work";
  if (hard > 0) return "Needs work";
  if (partial > 0 || softConcern) return "Minor points to address";
  if (notChecked > 0) return "Not fully checked";
  return "Ready";
}

/**
 * @param {object[]} cards
 * @param {object} [reviewOptions]
 */
export function summariseReview(cards, reviewOptions) {
  const opts = asOptions(reviewOptions);
  const list = Array.isArray(cards) ? cards : [];
  const classified = list.map((card) => ({ card, cls: classifyCard(card, opts) }));
  const counted = classified.filter((row) => row.cls.counted);

  const evidence = opts.evidenceEnabled ? emptyEvidence() : null;
  const editorial = opts.editorialEnabled ? emptySignal() : null;
  const compliance = opts.complianceEnabled ? emptySignal() : null;

  let signalConcerns = 0;
  let notChecked = 0;
  let needsAttention = 0;
  let hardConcernCards = 0;
  let softConcern = false;
  const rateLimitBoundHits = emptyBoundHits();

  for (const row of counted) {
    const cls = row.cls;
    if (evidence) {
      if (cls.evidence === "confirmed") evidence.confirmed += 1;
      else if (cls.evidence === "partial") evidence.partial += 1;
      else if (cls.evidence === "conflicting") evidence.conflicting += 1;
      else if (cls.evidence === "notSupported") evidence.notSupported += 1;
    }
    if (editorial) {
      if (cls.editorial === "hardConcern") {
        editorial.hardConcerns += 1;
        editorial.concerns += 1;
      } else if (cls.editorial === "concern") {
        editorial.concerns += 1;
      } else if (cls.editorial === "notChecked") {
        editorial.notChecked += 1;
      }
    }
    if (compliance) {
      if (cls.compliance === "hardConcern") {
        compliance.hardConcerns += 1;
        compliance.concerns += 1;
      } else if (cls.compliance === "concern") {
        compliance.concerns += 1;
      } else if (cls.compliance === "notChecked") {
        compliance.notChecked += 1;
      }
    }
    const hasSignal =
      cls.editorial === "concern" ||
      cls.editorial === "hardConcern" ||
      cls.compliance === "concern" ||
      cls.compliance === "hardConcern";
    if (hasSignal) signalConcerns += 1;
    if (cls.editorial === "notChecked" || cls.compliance === "notChecked" || cls.evidence === "notChecked" || cls.evidence === "unverifiable") {
      notChecked += 1;
    }
    const editorialBound = isRateLimitWindowReason(row.card?.editorialNotReviewedReason);
    const complianceBound = isRateLimitWindowReason(row.card?.complianceNotReviewedReason);
    const commentaryBound = isRateLimitWindowReason(row.card?.commentaryNotReviewedReason);
    if (editorialBound) rateLimitBoundHits.editorial += 1;
    if (complianceBound) rateLimitBoundHits.compliance += 1;
    if (commentaryBound) rateLimitBoundHits.commentary += 1;
    if (editorialBound || complianceBound || commentaryBound) rateLimitBoundHits.statements += 1;
    if (cls.needsAttention) needsAttention += 1;
    if (cls.editorial === "hardConcern" || cls.compliance === "hardConcern") hardConcernCards += 1;
    if (cls.editorial === "concern" || cls.compliance === "concern") softConcern = true;
  }

  const conflicting = evidence?.conflicting ?? 0;
  const notSupported = evidence?.notSupported ?? 0;
  const partial = evidence?.partial ?? 0;

  return {
    version: 1,
    statements: counted.length,
    evidence,
    editorial,
    compliance,
    signalConcerns,
    notChecked,
    needsAttention,
    readiness: readinessFromCounts({
      statements: counted.length,
      conflicting,
      notSupported,
      partial,
      hardConcernCards,
      softConcern,
      notChecked,
    }),
    ...(rateLimitBoundHits.statements > 0 ? { rateLimitBoundHits } : {}),
  };
}
