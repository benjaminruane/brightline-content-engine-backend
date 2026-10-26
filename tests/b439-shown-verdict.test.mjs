import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { applyReadingContract, draftHeader } from "../lib/qc/reading-contract.mjs";
import { evidenceFindingForExport, buildReviewData } from "../lib/qc/export-review-data.mjs";
import { summariseReview } from "../lib/qc/review-summary.mjs";
import { summaryBulletsFromReview } from "../lib/qc/summary-bullets.mjs";
import { shownLabel, shownState, shownVerdict } from "../lib/qc/shown-verdict.mjs";
import { statementVerdict } from "../lib/qc/statement-verdict.mjs";

const OPTIONS = { evidenceEnabled: true, editorialEnabled: true, complianceEnabled: true };

describe("B439 the screen uses the verdict it already holds", () => {
  test("a quiet sentence takes a conflict that is already on the card", () => {
    const reading = statementVerdict({ facts: [{ status: "matched", surface: "12" }], note: null, entries: [] });
    const shown = shownVerdict(reading, "conflict");
    assert.equal(reading.state, "nothing_raised");
    assert.equal(shown.state, "conflicts");
    assert.equal(shown.tier, "demands");
    assert.equal(shown.setBy.source, "display");
    assert.equal(shownLabel({ statementVerdict: reading, displayVerdict: "conflict" }), "Conflicts with the source");
  });

  test("a quiet sentence takes no support that is already on the card", () => {
    const reading = statementVerdict({ facts: [{ status: "matched", surface: "12" }], note: null, entries: [] });
    const shown = shownVerdict(reading, "not_supported");
    assert.equal(shown.state, "not_in_source");
    assert.equal(shown.tier, "demands");
  });

  test("a beyond note is not overwritten by a conflict", () => {
    const reading = statementVerdict({
      facts: [{ status: "matched", surface: "12" }],
      note: { bucket: "beyond", text: "The source stops earlier." },
      entries: [],
    });
    assert.equal(shownVerdict(reading, "conflict").state, "beyond");
  });

  test("the card stores the shown verdict and does not move support", () => {
    const card = applyReadingContract(
      {
        statement: "Twelve employees.",
        displayVerdict: "conflict",
        supportState: "conflicting",
        editorialConcerns: [],
        editorialVerdict: "clean",
        complianceConcerns: [],
        complianceVerdict: "clean",
      },
      { facts: [{ status: "matched", surface: "12" }], note: null }
    );
    assert.equal(card.supportState, "conflicting");
    assert.equal(card.displayVerdict, "conflict");
    assert.equal(card.sentenceLabel, "Conflicts with the source");
    assert.equal(card.tier, "demands");
    assert.equal(card.editorialConcerns.length, 0);
  });

  test("the header names a conflict that sits beside a missing fact", () => {
    const header = draftHeader([
      { sentenceState: "not_in_source", facts: [{ status: "not_found" }], note: null },
      { sentenceState: "conflicts", facts: [{ status: "matched" }], note: null },
    ]);
    assert.match(header.line, /1 fact is not in the source/);
    assert.match(header.line, /1 statement conflicts with the source/);
  });

  test("beyond is not renamed partial, and nothing raised is not renamed backed", () => {
    const summary = summariseReview([
      {
        statementVerdict: { state: "beyond" },
        displayVerdict: "supported_full",
        editorialVerdict: "clean",
        complianceVerdict: "clean",
      },
      {
        statementVerdict: { state: "nothing_raised" },
        displayVerdict: "supported_full",
        editorialVerdict: "clean",
        complianceVerdict: "clean",
      },
    ], OPTIONS);
    assert.equal(summary.evidence.beyond, 1);
    assert.equal(summary.evidence.partial, 0);
    assert.equal(summary.evidence.confirmed, 0);
    assert.equal(summary.evidence.nothingRaised, 1);
    assert.equal(summary.readiness, "Minor points to address");
    const bullets = summaryBulletsFromReview(summary);
    assert.match(bullets[0], /goes beyond the source/);
    assert.equal(bullets.some((line) => /partial support|backed by sources/i.test(line)), false);
  });

  test("the export uses the sentence the card shows", () => {
    const card = {
      statement: "Twelve employees.",
      displayVerdict: "conflict",
      statementVerdict: { state: "nothing_raised", tier: "quiet" },
      displayedEvidenceProse: "The source says eleven.",
      reasoningParagraph: "",
      supportState: "conflicting",
    };
    assert.equal(shownState(card), "conflicts");
    assert.equal(evidenceFindingForExport(card, false), "The source says eleven.");
    const review = buildReviewData({ statements: [{ qcCard: card }] }, OPTIONS);
    assert.equal(review.statements[0].verdict, "Conflicts with the source");
    assert.equal(review.statements[0].evidenceFinding, "The source says eleven.");
  });
});
