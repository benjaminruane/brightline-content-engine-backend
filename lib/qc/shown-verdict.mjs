/**
 * B439. What the screen shows, once the card already holds a verdict.
 * A quiet sentence does not stay quiet when the evidence verdict is a
 * conflict or has no support. A louder reading verdict is left as it is.
 * B469. A live disagreement is not shown as a lighter label.
 * B478. A quiet card is a conflict when a later source revised the figure.
 * Support state, concerns, and marks are not read and not written.
 */
import { figureOrDateMiss, floorState, uncheckedLook } from "./contradiction-floor.mjs";
import { confirmationCoversDraft, statementClaimsDone, transactionDemand, transactionShift } from "./transaction-state.mjs";

export const SHOWN_LABELS = Object.freeze({
  not_in_source: "Not in the source",
  conflicts: "Conflicts with the source",
  beyond: "Goes beyond the source",
  partial: "Goes beyond the source",
  nothing_raised: "Nothing raised",
  nothing_to_raise: "Nothing to raise",
  note_withheld: "Needs a look",
});

const QUIET = new Set(["nothing_raised", "nothing_to_raise"]);

/**
 * The matcher and the note both say the statement is supported, and a span
 * vote is the only thing that raised it. That vote does not raise the card.
 */
export function bothReadingsSupport(card) {
  const note = card?.readingNote;
  const bucket = String(note?.bucket || "").toLowerCase();
  const text = typeof note?.text === "string" ? note.text.trim() : "";
  if (bucket !== "wording" || !text) return false;
  if (!/\b(?:restat\w*|same (?:claim|facts|duration)|different words|paraphras\w*)\b/i.test(text)) return false;
  const matches = Array.isArray(card?.matchExplanations) ? card.matchExplanations : [];
  if (!matches.length) return false;
  if (!matches.every((row) => row?.classification === "confirmed")) return false;
  if (matches.some((row) => /does not|discrepan|whereas|conflict/i.test(String(row?.explanation || "")))) return false;
  if (!matches.every((row) => /\b(?:confirms|aligns|aligning|matching|matches)\b/i.test(String(row?.explanation || "")))) return false;
  const rewrites = [
    ...(Array.isArray(card?.classificationRewrites) ? card.classificationRewrites : []),
    ...matches.flatMap((row) => (Array.isArray(row?.classificationRewrites) ? row.classificationRewrites : [])),
  ];
  return rewrites.some((row) => (
    row?.rule === "span_outvote"
    && row?.from === "confirmed"
    && (row?.to === "conflicting" || row?.to === "conflict")
  ));
}

function revisionRaises(card) {
  const notes = card?.supersededSourceNotes;
  const note = Array.isArray(notes) ? String(notes[0] || "").trim() : "";
  return note.startsWith("The later source ");
}

function displaySlug(card) {
  return String(card?.displayVerdict ?? "").toLowerCase().trim();
}

export function readingState(card) {
  const fromVerdict = card?.statementVerdict?.state;
  if (typeof fromVerdict === "string" && fromVerdict) return fromVerdict;
  if (typeof card?.sentenceState === "string" && card.sentenceState) return card.sentenceState;
  return "";
}

const LOUD = new Set(["conflicts", "not_in_source", "note_withheld"]);

/** pending raises to a disagreement, and predates is a light addition, only when the statement says the deal is done. A loud card stays loud. */
export function completionEffect(card) {
  const raw = String(card?.readingNote?.completion || "").trim().toLowerCase();
  if (raw !== "pending" && raw !== "predates") return "";
  if (!statementClaimsDone(card?.statement)) return "";
  if (confirmationCoversDraft(card?.statement, card?.dealStatus)) return "";
  return raw === "pending" ? "conflicts" : "beyond";
}

function evidenceBacked(card) {
  const display = displaySlug(card);
  return display === "supported_full" || display === "supported_partial" || display === "partially_confirmed";
}

function refusedReading(card) {
  return card?.readingNote?.refused === true;
}

function evidenceFromDisplay(card) {
  if (revisionRaises(card)) return "conflicts";
  const display = displaySlug(card);
  if (display === "conflict" || display === "conflicts" || display === "conflicting") return "conflicts";
  if (display === "not_supported" || display === "no_clear_support") return "not_in_source";
  if (display === "supported_partial" || display === "partially_confirmed") return "partial";
  return "";
}

function currentSourceStatus(card) {
  const notes = card?.supersededSourceNotes;
  const note = Array.isArray(notes) ? String(notes[0] || "").trim() : "";
  return note.startsWith("The current source ");
}

function shownStateBase(card) {
  const stampedBranch = card?.statementVerdict?.setBy?.branch || card?.setBy?.branch;
  if (stampedBranch === "conflictWithoutReason") {
    return { state: "note_withheld", branch: "conflictWithoutReason" };
  }
  if (currentSourceStatus(card) && !figureOrDateMiss(card)) {
    return { state: "note_withheld", branch: "supersession" };
  }
  if (bothReadingsSupport(card)) return { state: "nothing_raised", branch: "bothReadingsSupport" };
  const floored = floorState(card);
  if (floored) return { state: floored, branch: "floorState" };
  if (refusedReading(card)) {
    if (transactionShift(card)) return { state: "conflicts", branch: "transactionDemand" };
    if (evidenceBacked(card)) return { state: "note_withheld", branch: "refusedReading" };
  } else if (uncheckedLook(card)) {
    return { state: "note_withheld", branch: "uncheckedLook" };
  } else if (transactionDemand(card)) {
    return { state: "conflicts", branch: "transactionDemand" };
  }
  const state = readingState(card);
  const refusedQuiet = refusedReading(card) && (state === "note_withheld" || QUIET.has(state));
  if (state && !QUIET.has(state) && !refusedQuiet) return { state, branch: "statementVerdict" };
  if (refusedQuiet) {
    const fromDisplay = evidenceFromDisplay(card);
    if (fromDisplay) return { state: fromDisplay, branch: displayBranch(card, fromDisplay) };
    return { state: QUIET.has(state) ? state : "nothing_raised", branch: "refusedReading" };
  }
  if (revisionRaises(card)) return { state: "conflicts", branch: "revisionRaises" };
  const fromDisplay = evidenceFromDisplay(card);
  if (fromDisplay) return { state: fromDisplay, branch: displayBranch(card, fromDisplay) };
  return { state, branch: "statementVerdict" };
}

function displayBranch(card, state) {
  if (state === "conflicts" && revisionRaises(card)) return "revisionRaises";
  return "evidenceDisplay";
}

function roleOf(row) {
  const raw = row?.role ?? row?.sourceRole;
  if (raw === "context") return "context";
  return "facts";
}

function sourceOf(row) {
  if (!row) return null;
  const fromLabel = typeof row.sourceLabel === "string" && row.sourceLabel.trim() ? row.sourceLabel.trim() : "";
  const fromName = typeof row.sourceName === "string" && row.sourceName.trim() ? row.sourceName.trim() : "";
  return { sourceName: fromLabel || fromName, role: roleOf(row) };
}

function matchName(row) {
  return sourceOf(row)?.sourceName || "";
}

/** The match for the source the display quote was taken from. */
function displayOwner(card) {
  const matches = Array.isArray(card?.matchExplanations) ? card.matchExplanations : [];
  const title = [card?.primaryRefTitle, card?.sourceName]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .find(Boolean) || "";
  if (!title) return null;
  return matches.find((row) => matchName(row) === title) || null;
}

/**
 * Conflicts or partial whose only disagreeing evidence is a context source.
 * A facts source that supports the statement clears it. No facts source
 * speaking to it is needs a look. A facts source that disagrees stays as it is.
 * The display branch uses the quoted source when no match is classified as the raise.
 */
function applyContextRole(card, traced) {
  if (traced.state !== "conflicts" && traced.state !== "partial") {
    return { ...traced, source: traced.source || null };
  }
  const matches = Array.isArray(card?.matchExplanations) ? card.matchExplanations : [];
  const raisingClass = traced.state === "partial" ? "partially_confirmed" : "conflicting";
  let raising = matches.filter((row) => row?.classification === raisingClass && row?.writtenFor !== "confirmed");
  if (!raising.length && traced.branch === "evidenceDisplay") {
    const owner = displayOwner(card);
    if (owner) raising = [owner];
  }
  const factsRaising = raising.filter((row) => roleOf(row) === "facts");
  const contextRaising = raising.filter((row) => roleOf(row) === "context");
  if (!contextRaising.length || factsRaising.length) {
    return { ...traced, source: sourceOf(factsRaising[0] || raising[0]) };
  }
  const factsSupport = matches.filter((row) => (
    roleOf(row) === "facts"
    && (row.classification === "confirmed" || (traced.state === "conflicts" && row.classification === "partially_confirmed"))
  ));
  if (factsSupport.length || readerSupports(card)) {
    return {
      state: "nothing_raised",
      branch: traced.branch,
      ...(factsSupport.length ? {} : { cleared: "readingNote" }),
      source: sourceOf(factsSupport[0]) || null,
    };
  }
  if (traced.state === "partial") {
    const factsConflict = matches.filter((row) => (
      roleOf(row) === "facts" && row.classification === "conflicting" && row?.writtenFor !== "confirmed"
    ));
    if (factsConflict.length) return { ...traced, source: sourceOf(factsConflict[0]) };
  }
  return { state: "note_withheld", branch: traced.branch, source: sourceOf(contextRaising[0]) };
}

function setByOf(traced) {
  const setBy = { branch: traced.branch };
  if (traced.source?.sourceName) setBy.sourceName = traced.source.sourceName;
  if (traced.source?.role) setBy.role = traced.source.role;
  if (traced.branch === "evidenceDisplay") setBy.source = "display";
  if (traced.branch === "checksDisagree") {
    setBy.from = traced.from;
    setBy.note = traced.note;
  }
  if (traced.cleared) setBy.cleared = traced.cleared;
  return setBy;
}

function readerSupports(card) {
  const note = card?.readingNote;
  if (!note || note.refused === true) return false;
  const bucket = String(note.bucket || "").trim().toLowerCase();
  return bucket === "none" || bucket === "wording";
}

const INCOMPLETE_EVIDENCE_REASONS = new Set([
  "empty_confirmation_refused",
  "schema_invalid",
  "thrown_call",
  "could_not_determine",
]);

/** The evidence match did not return a classification that can be shown. */
function evidenceCheckIncomplete(card) {
  const reason = typeof card?.evidenceNotReviewedReason === "string" ? card.evidenceNotReviewedReason.trim() : "";
  if (INCOMPLETE_EVIDENCE_REASONS.has(reason)) return true;
  const display = String(card?.displayVerdict || "").toLowerCase().trim();
  const support = String(card?.supportState || "").toLowerCase().trim();
  const notReviewed = display === "not reviewed" || display === "not_reviewed" || support === "skipped";
  if (notReviewed && !reason) return true;
  const rows = [
    ...(Array.isArray(card?.matchExplanations) ? card.matchExplanations : []),
    ...(Array.isArray(card?.sourceMatches) ? card.sourceMatches : []),
  ];
  if (!rows.length) return false;
  const reviewed = rows.some((row) => {
    const cls = row?.classification;
    return cls && cls !== "not_reviewed" && cls !== "superseded";
  });
  if (reviewed) return false;
  return rows.some((row) => (
    row?.emptyConfirmationRefused === true
    || row?.matchNotReviewed === true
    || row?.classification === "not_reviewed"
  ));
}

/**
 * The reading note accepted the sentence, and the evidence match did not finish.
 * A figure or date miss, a refused note, and a real disagreement stay as they are.
 */
function applyReaderSupportedIncomplete(card, traced) {
  if (!readerSupports(card)) return traced;
  if (figureOrDateMiss(card)) return traced;
  if (!evidenceCheckIncomplete(card)) return traced;
  if (traced.state !== "note_withheld" && traced.state !== "nothing_raised" && traced.state !== "nothing_to_raise") return traced;
  if (
    traced.branch === "checksDisagree"
    || traced.branch === "refusedReading"
    || traced.branch === "bothReadingsSupport"
  ) return traced;
  if (traced.source?.role === "context") return traced;
  const status = completionEffect(card);
  if (status) return { state: status, branch: "completionEffect", source: traced.source || null };
  return { state: "nothing_raised", branch: "readerSupportedCheckIncomplete", source: null };
}

function noteBucket(card) {
  const note = card?.readingNote;
  if (!note || note.refused === true || typeof note.bucket !== "string") return "";
  return note.bucket.trim().toLowerCase();
}

/** The closest-passage check and the reading of the whole claim disagree, and the reading supports it. */
function applyReaderDecides(card, traced) {
  const bucket = noteBucket(card);
  if (bucket !== "none" && bucket !== "wording") return traced;
  if (traced.state !== "conflicts" && traced.state !== "partial") return traced;
  if (traced.branch !== "evidenceDisplay" && traced.branch !== "floorState") return traced;
  if (figureOrDateMiss(card)) return traced;
  const matches = Array.isArray(card?.matchExplanations) ? card.matchExplanations : [];
  const conflicts = matches.filter((row) => row?.classification === "conflicting");
  if (
    bucket === "none"
    && traced.state === "conflicts"
    && conflicts.length > 0
    && conflicts.every((row) => row?.writtenFor === "confirmed")
  ) {
    return { state: "nothing_raised", branch: "reader", source: traced.source || null };
  }
  return {
    state: "note_withheld",
    branch: "checksDisagree",
    from: traced.branch,
    note: "readingNote",
    source: traced.source || null,
  };
}

/** A status claim at or before the confirmed status is supported. A figure or date miss stays. */
function applyStatusSupport(card, traced) {
  if (!confirmationCoversDraft(card?.statement, card?.dealStatus)) return traced;
  if (figureOrDateMiss(card)) return traced;
  if (traced.state !== "conflicts" && traced.state !== "partial" && traced.state !== "beyond") return traced;
  return { state: "nothing_raised", branch: traced.branch, cleared: "status", source: traced.source || null };
}

function labelOfTrace(traced) {
  return SHOWN_LABELS[traced?.state] || "";
}

/**
 * One row each time a named override changes the label the reader sees.
 * Additive. Does not change the label.
 */
export function labelOverrideSilences(card) {
  const base = shownStateBase(card);
  const status = completionEffect(card);
  let traced = status && !LOUD.has(base.state)
    ? { state: status, branch: "completionEffect" }
    : base;
  const steps = [
    ["applyContextRole", applyContextRole],
    ["applyStatusSupport", applyStatusSupport],
    ["applyReaderDecides", applyReaderDecides],
    ["applyReaderSupportedIncomplete", applyReaderSupportedIncomplete],
  ];
  const out = [];
  for (const [rule, fn] of steps) {
    const next = fn(card, traced);
    const from = labelOfTrace(traced);
    const to = labelOfTrace(next);
    if (from && to && from !== to) out.push({ id: "label_override", rule, from, to });
    traced = next;
  }
  return out;
}

export function shownTrace(card) {
  const base = shownStateBase(card);
  const status = completionEffect(card);
  const raised = status && !LOUD.has(base.state)
    ? { state: status, branch: "completionEffect" }
    : base;
  const traced = applyContextRole(card, raised);
  const supported = applyStatusSupport(card, traced);
  const decided = applyReaderSupportedIncomplete(card, applyReaderDecides(card, supported));
  return { state: decided.state, branch: decided.branch, setBy: setByOf(decided) };
}

export function shownState(card) {
  return shownTrace(card).state;
}

export function shownTier(state) {
  if (state === "beyond" || state === "partial") return "light";
  if (state === "nothing_raised" || state === "nothing_to_raise") return "quiet";
  if (state === "note_withheld") return "light";
  if (state === "conflicts" || state === "not_in_source") return "demands";
  return null;
}

/**
 * The statement verdict the card stores. Same object when nothing moves.
 */
export function shownVerdict(verdict, displayVerdict) {
  if (!verdict || typeof verdict !== "object") return verdict;
  const traced = shownTrace({ statementVerdict: verdict, displayVerdict });
  if (traced.state === verdict.state && traced.branch !== "evidenceDisplay") return verdict;
  return {
    ...verdict,
    state: traced.state,
    tier: shownTier(traced.state),
    setBy: traced.branch === "evidenceDisplay"
      ? {
          source: "display",
          branch: traced.branch,
          displayVerdict: String(displayVerdict || ""),
          prior: verdict.state,
          ...(traced.setBy.sourceName ? { sourceName: traced.setBy.sourceName, role: traced.setBy.role } : {}),
        }
      : traced.setBy,
  };
}

export function shownLabel(card) {
  const state = shownState(card);
  return SHOWN_LABELS[state] || null;
}
