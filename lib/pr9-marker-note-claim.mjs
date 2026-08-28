/**
 * Note-claim classification for Pr9 markers. Deterministic; no model call.
 * Shared by production honesty (lib/pr9-marker-honesty.mjs) and the diagnostic
 * consistency harness (scripts/diagnostic/lib/pr9-marker-consistency.mjs).
 *
 * Whole-word match on a closed verb list, not stems. "cutting" in "consider
 * cutting" is not "cut". Mixed keep+change language is AMBIGUOUS so honesty
 * note-vs-intent flags only fire on pure keep or pure change notes.
 */

export const CHANGE_VERBS = [
  "removed",
  "changed",
  "replaced",
  "corrected",
  "softened",
  "cut",
  "dropped",
  "reworded",
  "qualified",
  "added",
];

const CHANGE_VERB_RE = new RegExp(`\\b(?:${CHANGE_VERBS.join("|")})\\b`, "i");
// "no change was made" is the generated what-clause from
// lib/pr9-note-what-from-diff.mjs. Recognising it here lets honesty's
// note_intent_mismatch branch flip the intent and keep the generated note,
// instead of the later contradiction path rewriting an already-accurate note.
const KEEP_RE =
  /\bkept\b|\bretained\b|\bleft in place\b|\bleave in place\b|\bleaving in place\b|\bleaves in place\b|\bleft this wording as written\b|\bleft this wording alone\b|\bno change was made\b/i;
const CONFIRM_ONLY_RE =
  /^(?:confirm(?:\s+this(?:\s+softer)?\s+formulation)?(?:\s+before\s+publishing)?[.!?]*)?$/i;

export const NOTE_CLAIMS_CHANGE = "CLAIMS_A_CHANGE";
export const NOTE_CLAIMS_NO_CHANGE = "CLAIMS_NO_CHANGE";
export const NOTE_AMBIGUOUS = "AMBIGUOUS";

function noteBodyWithoutCloser(note) {
  return String(note || "")
    .replace(/\s*Confirm before publishing\.?\s*$/i, "")
    .trim();
}

/**
 * @param {string} note
 * @returns {"CLAIMS_A_CHANGE"|"CLAIMS_NO_CHANGE"|"AMBIGUOUS"}
 */
export function classifyNoteClaim(note) {
  const raw = typeof note === "string" ? note.trim() : "";
  if (!raw) return NOTE_CLAIMS_NO_CHANGE;

  const claimsChange = CHANGE_VERB_RE.test(raw);
  const claimsKeep = KEEP_RE.test(raw);
  if (claimsChange && claimsKeep) return NOTE_AMBIGUOUS;
  if (claimsChange) return NOTE_CLAIMS_CHANGE;
  if (claimsKeep) return NOTE_CLAIMS_NO_CHANGE;

  const body = noteBodyWithoutCloser(raw);
  if (!body || CONFIRM_ONLY_RE.test(body)) return NOTE_CLAIMS_NO_CHANGE;
  return NOTE_AMBIGUOUS;
}
