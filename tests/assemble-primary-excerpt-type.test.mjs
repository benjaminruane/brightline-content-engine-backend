/**
 * Assembled qcCard.primaryExcerpt is a passage string or null, matching the schema.
 * Stage 4's object stays on excerptResult. conflictExcerpt is not stringified.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { assembleCard } from "../lib/qc/pipeline-v3/stage7-assemble-card.mjs";

function entryWithExcerpts({ primaryExcerpt, conflictExcerpt = null, verdict = "confirmed" }) {
  const statement = "Revenue reached EUR 92 million.";
  return {
    statementText: statement,
    startChar: 0,
    endChar: statement.length,
    sourceMatches: [{ sourceIndex: 0, classification: verdict === "conflicting" ? "conflicting" : "confirmed", sourceLabel: "memo" }],
    verdictResult: {
      verdict,
      hasConflict: verdict === "conflicting",
      confirmingMatches: verdict === "confirmed" ? [{ sourceIndex: 0, sourceLabel: "memo" }] : [],
      contributingSourceIndices: [0],
    },
    excerptResult: { primaryExcerpt, conflictExcerpt },
    editorialResult: {
      editorialVerdict: "clean",
      editorialConcerns: [],
      complianceVerdict: "clean",
      complianceConcerns: [],
    },
  };
}

describe("assembleCard primaryExcerpt wire type", () => {
  test("emits a string that equals primaryExcerptText when a real excerpt exists", async () => {
    const passage = "Revenue reached EUR 92 million in the year.";
    const card = await assembleCard(
      entryWithExcerpts({
        primaryExcerpt: { passage, sourceLabel: "FY memo" },
      }),
      0,
      { pipelineRoute: "v4", skipEditorialDuplicationJudge: true }
    );
    assert.equal(typeof card.primaryExcerpt === "object" && card.primaryExcerpt !== null, false);
    assert.equal(typeof card.primaryExcerpt, "string");
    assert.equal(card.primaryExcerpt, passage);
    assert.equal(card.primaryExcerpt, card.primaryExcerptText);
    assert.equal(card.primaryRefTitle, "FY memo");
    assert.equal(card.hasRealExcerpt, true);
    assert.equal(card.displayVerdict, "supported_full");
    assert.equal(card.supportState, "supported");
    assert.equal(card.hasConflict, false);
  });

  test("emits null when there is no real excerpt, never an object", async () => {
    const card = await assembleCard(
      entryWithExcerpts({ primaryExcerpt: null, verdict: "not_supported" }),
      0,
      { pipelineRoute: "v4", skipEditorialDuplicationJudge: true }
    );
    assert.equal(card.primaryExcerpt, null);
    assert.equal(card.primaryExcerptText, null);
    assert.equal(card.hasRealExcerpt, false);
    assert.equal(card.displayVerdict, "not_supported");
  });

  test("conflictExcerpt stays the Stage 4 object", async () => {
    const conflictExcerpt = { passage: "The other source reports EUR 71 million.", sourceLabel: "update" };
    const card = await assembleCard(
      entryWithExcerpts({
        primaryExcerpt: { passage: "Revenue reached EUR 92 million in the year.", sourceLabel: "FY memo" },
        conflictExcerpt,
        verdict: "conflicting",
      }),
      0,
      { pipelineRoute: "v4", skipEditorialDuplicationJudge: true }
    );
    assert.equal(card.conflictExcerpt, conflictExcerpt);
    assert.equal(typeof card.primaryExcerpt, "string");
    assert.equal(card.displayVerdict, "conflict");
    assert.equal(card.hasConflict, true);
  });
});
