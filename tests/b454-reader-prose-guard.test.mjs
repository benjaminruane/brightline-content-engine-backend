/**
 * B454. Reader-facing prose passes the endorsement guard once.
 * A failing string is not rewritten. The reading note and the craft note
 * stay on their own guards.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { craftNoteEndorsement } from "../lib/qc/craft-note-ban.mjs";
import { PARTIAL_UNRECORDED } from "../lib/qc/partial-sentence.mjs";
import {
  READER_PROSE_SILENCE,
  releaseReaderProse,
  sealReaderCard,
} from "../lib/qc/reader-prose-guard.mjs";
import { NOTE_BANNED_PHRASES, acceptNote } from "../lib/qc/reading-contract.mjs";

const BANNED = [
  "confirmed",
  "verified",
  "correct",
  "supported",
  "confirms the statement",
  "confirms that",
  "source confirms",
  "aligns with",
  "aligning with",
  "the draft does not establish",
  "the draft does not warrant",
  "the statement treats",
  "without supporting context",
  "the statement fails to",
  "the surrounding draft",
  "do or do not establish",
];

test("the endorsement list is unchanged", () => {
  assert.deepEqual(NOTE_BANNED_PHRASES.map((row) => row.phrase), BANNED);
});

test("failing prose becomes the unrecorded line and names the phrase", () => {
  const released = releaseReaderProse("The source confirms that both founders are first-time founders.");
  assert.equal(released.withheld, true);
  assert.equal(released.phrase, "confirms that");
  assert.equal(released.text, PARTIAL_UNRECORDED);
});

test("prose that passes is returned as written", () => {
  const text = "The source does not mention the fee.";
  const released = releaseReaderProse(text);
  assert.equal(released.withheld, false);
  assert.equal(released.phrase, null);
  assert.equal(released.text, text);
});

test("an empty string stays empty", () => {
  assert.deepEqual(releaseReaderProse(""), { text: "", withheld: false, phrase: null });
  assert.deepEqual(releaseReaderProse("  "), { text: "  ", withheld: false, phrase: null });
  assert.deepEqual(releaseReaderProse(null), { text: "", withheld: false, phrase: null });
});

test("a partial card loses the endorsing sentence and keeps its verdict", () => {
  const explanation = "The source confirms that the user demographic is unusual.";
  const card = {
    statement: "The user demographic is unusual.",
    displayVerdict: "supported_partial",
    supportState: "partial",
    sentenceState: "partial",
    sentenceLabel: "Partly in the source",
    tier: "light",
    statementVerdict: { state: "partial", tier: "light" },
    evidenceSummary: explanation,
    matchExplanations: [{
      explanation,
      classification: "partially_confirmed",
      writtenFor: "partially_confirmed",
    }],
    readingNote: { bucket: "none", text: "" },
  };
  const sealed = sealReaderCard(card);
  assert.equal(sealed.displayedEvidenceProse, PARTIAL_UNRECORDED);
  assert.equal(sealed.displayVerdict, "supported_partial");
  assert.equal(sealed.sentenceState, "partial");
  assert.equal(sealed.sentenceLabel, "Partly in the source");
  assert.equal(sealed.tier, "light");
  assert.equal(sealed.evidenceSummary, explanation);
  assert.equal(sealed.matchExplanations[0].explanation, explanation);
  assert.equal(sealed.readingNote.text, "");
  const silence = sealed.silences.find((row) => row.field === "partialSentence");
  assert.equal(silence.id, READER_PROSE_SILENCE);
  assert.equal(silence.reason, "confirms that");
  assert.equal(silence.count, 1);
  const again = sealReaderCard(sealed);
  const partialSilences = again.silences.filter((row) => row.field === "partialSentence");
  assert.equal(partialSilences.length, 1);
});

test("a concern that fails is replaced and the concern stays", () => {
  const card = {
    displayVerdict: "supported_full",
    sentenceState: "nothing_raised",
    sentenceLabel: "Nothing raised",
    tier: "quiet",
    editorialConcerns: [{ concernCode: "materiality", text: "The claim is supported by the draft." }],
  };
  const sealed = sealReaderCard(card);
  assert.equal(sealed.editorialConcerns.length, 1);
  assert.equal(sealed.editorialConcerns[0].concernCode, "materiality");
  assert.equal(sealed.editorialConcerns[0].text, PARTIAL_UNRECORDED);
  assert.equal(sealed.sentenceState, "nothing_raised");
  assert.equal(sealed.tier, "quiet");
});

test("the reading note and the craft note stay on their own guards", () => {
  const card = {
    displayVerdict: "supported_full",
    sentenceState: "nothing_raised",
    sentenceLabel: "Nothing raised",
    tier: "quiet",
    readingNote: { bucket: "beyond", text: "The source names a different fee." },
    writerFeedback: "The source confirms the opening.",
  };
  const sealed = sealReaderCard(card);
  assert.equal(sealed.readingNote.text, "The source names a different fee.");
  assert.equal(sealed.writerFeedback, "The source confirms the opening.");
  const refused = acceptNote({ bucket: "beyond", text: "The source confirms the statement." }, []);
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, "endorsing_language");
  assert.equal(craftNoteEndorsement("The source confirms the opening."), "the source confirms");
});
