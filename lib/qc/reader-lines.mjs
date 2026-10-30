/**
 * Ben's words. Overwrite these.
 * One block. The screen prints these lines and does not invent its own.
 */

export const READER_LINES = Object.freeze({
  noteWithheld:
    "A note was written for this sentence and could not be shown. That does not mean there was nothing to say.",
  noteCleared:
    "A note was written for this sentence and was not kept.",
  writerWithheld:
    "A note on the draft was written and could not be shown. That does not mean there was nothing to say.",
});

/**
 * The sentence under a label whose note was stripped.
 * Empty when the note still has text, so a wording note is not copied here.
 * The silence id is the stored record of the strip. It is not shown.
 */
export function clearedNoteSentence(card) {
  const note = card?.readingNote;
  const text = typeof note?.text === "string" ? note.text.trim() : "";
  if (text) return "";
  const cleared = note?.reassuranceCleared === true
    || (Array.isArray(card?.silences) && card.silences.some((row) => row?.id === "reassurance_stripped"));
  return cleared ? READER_LINES.noteCleared : "";
}
