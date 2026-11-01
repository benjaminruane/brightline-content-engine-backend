/**
 * B462. One endorsement list, one agreement test, one equivalence filter.
 * The screen copies are named in the failure when they diverge.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";
import { ENDORSEMENT_PHRASE_RECORDS } from "../lib/qc/endorsement-phrases.mjs";
import {
  equivalencePatternRecords,
  realDifferenceRecord,
  statementTurnRecord,
} from "../lib/qc/evidence-line.mjs";
import { NOTE_BANNED_PHRASES } from "../lib/qc/reading-contract.mjs";
import { readerEvidenceSentence } from "../lib/qc/reader-reason.mjs";
import { agreementPatternRecords } from "../lib/qc/source-account.mjs";
import { ENDORSEMENT_PHRASE_RECORDS as screenPhrases } from "../../brightline-content-engine-frontend/src/utils/endorsementPhrases.js";
import {
  agreementPatternRecords as screenAgreement,
  equivalencePatternRecords as screenEquivalence,
  readerEvidenceSentence as screenSentence,
  realDifferenceRecord as screenRealDifference,
  statementTurnRecord as screenStatementTurn,
} from "../../brightline-content-engine-frontend/src/modules/drafting/readerReason.js";

const PHRASE_DRIFT = "src/utils/endorsementPhrases.js diverges from lib/qc/endorsement-phrases.mjs";
const AGREEMENT_DRIFT = "src/modules/drafting/readerReason.js diverges from lib/qc/source-account.mjs";
const EQUIVALENCE_DRIFT = "src/modules/drafting/readerReason.js diverges from lib/qc/evidence-line.mjs";

const PROBES = [
  "The source states revenue of EUR 318 million, so the figure is verified.",
  "The passage is supported by the source for this period.",
  "The source states the headcount, aligning with the sentence.",
  "The statement treats the pilot as a programme.",
  "The sentence is stated without supporting context in the passage.",
];

const pass = path.join(path.dirname(fileURLToPath(import.meta.url)), "../scripts/diagnostic/b456/pass-1.json");

function probeCard(text) {
  return {
    sentenceState: "not_in_source",
    displayVerdict: "not_supported",
    displayedEvidenceProse: text,
    statement: "Revenue was EUR 318 million.",
  };
}

describe("B462 endorsement parity", () => {
  test("the phrase list, the agreement test, and the equivalence filter are one copy", () => {
    assert.deepEqual(screenPhrases, ENDORSEMENT_PHRASE_RECORDS, PHRASE_DRIFT);
    assert.deepEqual(
      NOTE_BANNED_PHRASES.map((row) => row.phrase),
      ENDORSEMENT_PHRASE_RECORDS.map((row) => row.phrase),
      PHRASE_DRIFT,
    );
    assert.deepEqual(screenAgreement(), agreementPatternRecords(), AGREEMENT_DRIFT);
    assert.deepEqual(screenEquivalence(), equivalencePatternRecords(), EQUIVALENCE_DRIFT);
    assert.deepEqual(screenRealDifference(), realDifferenceRecord(), EQUIVALENCE_DRIFT);
    assert.deepEqual(screenStatementTurn(), statementTurnRecord(), EQUIVALENCE_DRIFT);
  });

  test("the five probe sentences are an empty reason on both sides", () => {
    for (const text of PROBES) {
      const card = probeCard(text);
      assert.equal(readerEvidenceSentence(card), "");
      assert.equal(screenSentence(card), "");
    }
  });

  test("backend and screen return the same reason for every card of the pass", () => {
    const cards = JSON.parse(readFileSync(pass, "utf8")).cards;
    assert.equal(cards.length, 261);
    for (const card of cards) {
      const backend = readerEvidenceSentence(card);
      const screen = screenSentence(card);
      assert.equal(screen === "" ? null : screen, backend === "" ? null : backend);
      assert.equal(screen || "", backend || "");
    }
  });
});
