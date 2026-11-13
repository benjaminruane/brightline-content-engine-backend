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
  if (bothReadingsSupport(card)) return "nothing_raised";
  if (wordingUnrecordedQuiet(card)) return "nothing_raised";
  const floored = floorState(card);
  if (floored) return floored;
  if (refusedReading(card)) {
    if (transactionShift(card)) return "conflicts";
    if (evidenceBacked(card)) return "note_withheld";
  } else if (uncheckedLook(card)) {
    return "note_withheld";
  } else if (transactionDemand(card)) {
    return "conflicts";
  }
  const state = readingState(card);
  const refusedQuiet = refusedReading(card) && (state === "note_withheld" || QUIET.has(state));
  if (state && !QUIET.has(state) && !refusedQuiet) return state;
  if (refusedQuiet) {
    const fromDisplay = evidenceFromDisplay(card);
    if (fromDisplay) return fromDisplay;
    return QUIET.has(state) ? state : "nothing_raised";
  }
  if (revisionRaises(card)) return "conflicts";
  const fromDisplay = evidenceFromDisplay(card);
  if (fromDisplay) return fromDisplay;
  return state;
}

export function shownState(card) {
  const base = shownStateBase(card);
  const status = completionEffect(card);
  if (!status || LOUD.has(base)) return base;
  return status;
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
  const state = shownState({ statementVerdict: verdict, displayVerdict });
  if (state === verdict.state) return verdict;
  return {
    ...verdict,
    state,
    tier: shownTier(state),
    setBy: {
      source: "display",
      displayVerdict: String(displayVerdict || ""),
      prior: verdict.state,
    },
  };
}

export function shownLabel(card) {
  const state = shownState(card);
  return SHOWN_LABELS[state] || null;
}
