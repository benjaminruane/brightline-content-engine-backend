/**
 * B453. A partial card carries the partial sentence as a finding.
 * An evidence summary is read the same way as a stage 2 explanation.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { cardEvidenceFindings, shownEvidenceProse } from "../lib/qc/evidence-findings.mjs";
import { PARTIAL_UNRECORDED, partialSentence } from "../lib/qc/partial-sentence.mjs";
import { READER_LINES } from "../lib/qc/reader-lines.mjs";

const summary = "The source does not mention a 'credible M&A roadmap,' which creates a gap in the statement. It does confirm the rest.";

test("a partial card carries one finding and the summary names the gap", () => {
  const card = {
    statement: "HPC has a credible M&A roadmap.",
    displayVerdict: "supported_partial",
    statementVerdict: { state: "partial", tier: "light" },
    sentenceState: "partial",
    partialGround: { recorded: true, source: "evidence_summary", text: summary },
  };
  const said = partialSentence(card);
  assert.match(said, /credible M&A roadmap/);
  assert.equal(said.includes("was not recorded"), false);
  const findings = cardEvidenceFindings(card, []);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, "partial");
  assert.equal(findings[0].note, said);
});

test("a louder card does not gain a partial finding", () => {
  const card = {
    statement: "Revenue grew.",
    displayVerdict: "supported_partial",
    statementVerdict: { state: "not_in_source", tier: "demands" },
    sentenceState: "not_in_source",
    partialGround: { recorded: true, source: "evidence_summary", text: summary },
  };
  assert.equal(cardEvidenceFindings(card, []).length, 0);
});

test("a missing explanation is still the unrecorded line", () => {
  assert.equal(partialSentence({ displayVerdict: "supported_partial" }), PARTIAL_UNRECORDED);
});

test("a stripped note keeps its label and carries a sentence that does not talk about the source", () => {
  const card = {
    statement: "The pathway has matured.",
    displayVerdict: "supported_full",
    statementVerdict: { state: "not_in_source", tier: "demands" },
    sentenceState: "not_in_source",
    sentenceLabel: "Not in the source",
    readingNote: { bucket: "wording", text: "", reassuranceCleared: true },
    silences: [{ id: "reassurance_stripped", reason: "reassurance", count: 1 }],
  };
  const line = shownEvidenceProse(card, "not_in_source", "");
  assert.equal(line, READER_LINES.noteCleared);
  assert.equal(line.includes("source"), false);
  assert.equal(card.sentenceState, "not_in_source");
  assert.equal(card.sentenceLabel, "Not in the source");
});
