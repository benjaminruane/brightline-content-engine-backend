/**
 * B440. A wording note is recorded and not shown.
 * A matcher explanation is copied onto the card, including after a rewrite.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { applyReadingContract, noteForReader } from "../lib/qc/reading-contract.mjs";
import { matchExplanationsFromMatches } from "../lib/qc/worked-record.mjs";

test("a wording note is stored and is not the note the reader sees", () => {
  const card = applyReadingContract(
    { statement: "The fee is USD 1 million.", displayVerdict: "supported_full" },
    {
      facts: [{ kind: "money", surface: "USD 1 million", status: "matched" }],
      note: { bucket: "wording", text: "The source writes $1mm. The claim is the same." },
    }
  );
  assert.equal(card.sentenceState, "nothing_raised");
  assert.equal(card.wordingLine, null);
  assert.equal(card.wordingNoteWithheld.count, 1);
  assert.match(card.readingNote.text, /\$1mm/);
  assert.equal(noteForReader(card.readingNote), null);
  assert.equal(noteForReader({ bucket: "conflicts", text: "The source says ten." }).text, "The source says ten.");
  assert.equal(card.displayedEvidenceProse, undefined);
});

test("a rewritten class keeps the explanation it was written for", () => {
  const rows = matchExplanationsFromMatches([
    {
      sourceIndex: 0,
      sourceLabel: "Board minutes",
      classification: "confirmed",
      preBackstopClassification: "conflicting",
      explanationFor: "conflicting",
      explanation: "The draft says 8 and the source says 11.",
    },
    {
      sourceIndex: 1,
      sourceLabel: "Accounts",
      classification: "partially_confirmed",
      explanationFor: "partially_confirmed",
      explanation: "The revenue figure is in the source. The margin is not.",
    },
    {
      sourceIndex: 2,
      classification: "confirmed",
      explanation: "No explanation provided.",
    },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].writtenFor, "conflicting");
  assert.equal(rows[0].classification, "confirmed");
  assert.equal(rows[1].writtenFor, undefined);
  assert.match(rows[1].explanation, /margin/);
});
