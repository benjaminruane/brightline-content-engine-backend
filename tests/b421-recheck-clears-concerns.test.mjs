import assert from "node:assert/strict";
import { test } from "vitest";
import { recheckStatements } from "../lib/qc/reading-review.mjs";

test("a corrected typo comes back without the concern, the mark, or the proposal", async () => {
  const before = "The deal was copleted.";
  const after = "The deal was completed.";
  const start = before.indexOf("copleted");
  let reviewed = 0;
  const result = await recheckStatements({
    draft: after,
    statements: [{
      index: 0,
      id: "0",
      text: before,
      facts: [],
      note: null,
      sentenceState: "nothing_raised",
      editorialConcerns: [{
        concernCode: "structural_integrity",
        span: [{ startChar: start, endChar: start + "copleted".length }],
        suggestedDirection: "Replace 'copleted' with 'completed'.",
      }],
    }],
    sources: [{ text: after }],
    entries: [{
      id: "stale-typo",
      statementId: "0",
      rule: "structural_integrity",
      statement: before,
      thing1: { quote: "copleted", startChar: start, endChar: start + "copleted".length },
    }],
    decisions: { "stale-typo": { choice: "accept" } },
    complete: async () => JSON.stringify({ bucket: "none", note: "", disputedIndices: [] }),
    reviewStatement: async ({ text }) => {
      reviewed += 1;
      if (text.includes("copleted")) {
        throw new Error("recheck reviewed the old text");
      }
      return {
        editorialConcerns: [],
        editorialVerdict: "clean",
        complianceConcerns: [],
        complianceVerdict: "clean",
      };
    },
  });
  assert.equal(reviewed, 1);
  assert.equal(result.sentences[0].text, after);
  assert.equal(result.sentences[0].editorialConcerns.some((concern) => concern.concernCode === "structural_integrity"), false);
  assert.equal(result.draftMarks.some((mark) => mark.surface === "copleted"), false);
  assert.equal(result.draftMarks.some((mark) => mark.ref === "stale-typo"), false);
  assert.deepEqual(result.clearedDecisionIds, ["stale-typo"]);
  assert.equal(result.sentences[0].reviewerCalls, 0);
});
