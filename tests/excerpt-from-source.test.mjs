/**
 * B325. Displayed excerpt is sliced from the source. The model's pointer is never shown.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import {
  recoverExcerptFromSource,
  DEFAULT_SIMILARITY_FLOOR,
} from "../lib/qc/excerpt-from-source.mjs";
import { assembleCard } from "../lib/qc/pipeline-v3/stage7-assemble-card.mjs";
import {
  CHECK_NOT_CHECKED_LABEL,
  classifyCard,
  evidenceRowLabel,
} from "../lib/qc/review-summary.mjs";
import { evidenceDisplayVerdictLabel } from "../lib/qc/evidence-display-verdict.mjs";
import { renderCanonicalExportText } from "../lib/qc/export-review-data.mjs";

const REVIEWS_ON = {
  evidenceEnabled: true,
  editorialEnabled: true,
  complianceEnabled: true,
};

const D17_POINTER =
  "January 2 of this year was the 25 anniversary of my memo bubble.com";
const D17_SOURCE =
  "January 2 of this year was the 25th anniversary of my memo bubble.com, the one that put my writing on the map.";

function screenAndExport(card) {
  const cls = classifyCard(card, REVIEWS_ON);
  const badgeText = evidenceDisplayVerdictLabel(card.displayVerdict);
  const evidenceRow = evidenceRowLabel(cls.evidence, card.displayVerdict, badgeText);
  const screenExcerpt =
    card.hasRealExcerpt === true && typeof card.primaryExcerpt === "string"
      ? card.primaryExcerpt
      : typeof card.primaryExcerptText === "string"
        ? card.primaryExcerptText
        : "";
  const exportText = renderCanonicalExportText({
    qcResult: { statements: [{ qcCard: card }] },
    reviewOptions: REVIEWS_ON,
  });
  const exportVerdictMatch = exportText.match(/^Verdict: (.+)$/m);
  const exportExcerptMatch = exportText.match(/^Excerpt: "([\s\S]*)"$/m);
  const exportVerdict = exportVerdictMatch ? exportVerdictMatch[1].replace(/ \([^)]+\)$/, "") : null;
  const exportExcerpt = exportExcerptMatch ? exportExcerptMatch[1] : "";
  return {
    badgeText,
    evidenceRow,
    screenExcerpt,
    exportVerdict,
    exportExcerpt,
    exportText,
    cls,
  };
}

async function assembleWith({ pointer, sourceText, statement, classification = "confirmed", verdict = "confirmed" }) {
  const label = "memo";
  const stmt = statement || pointer;
  return assembleCard(
    {
      statementText: stmt,
      startChar: 0,
      endChar: stmt.length,
      sourceMatches: [
        {
          sourceIndex: 0,
          sourceLabel: label,
          classification,
          passage: pointer,
        },
      ],
      verdictResult: {
        verdict,
        hasConflict: verdict === "conflicting",
        confirmingMatches: [{ sourceIndex: 0, sourceLabel: label }],
        contributingSourceIndices: [0],
      },
      excerptResult: {
        primaryExcerpt: { passage: pointer, sourceLabel: label },
      },
      supportSpans: [{ sourceRefId: 0, passage: pointer, classification }],
      editorialResult: {
        editorialVerdict: "clean",
        editorialConcerns: [],
        complianceVerdict: "clean",
        complianceConcerns: [],
      },
    },
    0,
    {
      pipelineRoute: "v4",
      sources: [{ text: sourceText, label }],
      reviewOptions: REVIEWS_ON,
      skipEditorialDuplicationJudge: true,
    }
  );
}

describe("B325 excerpt from source", () => {
  test("exact match returns the source's characters", async () => {
    const source = "Revenue reached EUR 92 million in FY2024.";
    const pointer = "Revenue reached EUR 92 million in FY2024.";
    const recovered = recoverExcerptFromSource({ pointer, sourceText: source });
    assert.equal(recovered.miss, false);
    assert.equal(recovered.step, "exact");
    assert.equal(recovered.passage, source);
    assert.equal(source.slice(recovered.start, recovered.end), recovered.passage);

    const card = await assembleWith({ pointer, sourceText: source });
    const view = screenAndExport(card);
    assert.equal(card.primaryExcerpt, source);
    assert.equal(view.screenExcerpt, source);
    assert.equal(view.exportExcerpt, source);
    assert.equal(view.screenExcerpt, view.exportExcerpt);
    assert.equal(view.evidenceRow, view.exportVerdict);
    assert.notEqual(view.evidenceRow, CHECK_NOT_CHECKED_LABEL);
  });

  test("d17: pointer missing th recovers the source wording including 25th", async () => {
    const recovered = recoverExcerptFromSource({
      pointer: D17_POINTER,
      sourceText: D17_SOURCE,
    });
    assert.equal(recovered.miss, false);
    assert.ok(recovered.passage.includes("25th"));
    assert.equal(recovered.passage.includes("25 anniversary"), false);
    assert.equal(D17_SOURCE.slice(recovered.start, recovered.end), recovered.passage);
    assert.ok(recovered.step === "window" || recovered.step === "normalised");

    const card = await assembleWith({
      pointer: D17_POINTER,
      sourceText: D17_SOURCE,
      statement: "January 2 of this year was the 25 th anniversary of my memo bubble.",
    });
    const view = screenAndExport(card);
    assert.equal(card.hasRealExcerpt, true);
    assert.ok(card.primaryExcerpt.includes("25th"));
    assert.equal(card.primaryExcerpt.includes("25 anniversary"), false);
    assert.equal(view.screenExcerpt, card.primaryExcerpt);
    assert.equal(view.exportExcerpt, card.primaryExcerpt);
    assert.equal(view.screenExcerpt, view.exportExcerpt);
    assert.equal(view.evidenceRow, "Confirmed");
    assert.equal(view.exportVerdict, "Confirmed");
  });

  test("figures guard: EUR 95m pointer against EUR 59m window is a miss", async () => {
    const pointer = "The company raised EUR 95 million in 2024.";
    const source = "The company raised EUR 59 million in 2024. Operations continued as planned.";
    const recovered = recoverExcerptFromSource({ pointer, sourceText: source });
    assert.equal(recovered.miss, true);
    assert.equal(recovered.reason, "figures_guard");
    assert.ok(String(recovered.rejectedPassage || "").includes("59"));

    const card = await assembleWith({ pointer, sourceText: source });
    const view = screenAndExport(card);
    assert.equal(card.hasRealExcerpt, false);
    assert.equal(card.displayVerdict, "unverifiable");
    assert.equal(view.evidenceRow, "Unverifiable");
    assert.equal(view.exportVerdict, "Unverifiable");
    assert.equal(view.screenExcerpt, view.exportExcerpt);
    assert.notEqual(view.evidenceRow, "Confirmed");
    assert.notEqual(view.evidenceRow, CHECK_NOT_CHECKED_LABEL);
    assert.notEqual(view.exportVerdict, "Confirmed");
    assert.notEqual(view.exportVerdict, CHECK_NOT_CHECKED_LABEL);
  });

  test("an ambiguous tie is a miss", async () => {
    const pointer = "the 25 anniversary of Fund One";
    const source =
      "Preface. the 25th anniversary of Fund One. Later: the 25th anniversary of Fund One. End.";
    const recovered = recoverExcerptFromSource({ pointer, sourceText: source });
    assert.equal(recovered.miss, true);
    assert.equal(recovered.reason, "ambiguous_tie");

    const card = await assembleWith({
      pointer,
      sourceText: source,
      statement: "It was the 25th anniversary of Fund One.",
    });
    const view = screenAndExport(card);
    assert.equal(card.hasRealExcerpt, false);
    assert.equal(card.displayVerdict, "unverifiable");
    assert.equal(view.evidenceRow, "Unverifiable");
    assert.equal(view.exportVerdict, "Unverifiable");
    assert.equal(view.screenExcerpt, view.exportExcerpt);
    assert.notEqual(view.evidenceRow, "Confirmed");
    assert.notEqual(view.evidenceRow, CHECK_NOT_CHECKED_LABEL);
  });

  test("a genuine miss reads Unverifiable, never Confirmed and never Not checked", async () => {
    const pointer = "Completely unrelated zebra pendulums circled the atrium.";
    const source = "Revenue reached EUR 92 million in FY2024. Headcount was 420.";
    const recovered = recoverExcerptFromSource({ pointer, sourceText: source });
    assert.equal(recovered.miss, true);

    const card = await assembleWith({
      pointer,
      sourceText: source,
      statement: "Completely unrelated zebra pendulums circled the atrium.",
    });
    const view = screenAndExport(card);
    assert.equal(card.hasRealExcerpt, false);
    assert.equal(card.displayVerdict, "unverifiable");
    assert.equal(card.evidenceNotReviewedReason, "excerpt_not_locatable");
    assert.equal(view.badgeText, "Unverifiable");
    assert.equal(view.evidenceRow, "Unverifiable");
    assert.equal(view.exportVerdict, "Unverifiable");
    assert.equal(view.screenExcerpt, view.exportExcerpt);
    assert.notEqual(view.evidenceRow, "Confirmed");
    assert.notEqual(view.evidenceRow, CHECK_NOT_CHECKED_LABEL);
    assert.notEqual(view.exportVerdict, "Confirmed");
    assert.notEqual(view.exportVerdict, CHECK_NOT_CHECKED_LABEL);
    assert.equal(view.cls.evidence, "unverifiable");
    assert.equal(DEFAULT_SIMILARITY_FLOOR, 0.85);
  });

  test("floor is pinned at 0.85", () => {
    assert.equal(DEFAULT_SIMILARITY_FLOOR, 0.85);
  });
});
