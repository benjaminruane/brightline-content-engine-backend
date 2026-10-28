/**
 * B444. The craft note talks about the writing. It is not the per-sentence
 * evidence note, and it is not checked against NOTE_BANNED_PHRASES.
 * This list bans only a claim that the evidence check passed.
 * A bare word such as confirmed, verified, correct, or supported is ordinary
 * editorial English and is not on this list.
 */

export const CRAFT_NOTE_BANNED_PHRASES = [
  { phrase: "the source confirms", pattern: /the source confirms/i },
  { phrase: "confirms the statement", pattern: /confirms the statement/i },
  { phrase: "verified against the source", pattern: /verified against the source/i },
  { phrase: "verified by the source", pattern: /verified by the source/i },
  { phrase: "the figures are verified", pattern: /the figures are verified/i },
  { phrase: "figures are verified", pattern: /figures are verified/i },
  { phrase: "supported by the source", pattern: /supported by the source/i },
  { phrase: "the source supports", pattern: /the source supports/i },
  { phrase: "confirmed by the source", pattern: /confirmed by the source/i },
  { phrase: "confirmed against the source", pattern: /confirmed against the source/i },
  { phrase: "aligns with the source", pattern: /aligns with the source/i },
  { phrase: "the source verifies", pattern: /the source verifies/i },
  { phrase: "evidence confirms", pattern: /evidence confirms/i },
  { phrase: "the evidence check passed", pattern: /the evidence check passed/i },
  { phrase: "source confirms", pattern: /\bsource confirms\b/i },
];

/** The phrase that asserts the evidence check passed, or null. */
export function craftNoteEndorsement(text) {
  if (typeof text !== "string") throw new Error("craftNoteEndorsement: text is missing");
  const hit = CRAFT_NOTE_BANNED_PHRASES.find((row) => row.pattern.test(text));
  return hit ? hit.phrase : null;
}
