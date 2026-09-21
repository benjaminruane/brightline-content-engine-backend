/**
 * B302 Part 4. An absent reviewOptions object cannot produce a clean verdict.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { assembleCard } from "../lib/qc/pipeline-v3/stage7-assemble-card.mjs";

const STATEMENT = "Oakfield Partners closed Fund III at EUR 400 million in March 2025.";

const ALL_ON = {
  evidenceEnabled: true,
  editorialEnabled: true,
  complianceEnabled: true,
};

function statementEntry() {
  return {
    statementText: STATEMENT,
    startChar: 0,
    endChar: STATEMENT.length,
    sourceMatches: [{ sourceIndex: 0, classification: "confirmed", sourceLabel: "memo", passage: STATEMENT }],
    verdictResult: {
      verdict: "confirmed",
      hasConflict: false,
      contributingSourceIndices: [0],
    },
    excerptResult: {
      primaryExcerpt: { passage: STATEMENT, sourceLabel: "memo" },
    },
    supportSpans: [{ passage: STATEMENT, classification: "confirmed" }],
    editorialResult: {
      editorialVerdict: "clean",
      editorialConcerns: [],
      complianceVerdict: "clean",
      complianceConcerns: [],
    },
  };
}

describe("B302 absent reviewOptions cannot write clean", () => {
  test("assembleCard without reviewOptions stamps not_reviewed, never clean", async () => {
    const warns = [];
    const orig = console.warn;
    console.warn = (...args) => warns.push(args.map(String).join(" "));
    try {
      const card = await assembleCard(statementEntry(), 0, {
        pipelineRoute: "v3",
        skipEditorialDuplicationJudge: true,
        sources: [{ text: STATEMENT, label: "memo" }],
      });
      assert.equal(card.editorialVerdict, "not_reviewed");
      assert.equal(card.complianceVerdict, "not_reviewed");
      assert.notEqual(card.editorialVerdict, "clean");
      assert.notEqual(card.complianceVerdict, "clean");
      const joined = warns.join("\n");
      assert.equal(joined.includes("[ASSEMBLE_CARD] reviewOptions missing"), true);
      assert.equal(joined.includes("editorialEnabled treated as not requested"), true);
      assert.equal(joined.includes("complianceEnabled treated as not requested"), true);
    } finally {
      console.warn = orig;
    }
  });

  test("assembleCard with all checks on still keeps a clean editorial result", async () => {
    const card = await assembleCard(statementEntry(), 0, {
      pipelineRoute: "v3",
      skipEditorialDuplicationJudge: true,
      reviewOptions: ALL_ON,
      sources: [{ text: STATEMENT, label: "memo" }],
    });
    assert.equal(card.editorialVerdict, "clean");
    assert.equal(card.complianceVerdict, "clean");
  });
});
