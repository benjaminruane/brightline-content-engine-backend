/**
 * B439. What the screen shows, once the card already holds a verdict.
 * A quiet sentence does not stay quiet when the evidence verdict is a
 * conflict or has no support. A louder reading verdict is left as it is.
 * Support state, concerns, and marks are not read and not written.
 */

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

function displaySlug(card) {
  return String(card?.displayVerdict ?? "").toLowerCase().trim();
}

export function readingState(card) {
  const fromVerdict = card?.statementVerdict?.state;
  if (typeof fromVerdict === "string" && fromVerdict) return fromVerdict;
  if (typeof card?.sentenceState === "string" && card.sentenceState) return card.sentenceState;
  return "";
}

export function shownState(card) {
  const state = readingState(card);
  if (!QUIET.has(state)) return state;
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
