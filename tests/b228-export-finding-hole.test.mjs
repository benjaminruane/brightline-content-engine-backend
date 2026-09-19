/**
 * B228: a missing evidence finding is a visible fault, not an invented sentence.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { evidenceFindingForExport } from "../lib/qc/export-review-data.mjs";

describe("B228 export evidence finding hole", () => {
  test("empty paragraph and headline print Not recorded.", () => {
    assert.equal(
      evidenceFindingForExport({ reasoningParagraph: "", reasoningHeadline: null }, false),
      "Not recorded."
    );
    assert.equal(
      evidenceFindingForExport({ reasoningParagraph: "  ", reasoningHeadline: "" }, false),
      "Not recorded."
    );
  });

  test("does not invent No evidence finding recorded.", () => {
    const value = evidenceFindingForExport({ reasoningParagraph: "", reasoningHeadline: null }, false);
    assert.equal(value === "No evidence finding recorded.", false);
  });
});
