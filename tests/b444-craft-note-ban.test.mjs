/**
 * B444. The craft note has its own ban. The evidence ban is unchanged.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { craftNoteEndorsement } from "../lib/qc/craft-note-ban.mjs";
import { NOTE_BANNED_PHRASES, WRITER_FEEDBACK_PROMPT, noteEndorsement } from "../lib/qc/reading-contract.mjs";

describe("B444 craft note ban", () => {
  test("ordinary editorial words are shown", () => {
    for (const word of ["correct", "supported", "confirmed", "verified"]) {
      const note = `The close is ${word}, and the opening is the weak line.`;
      assert.equal(craftNoteEndorsement(note), null, word);
      assert.equal(noteEndorsement(note), word);
    }
  });

  test("talking about the draft is shown", () => {
    assert.equal(
      craftNoteEndorsement("The draft does not establish a reason for the second half."),
      null
    );
    assert.equal(craftNoteEndorsement("The surrounding draft repeats the same claim."), null);
  });

  test("a claim that the evidence check passed is withheld, and the phrase is the list entry", () => {
    assert.equal(
      craftNoteEndorsement("The source confirms the revenue line."),
      "the source confirms"
    );
    assert.equal(
      craftNoteEndorsement("The figures are verified against the source."),
      "verified against the source"
    );
    assert.equal(craftNoteEndorsement("This aligns with the source on the date."), "aligns with the source");
  });

  test("the evidence list is unchanged, and the writer prompt no longer bans ordinary editorial words", () => {
    assert.equal(NOTE_BANNED_PHRASES.some((row) => row.phrase === "confirmed"), true);
    assert.equal(NOTE_BANNED_PHRASES.some((row) => row.phrase === "the draft does not establish"), true);
    assert.match(WRITER_FEEDBACK_PROMPT, /Do not claim the draft has been checked against the source/);
    assert.match(WRITER_FEEDBACK_PROMPT, /Do not comment on the draft's punctuation, number formatting, or house style/);
    assert.doesNotMatch(WRITER_FEEDBACK_PROMPT, /plain hyphens, never a long dash/);
    assert.doesNotMatch(WRITER_FEEDBACK_PROMPT, /Do not call the draft confirmed/);
  });

  test("a missing text is loud", () => {
    assert.throws(() => craftNoteEndorsement(undefined), /text is missing/);
  });
});
