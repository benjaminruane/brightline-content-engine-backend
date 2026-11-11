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
import { transactionDemand } from "./transaction-state.mjs";

export const SHOWN_LABELS = Object.freeze({
  not_in_source: "Not in the source",
  conflicts: "Conflicts with the source",
  beyond: "Goes beyond the source",
  partial: "Partly in the source",
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

/** A wording note on a partial whose reason was not recorded. Paraphrase stays quiet. */
function wordingUnrecordedQuiet(card) {
  const bucket = String(card?.readingNote?.bucket || "").toLowerCase();
  if (bucket !== "wording") return false;
  const prose = typeof card?.displayedEvidenceProse === "string" ? card.displayedEvidenceProse.trim() : "";
  return prose === PARTIAL_UNRECORDED;
}

export function shownState(card) {
  if (bothReadingsSupport(card)) return "nothing_raised";
  if (wordingUnrecordedQuiet(card)) return "nothing_raised";
  const floored = floorState(card);
  if (floored) return floored;
  if (uncheckedLook(card)) return "note_withheld";
  if (transactionDemand(card)) return "conflicts";
  const state = readingState(card);
  if (!QUIET.has(state)) return state;
  if (revisionRaises(card)) return "conflicts";
  const display = displaySlug(card);
  if (display === "conflict" || display === "conflicts" || display === "conflicting") return "conflicts";
  if (display === "not_supported" || display === "no_clear_support") return "not_in_source";
  if (display === "supported_partial" || display === "partially_confirmed") return "partial";
  return state;
}

export function shownTier(state) {
  if (state === "beyond" || state === "partial") return "light";
  if (state === "nothing_raised" || state === "nothing_to_raise") return "quiet";
  if (state === "conflicts" || state === "not_in_source" || state === "note_withheld") return "demands";
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
