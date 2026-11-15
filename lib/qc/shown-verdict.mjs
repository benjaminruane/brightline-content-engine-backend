/**
 * B439. What the screen shows, once the card already holds a verdict.
 * A quiet sentence does not stay quiet when the evidence verdict is a
 * conflict or has no support. A louder reading verdict is left as it is.
 * B469. A live disagreement is not shown as a lighter label.
 * B478. A quiet card is a conflict when a later source revised the figure.
 * Support state, concerns, and marks are not read and not written.
 */
import { floorState, uncheckedLook } from "./contradiction-floor.mjs";
import { PARTIAL_UNRECORDED } from "./partial-sentence.mjs";
import { partialReason } from "./partial-reason.mjs";
import { statementClaimsDone, transactionDemand, transactionShift } from "./transaction-state.mjs";

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

/** A wording note, or a note that found nothing and recorded no gap, on a partial whose reason was not recorded. */
function wordingUnrecordedQuiet(card) {
  const bucket = String(card?.readingNote?.bucket || "").toLowerCase();
  const prose = typeof card?.displayedEvidenceProse === "string" ? card.displayedEvidenceProse.trim() : "";
  if (prose !== PARTIAL_UNRECORDED) return false;
  if (bucket === "wording") return true;
  if (bucket !== "none") return false;
  const recorded = typeof partialReason(card) === "string" ? partialReason(card).trim() : "";
  return recorded === "" || recorded === PARTIAL_UNRECORDED;
}

const LOUD = new Set(["conflicts", "not_in_source", "note_withheld"]);

/** pending raises to a disagreement, and predates is a light addition, only when the statement says the deal is done. A loud card stays loud. */
export function completionEffect(card) {
  const raw = String(card?.readingNote?.completion || "").trim().toLowerCase();
  if (raw !== "pending" && raw !== "predates") return "";
  if (!statementClaimsDone(card?.statement)) return "";
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

function shownStateBase(card) {
  if (bothReadingsSupport(card)) return { state: "nothing_raised", branch: "bothReadingsSupport" };
  if (wordingUnrecordedQuiet(card)) return { state: "nothing_raised", branch: "wordingUnrecorded" };
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
  const sourceName = typeof row.sourceLabel === "string" && row.sourceLabel.trim() ? row.sourceLabel.trim() : "";
  return { sourceName, role: roleOf(row) };
}

/**
 * A conflicts state whose only disagreeing evidence is a context source.
 * A facts source that supports the statement clears it. No facts source
 * speaking to it is needs a look. A facts source that disagrees stays conflicts.
 */
function applyContextRole(card, traced) {
  if (traced.state !== "conflicts") return { ...traced, source: null };
  const matches = Array.isArray(card?.matchExplanations) ? card.matchExplanations : [];
  const conflicting = matches.filter((row) => row?.classification === "conflicting" && row?.writtenFor !== "confirmed");
  const factsConflict = conflicting.filter((row) => roleOf(row) === "facts");
  const contextConflict = conflicting.filter((row) => roleOf(row) === "context");
  if (!contextConflict.length || factsConflict.length) {
    return { ...traced, source: sourceOf(factsConflict[0] || conflicting[0]) };
  }
  const factsSupport = matches.filter((row) => (
    roleOf(row) === "facts"
    && (row.classification === "confirmed" || row.classification === "partially_confirmed")
  ));
  if (factsSupport.length) {
    return { state: "nothing_raised", branch: traced.branch, source: sourceOf(factsSupport[0]) };
  }
  return { state: "note_withheld", branch: traced.branch, source: sourceOf(contextConflict[0]) };
}

function setByOf(traced) {
  const setBy = { branch: traced.branch };
  if (traced.source?.sourceName) setBy.sourceName = traced.source.sourceName;
  if (traced.source?.role) setBy.role = traced.source.role;
  if (traced.branch === "evidenceDisplay") setBy.source = "display";
  return setBy;
}

export function shownTrace(card) {
  const base = shownStateBase(card);
  const status = completionEffect(card);
  const raised = status && !LOUD.has(base.state)
    ? { state: status, branch: "completionEffect" }
    : base;
  const traced = applyContextRole(card, raised);
  return { state: traced.state, branch: traced.branch, setBy: setByOf(traced) };
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
