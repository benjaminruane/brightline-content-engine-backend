/**
 * B461. A raised verdict shows a sentence the card already holds.
 * The export uses that same sentence. A wording note stays hidden.
 * A string that fails the endorsement guard is not shown.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { evidenceFindingForExport } from "../lib/qc/export-review-data.mjs";
import { cardEvidenceFindings } from "../lib/qc/evidence-findings.mjs";
import { readerEvidenceAccount } from "../lib/qc/reader-reason.mjs";
import { classifyCard, summariseReview } from "../lib/qc/review-summary.mjs";
import { summaryBulletsFromReview } from "../lib/qc/summary-bullets.mjs";

test("the export uses the sentence already on the card", () => {
  const card = {
    statement: "Exceptional unit economics.",
    sentenceState: "beyond",
    displayVerdict: "supported_partial",
    displayedEvidenceProse: "The source discusses organic growth and does not call the economics exceptional.",
    sourceAccount: true,
    sourceDifference: "The sentence says \"exceptional unit economics\". The passage does not.",
  };
  const account = readerEvidenceAccount(card);
  assert.equal(account.text, card.displayedEvidenceProse);
  assert.equal(evidenceFindingForExport(card, false), card.displayedEvidenceProse);
  assert.equal(card.sentenceState, "beyond");
  assert.equal(card.displayVerdict, "supported_partial");
});

test("a stored difference is the reason when the prose field is empty", () => {
  const card = {
    sentenceState: "conflicts",
    sentenceLabel: "Conflicts with the source",
    displayVerdict: "conflict",
    sourceDifference: "The sentence says \"four years\". The passage says \"three years\".",
  };
  const account = readerEvidenceAccount(card);
  assert.equal(account.source, "stored");
  assert.equal(account.text, card.sourceDifference);
  assert.equal(evidenceFindingForExport(card, false), card.sourceDifference);
  assert.equal(card.sentenceLabel, "Conflicts with the source");
});

test("a wording note stays hidden and the source half is the reason", () => {
  const note = "The source states customers increased from 5,500 to 10,000. The statement conveys the same figures using a different separator.";
  const card = {
    sentenceState: "not_in_source",
    readingNote: { bucket: "wording", text: note },
    wordingNoteWithheld: { count: 1, text: note },
  };
  const account = readerEvidenceAccount(card);
  assert.equal(account.source, "clause");
  assert.equal(account.text, "The source states customers increased from 5,500 to 10,000.");
  assert.equal(account.text.includes("same figures"), false);
  assert.notEqual(account.text, note);
});

test("an agreement note is not the reason, and the stored passage is", () => {
  const card = {
    sentenceState: "not_in_source",
    readingNote: { bucket: "wording", text: "The source confirms the statement as stated." },
    sourceQuote: "Occupancy is 96 percent.",
  };
  const account = readerEvidenceAccount(card);
  assert.equal(account.source, "quote");
  assert.equal(account.text, "The source states \"Occupancy is 96 percent.\"");
  assert.equal(account.text.includes("confirms"), false);
});

test("a certifying sentence stays withheld", () => {
  const card = {
    sentenceState: "beyond",
    sourceDifference: "The draft does not establish the total.",
    sourceQuote: "Revenue was 10.",
  };
  const account = readerEvidenceAccount(card);
  assert.equal(account.text, "The source states \"Revenue was 10.\"");
  assert.equal(account.withheld.length, 1);
  assert.equal(account.withheld[0].phrase, "the draft does not establish");
  assert.equal(account.text.includes("does not establish"), false);
});

test("a beyond card is in To look at", () => {
  const cls = classifyCard(
    { sentenceState: "beyond", displayVerdict: "supported_partial", editorialVerdict: "clean", complianceVerdict: "clean" },
    { evidenceEnabled: true, editorialEnabled: true, complianceEnabled: true },
  );
  assert.equal(cls.evidence, "beyond");
  assert.equal(cls.needsAttention, true);
});

test("every non-zero check is its own summary line", () => {
  const summary = summariseReview([
    { sentenceState: "not_in_source", displayVerdict: "not_supported" },
    { sentenceState: "conflicts", displayVerdict: "conflict" },
    { sentenceState: "beyond", displayVerdict: "supported_partial" },
    { sentenceState: "partial", displayVerdict: "supported_partial" },
    { sentenceState: "nothing_raised", displayVerdict: "supported_full", editorialVerdict: "concern" },
  ], { evidenceEnabled: true, editorialEnabled: true, complianceEnabled: true });
  const bullets = summaryBulletsFromReview(summary);
  assert.equal(bullets.length, 6);
  assert.equal(bullets.some((line) => /not shown/.test(line)), false);
  assert.equal(bullets.some((line) => /editorial notes/.test(line)), true);
  assert.equal(bullets.some((line) => /could not be fully checked/.test(line)), true);
});

test("a partial headline carries the stored partial sentence", () => {
  const card = {
    statement: "HPC has a credible M&A roadmap.",
    displayVerdict: "supported_partial",
    sentenceState: "beyond",
    partialGround: { recorded: true, source: "evidence_summary", text: "The source does not mention a 'credible M&A roadmap.'" },
  };
  const findings = cardEvidenceFindings(card, []);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, "partial");
  assert.equal(findings[0].note, "");
  assert.match(readerEvidenceAccount(card).text, /credible M&A roadmap/);
  assert.equal(card.sentenceState, "beyond");
  assert.equal(card.displayVerdict, "supported_partial");
});
