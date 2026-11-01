/**
 * B462. The one endorsement list.
 * NOTE_BANNED_PHRASES in the reading contract is this list.
 * The screen reads the same records from src/utils/endorsementPhrases.js.
 * The sixteen phrases are unchanged.
 */

export const ENDORSEMENT_PHRASE_RECORDS = [
  { phrase: "confirmed", source: "\\bconfirmed\\b", flags: "i" },
  { phrase: "verified", source: "\\bverified\\b", flags: "i" },
  { phrase: "correct", source: "\\bcorrect\\b", flags: "i" },
  { phrase: "supported", source: "\\bsupported\\b", flags: "i" },
  { phrase: "confirms the statement", source: "confirms the statement", flags: "i" },
  { phrase: "confirms that", source: "confirms that", flags: "i" },
  { phrase: "source confirms", source: "source confirms", flags: "i" },
  { phrase: "aligns with", source: "aligns with", flags: "i" },
  { phrase: "aligning with", source: "aligning with", flags: "i" },
  { phrase: "the draft does not establish", source: "the draft does not establish", flags: "i" },
  { phrase: "the draft does not warrant", source: "the draft does not warrant", flags: "i" },
  { phrase: "the statement treats", source: "the statement treats", flags: "i" },
  { phrase: "without supporting context", source: "without supporting context", flags: "i" },
  { phrase: "the statement fails to", source: "the statement fails to", flags: "i" },
  { phrase: "the surrounding draft", source: "the surrounding draft", flags: "i" },
  { phrase: "do or do not establish", source: "do or do not establish", flags: "i" },
];

export function endorsementPatterns() {
  return ENDORSEMENT_PHRASE_RECORDS.map((row) => ({
    phrase: row.phrase,
    pattern: new RegExp(row.source, row.flags),
  }));
}

/** The first banned phrase in the text, or null. The text is not rewritten. */
export function endorsementHit(text) {
  const body = String(text || "");
  const hit = endorsementPatterns().find((row) => row.pattern.test(body));
  return hit ? hit.phrase : null;
}
