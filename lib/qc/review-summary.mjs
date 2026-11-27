/**
 * One review vocabulary. Pure functions, no I/O.
 * The backend computes this once; every summary surface reads it.
 */

import { evidenceCountClass } from "./evidence-display-verdict.mjs";
import { readerOnlyIncomplete, shownLabel, shownState } from "./shown-verdict.mjs";
import { asReviewOptions } from "./review-options.mjs";
import { toneForStatementVerdict } from "./statement-verdict.mjs";
import { splitHouseStyle } from "./house-style.mjs";
import { COMBINED_TONE } from "./combined-verdict.mjs";

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
  compliance: "Caution review",
};

/** Short names for joined lists. Product order, not alphabetical. */
export const CHECK_LIST_ORDER = [
  "Evidence",
  "Editorial",
  "Caution",
  "Source recency",
  "Framing",
];

export const CHECK_SHORT_NAMES = {
  evidence: "Evidence",
  editorial: "Editorial",
  compliance: "Caution",
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

const STATEMENT_COUNT = {
  not_in_source: "notSupported",
  conflicts: "conflicting",
  beyond: "beyond",
  partial: "partial",
  nothing_raised: "nothingRaised",
  note_withheld: "needsLook",
};

function classifyEvidence(card, evidenceEnabled) {
  if (!evidenceEnabled) return null;
  if (card?.commentaryNotReviewed === true) return "notChecked";
  // B598: stamped cards already wrote the evidence face; count that, do not re-trace.
  const state =
    card?.stampAuthority === "b596" && typeof card?.sentenceState === "string" && card.sentenceState
      ? card.sentenceState
      : shownState(card);
  if (state === "beyond" || state === "partial") return "beyond";
  if (typeof state === "string" && STATEMENT_COUNT[state]) return STATEMENT_COUNT[state];
  return evidenceCountClass(card?.displayVerdict, card);
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

const CRAFT_OFF = new Set(["voice_consistency", "first_person_plural", "materiality"]);

function concernCode(concern) {
  return String(concern?.concernCode || concern?.rule || concern?.ruleId || "").trim();
}

function concernHasText(concern) {
  // B602: house_range / spelling notes store copy on `message`.
  for (const key of ["note", "concernText", "text", "message"]) {
    if (typeof concern?.[key] === "string" && concern[key].trim()) return true;
  }
  return false;
}

/**
 * B598. Mirror the FE visibleConcerns filter: when the evidence face is amber or
 * red, editorial concerns are not shown on the card and must not count.
 */
export function displayedEditorialConcerns(card) {
  // Prefer the stamped evidence ledger. Only hide editorial when that face is
  // amber or red (visibleConcerns). Missing state must not wipe green-card notes.
  const evidenceState = String(
    card?.sentenceState
    || card?.statementVerdict?.state
    || "",
  );
  const raised = ["conflicts", "not_in_source", "beyond", "partial", "note_withheld"].includes(evidenceState);
  const raw = Array.isArray(card?.houseStyleConcerns)
    ? (Array.isArray(card?.editorialConcerns) ? card.editorialConcerns : [])
    : splitHouseStyle(card?.editorialConcerns).editorial;
  if (raised) return [];
  return raw.filter((concern) => {
    if (!concernHasText(concern)) return false;
    if (CRAFT_OFF.has(concernCode(concern))) return false;
    if (/does not add meaningful information/i.test(String(concern?.note || ""))) return false;
    return true;
  });
}

/** House-style notes the user can open (not hidden by evidence raise). */
export function displayedHouseStyleConcerns(card) {
  if (Array.isArray(card?.houseStyleConcerns)) {
    return card.houseStyleConcerns.filter(concernHasText);
  }
  return splitHouseStyle(card?.editorialConcerns).houseStyle.filter(concernHasText);
}

export function displayedComplianceConcerns(card) {
  return (Array.isArray(card?.complianceConcerns) ? card.complianceConcerns : []).filter((concern) => {
    if (concernHasText(concern)) return true;
    // A coded hard concern still counts even when note text was not stored.
    return Boolean(concernCode(concern));
  });
}

const CARD_TONE_RED = new Set(["notSupported", "conflicting", "hardConcern"]);
const CARD_TONE_AMBER = new Set(["partial", "beyond", "concern", "notChecked", "unverifiable", "needsLook"]);
const CARD_TONE_GREEN = new Set(["confirmed", "nothingRaised", "clean"]);
const TONE_RANK = { red: 3, amber: 2, green: 1, neutral: 0 };

function louderTone(left, right) {
  const a = left || "neutral";
  const b = right || "neutral";
  return (TONE_RANK[a] || 0) >= (TONE_RANK[b] || 0) ? a : b;
}

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
  // B598/B599: count editorial from displayed concerns after visibleConcerns filtering.
  let editorial = classifySignal(card?.editorialVerdict, opts.editorialEnabled);
  if (opts.editorialEnabled) {
    const evidenceState = String(card?.sentenceState || card?.statementVerdict?.state || "");
    const raised = ["conflicts", "not_in_source", "beyond", "partial", "note_withheld"].includes(evidenceState);
    const shown = displayedEditorialConcerns(card);
    if (shown.length > 0) {
      editorial = editorial === "hardConcern" ? "hardConcern" : "concern";
    } else if (editorial != null && editorial !== "notChecked") {
      const rawLen = Array.isArray(card?.editorialConcerns) ? card.editorialConcerns.length : 0;
      // Hidden behind a raised face, or concern objects that display filters out.
      if (raised || rawLen > 0) editorial = "clean";
      // B602: stamped card with a stale concern verdict and no objects (R15 I4).
      else if (card?.stampAuthority === "b596" && rawLen === 0) editorial = "clean";
    }
  }
  let compliance = classifySignal(card?.complianceVerdict, opts.complianceEnabled);
  if (opts.complianceEnabled) {
    const shown = displayedComplianceConcerns(card);
    if (shown.length > 0) {
      compliance = compliance === "hardConcern" ? "hardConcern" : "concern";
    } else if (compliance != null && compliance !== "notChecked") {
      const rawLen = Array.isArray(card?.complianceConcerns) ? card.complianceConcerns.length : 0;
      // B602: concerns cleared (e.g. duplicate gross/net) — drop a stale verdict.
      if (rawLen > 0) compliance = "clean";
      else if (card?.complianceCleared === true) compliance = "clean";
    }
  }
  const needsAttention =
    counted &&
    (evidence === "notSupported" ||
      evidence === "conflicting" ||
      evidence === "beyond" ||
      evidence === "needsLook" ||
      editorial === "concern" ||
      editorial === "hardConcern" ||
      compliance === "concern" ||
      compliance === "hardConcern");
  const signals = { evidence, editorial, compliance };
  const evidenceStateForTone =
    card?.stampAuthority === "b596" && typeof card?.sentenceState === "string" && card.sentenceState
      ? card.sentenceState
      : shownState(card);
  const statementTone = opts.evidenceEnabled ? toneForStatementVerdict(evidenceStateForTone) : null;
  let cardTone = louderTone(statementTone, cardToneFromClass(signals));
  // B561. The shown label is the verdict. Editorial, house style, and a soft
  // compliance note do not turn Nothing raised amber. A compliance hard concern
  // still colours the card.
  if (shownLabel(card) === "Nothing raised") {
    cardTone = signals.compliance === "hardConcern" ? "red" : "green";
  }
  const turnedOffLine = turnedOffLineFromClass(signals);
  return { counted, evidence, editorial, compliance, needsAttention, cardTone, turnedOffLine };
}

function emptyEvidence() {
  return { confirmed: 0, partial: 0, beyond: 0, conflicting: 0, notSupported: 0, nothingRaised: 0, needsLook: 0, unbadged: 0 };
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

/**
 * B605. What it takes to fix one card.
 *   decision: the writer needs an answer from outside the tool (the sources
 *             disagree, or the opening claim is not supported).
 *   rewrite:  a claim the sources do not back; reword it or support it.
 *   quick:    the tool offers the fix (a figure to Accept, a status to confirm,
 *             a flagged phrase with a rewrite, a hard style point).
 *   polish:   optional wording points.
 */
const REWRITE_STATES = new Set(["not_in_source", "beyond", "partial"]);

function cardState(card, cls) {
  if (cls?.evidence == null || cls.evidence === "notChecked" || cls.evidence === "unverifiable") return null;
  if (card?.stampAuthority === "b596" && typeof card?.sentenceState === "string" && card.sentenceState) {
    return card.sentenceState;
  }
  if (cls?.evidence === "conflicting") return "conflicts";
  if (cls?.evidence === "notSupported") return "not_in_source";
  if (cls?.evidence === "beyond") return "beyond";
  if (cls?.evidence === "needsLook") return "note_withheld";
  return null;
}

/** The draft's figures are all found in a source, and the passages come from two or more sources. */
export function sourcesDisagree(card) {
  const titles = new Set(
    [card?.primaryRefTitle, card?.conflictExcerpt?.sourceLabel]
      .map((t) => (typeof t === "string" ? t.trim() : ""))
      .filter(Boolean),
  );
  const parts = Array.isArray(card?.primaryExcerptParts) ? card.primaryExcerptParts : [];
  const indexes = new Set(parts.map((part) => part?.sourceIndex).filter((i) => Number.isInteger(i)));
  if (titles.size < 2 && indexes.size < 2) return false;
  const figures = (Array.isArray(card?.readingFacts) ? card.readingFacts : [])
    .filter((fact) => fact && (fact.kind === "figure" || fact.kind === "date"));
  return !figures.some((fact) => fact.status === "not_found" || fact.status === "unmatched");
}

export function fixKindOf(card, cls, isOpener) {
  if (!cls?.counted) return null;
  const state = cardState(card, cls);
  if (state === "conflicts") return sourcesDisagree(card) ? "decision" : "quick";
  if (REWRITE_STATES.has(state)) return isOpener && state !== "partial" ? "decision" : "rewrite";
  if (state === "note_withheld") return "quick";
  if (cls.compliance === "hardConcern" || cls.editorial === "hardConcern") return "quick";
  if (cls.compliance === "concern" || cls.editorial === "concern") return "polish";
  return null;
}

function readinessFromFixes({ statements, decision, rewrite, quick, polish, notChecked }) {
  if (statements === 0) return null;
  if (decision > 0) return "Needs significant work";
  if (rewrite >= 3) return "Needs significant work";
  // Many fixes, even easy ones, are still a lot of work.
  if (rewrite + quick >= 5) return "Needs significant work";
  if (rewrite > 0 || quick > 0) return "Needs work";
  if (polish > 0) return "Minor points to address";
  if (notChecked > 0) return "Not fully checked";
  return "Ready";
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

/** One plain line under the badge saying why. */
export function readinessReasonLine({ disagree, opener, quickFigure, quickStatus, quickOther, rewrite, polish, notChecked }) {
  const parts = [];
  if (disagree > 0) parts.push(`The sources disagree on ${plural(disagree, "sentence", "sentences")}`);
  if (opener > 0) parts.push("the opening claim is not supported by the sources");
  if (rewrite > 0) parts.push(`${plural(rewrite, "claim", "claims")} to reword or support`);
  if (quickFigure > 0) parts.push(`${plural(quickFigure, "figure", "figures")} to correct`);
  if (quickStatus > 0) parts.push(`${plural(quickStatus, "point", "points")} to confirm`);
  if (quickOther > 0) parts.push(`${plural(quickOther, "phrase", "phrases")} to change`);
  if (parts.length === 0 && polish > 0) parts.push(`${plural(polish, "wording point", "wording points")} to consider`);
  if (parts.length === 0 && notChecked > 0) parts.push(`${plural(notChecked, "sentence", "sentences")} could not be fully checked`);
  if (parts.length === 0) return null;
  const line = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `${line.charAt(0).toUpperCase()}${line.slice(1)}.`;
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
  const houseStyle = { concerns: 0 };

  let signalConcerns = 0;
  let notChecked = 0;
  let needsAttention = 0;
  let hardConcernCards = 0;
  let softConcern = false;
  const rateLimitBoundHits = emptyBoundHits();

  for (const row of counted) {
    const cls = row.cls;
    houseStyle.concerns += displayedHouseStyleConcerns(row.card).length;
    if (evidence) {
      if (cls.evidence === "confirmed") evidence.confirmed += 1;
      else if (cls.evidence === "partial") evidence.partial += 1;
      else if (cls.evidence === "beyond") evidence.beyond += 1;
      else if (cls.evidence === "conflicting") evidence.conflicting += 1;
      else if (cls.evidence === "notSupported") evidence.notSupported += 1;
      else if (cls.evidence === "nothingRaised") evidence.nothingRaised += 1;
      else if (cls.evidence === "needsLook") evidence.needsLook += 1;
      else if (cls.evidence === "unbadged") evidence.unbadged += 1;
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
    const checkMissed = cls.editorial === "notChecked" || cls.compliance === "notChecked" || cls.evidence === "notChecked" || cls.evidence === "unverifiable";
    if (checkMissed || readerOnlyIncomplete(row.card)) notChecked += 1;
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

  // B605: grade by what it takes to fix.
  const fixes = { decision: 0, rewrite: 0, quick: 0, polish: 0 };
  const why = { disagree: 0, opener: 0, quickFigure: 0, quickStatus: 0, quickOther: 0, rewrite: 0, polish: 0, notChecked };
  const openerIndex = counted.reduce((min, row) => {
    const i = Number.isInteger(row.card?.index) ? row.card.index : null;
    return i != null && (min == null || i < min) ? i : min;
  }, null);
  counted.forEach((row) => {
    const isOpener = openerIndex != null && row.card?.index === openerIndex;
    const kind = fixKindOf(row.card, row.cls, isOpener);
    if (!kind) return;
    fixes[kind] += 1;
    const state = cardState(row.card, row.cls);
    if (kind === "decision") {
      if (state === "conflicts") why.disagree += 1;
      else why.opener += 1;
    } else if (kind === "rewrite") why.rewrite += 1;
    else if (kind === "quick") {
      if (state === "conflicts") why.quickFigure += 1;
      else if (state === "note_withheld") why.quickStatus += 1;
      else why.quickOther += 1;
    } else why.polish += 1;
  });
  const readiness = readinessFromFixes({ statements: counted.length, ...fixes, notChecked });
  const readinessReason = readiness && readiness !== "Ready" ? readinessReasonLine(why) : null;
  if (evidence && evidence.beyond === 0) delete evidence.beyond;
  if (evidence && evidence.nothingRaised === 0) delete evidence.nothingRaised;
  if (evidence && evidence.needsLook === 0) delete evidence.needsLook;

  return {
    version: 1,
    statements: counted.length,
    evidence,
    editorial,
    compliance,
    // Omit empty houseStyle so legacy summary fixtures stay equal.
    ...(houseStyle.concerns > 0 ? { houseStyle } : {}),
    signalConcerns,
    notChecked,
    needsAttention,
    readiness,
    ...(readinessReason ? { readinessReason } : {}),
    ...(rateLimitBoundHits.statements > 0 ? { rateLimitBoundHits } : {}),
  };
}
