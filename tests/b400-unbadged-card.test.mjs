/**
 * B400. A card can carry a note with no factual badge.
 * Missing or true keeps today's badge. False is the residue class only.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "vitest";
import {
  evidenceCountClass,
  evidenceDisplayVerdictLabel,
  normalizeExportVerdict,
} from "../lib/qc/evidence-display-verdict.mjs";
import { buildReviewData, renderCanonicalExportText } from "../lib/qc/export-review-data.mjs";
import { PARTIAL_UNRECORDED } from "../lib/qc/partial-sentence.mjs";
import { summariseReview } from "../lib/qc/review-summary.mjs";
import { sourceSpokeTestsFired } from "../lib/revise-actions/silence.mjs";
import {
  factualBadgeForStatement,
  isUnbadgedResidueEnabled,
  statementIsFactualResidue,
} from "../lib/qc/pipeline-v3/stage7-assemble-card.mjs";

const ON = { evidenceEnabled: true, editorialEnabled: true, complianceEnabled: true };

const TODAY = [
  ["supported_full", "Nothing raised", "confirmed"],
  ["supported_partial", "Partly in the source", "partial"],
  ["conflict", "Conflicting", "conflicting"],
  ["not_supported", "No support", "notSupported"],
  ["unverifiable", "Unverifiable", "unverifiable"],
  ["not reviewed", "Not reviewed", "notChecked"],
];

function unbadgedCard() {
  return {
    statement: "Year to date like-for-like trading remains healthy.",
    displayVerdict: "supported_full",
    supportState: "supported",
    factualBadge: false,
    reasoningParagraph: "The source confirms the trading line in its own words.",
    commentaryNotReviewed: false,
    concernLevel: "none",
    editorialVerdict: "clean",
    complianceVerdict: "clean",
  };
}

describe("B400 unbadged card", () => {
  test("T1 factualBadge false has no label and counts as unbadged", () => {
    const card = unbadgedCard();
    assert.equal(evidenceDisplayVerdictLabel(card.displayVerdict, card), "");
    assert.equal(evidenceCountClass(card.displayVerdict, card), "unbadged");
    assert.equal(normalizeExportVerdict(card.displayVerdict, card), null);
  });

  test("T2 the export cell is empty and the note is present", () => {
    const card = unbadgedCard();
    const qcResult = { statements: [{ qcCard: card }] };
    const review = buildReviewData(qcResult, ON);
    assert.equal(review.statements[0].verdict, null);
    assert.equal(card.reasoningParagraph, "The source confirms the trading line in its own words.");
    assert.equal(review.statements[0].evidenceFinding, PARTIAL_UNRECORDED);
    const text = renderCanonicalExportText({
      qcResult,
      reviewOptions: ON,
      qualityReviewSummary: { readiness: "Ready", bullets: [] },
    });
    assert.equal(text.includes("Verdict:"), false);
    assert.equal(text.includes("Not checked"), false);
    assert.equal(text.includes(`Evidence finding: ${PARTIAL_UNRECORDED}`), true);
    assert.equal(text.includes("The source confirms the trading line"), false);
  });

  test("T3 a missing factualBadge keeps today's label and class", () => {
    for (const [slug, label, cls] of TODAY) {
      assert.equal(evidenceDisplayVerdictLabel(slug), label, slug);
      assert.equal(evidenceDisplayVerdictLabel(slug, {}), label, slug);
      assert.equal(evidenceCountClass(slug), cls, slug);
      assert.equal(evidenceCountClass(slug, { displayVerdict: slug }), cls, slug);
      const card = { displayVerdict: slug, editorialVerdict: "clean", complianceVerdict: "clean" };
      const summary = summariseReview([card], ON);
      if (cls === "confirmed") assert.equal(summary.evidence.confirmed, 1);
      if (cls === "partial") assert.equal(summary.evidence.partial, 1);
      if (cls === "conflicting") assert.equal(summary.evidence.conflicting, 1);
      if (cls === "notSupported") assert.equal(summary.evidence.notSupported, 1);
      if (cls === "unverifiable" || cls === "notChecked") assert.equal(summary.notChecked, 1);
      assert.equal(summary.evidence.unbadged, 0, slug);
    }
  });

  test("T4 an unbadged card is not a silence conflict", () => {
    const unbadged = {
      displayVerdict: "conflict",
      supportState: "supported",
      factualBadge: false,
      hasConflict: false,
    };
    assert.equal(sourceSpokeTestsFired(unbadged).includes("supportState_conflicting"), false);
    const badged = { displayVerdict: "conflict", supportState: "supported" };
    assert.equal(sourceSpokeTestsFired(badged).includes("supportState_conflicting"), true);
  });

  test("not reviewed stays a miss when the field is false", () => {
    const card = { displayVerdict: "not reviewed", factualBadge: false, commentaryNotReviewed: true };
    assert.equal(evidenceDisplayVerdictLabel(card.displayVerdict, card), "Not reviewed");
    assert.equal(evidenceCountClass(card.displayVerdict, card), "notChecked");
    const summary = summariseReview([card], ON);
    assert.equal(summary.notChecked, 1);
    assert.equal(summary.evidence.unbadged, 0);
  });

  test("the residue producer is the three named sentences and defaults on", () => {
    assert.equal(isUnbadgedResidueEnabled({}), true);
    assert.equal(isUnbadgedResidueEnabled({ QC_UNBADGED_RESIDUE: "off" }), false);
    const files = [
      ["tests/fixtures/real-runs-2026-09-29/clean-review.json", [4, 14]],
      ["tests/fixtures/real-runs-2026-10-06-gpi/clean-run2-review.json", [2]],
    ];
    const residue = [];
    for (const [file, indexes] of files) {
      const review = JSON.parse(readFileSync(file, "utf8"));
      const draft = review.statements.map((row) => row.text);
      review.statements.forEach((row, index) => {
        const isResidue = statementIsFactualResidue(row.text, draft.join("\n"));
        if (isResidue) residue.push(`${file}#${index}`);
        const badge = factualBadgeForStatement(
          {
            statement: row.text,
            displayVerdict: "supported_full",
            commentaryNotReviewed: false,
            evidenceEnabled: true,
            draftStatements: draft,
          },
          {}
        );
        assert.equal(badge, !indexes.includes(index), `${file}#${index}`);
        if (indexes.includes(index)) {
          assert.equal(
            factualBadgeForStatement(
              {
                statement: row.text,
                displayVerdict: "supported_full",
                commentaryNotReviewed: false,
                evidenceEnabled: true,
                draftStatements: draft,
              },
              { QC_UNBADGED_RESIDUE: "0" }
            ),
            true
          );
        }
      });
    }
    assert.deepEqual(residue, [
      "tests/fixtures/real-runs-2026-09-29/clean-review.json#4",
      "tests/fixtures/real-runs-2026-09-29/clean-review.json#14",
      "tests/fixtures/real-runs-2026-10-06-gpi/clean-run2-review.json#2",
    ]);
    assert.equal(
      factualBadgeForStatement({
        statement: "Year to date trading remains healthy.",
        displayVerdict: "not reviewed",
        commentaryNotReviewed: false,
        evidenceEnabled: true,
        draftStatements: ["Year to date trading remains healthy."],
      }),
      true
    );
  });
});
