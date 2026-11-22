/**
 * B561. A source over the long-source threshold warns with an estimated cost before Review.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { LONG_SOURCE_WORDS, reviewCostWarning } from "../lib/qc/review-cost-warning.mjs";

test("15,000 words does not warn, and one word over does, with a cost", () => {
  assert.equal(LONG_SOURCE_WORDS, 15000);
  assert.equal(reviewCostWarning({ sourceWords: 15000, statementCount: 12 }), null);
  const warning = reviewCostWarning({ sourceWords: 15001, statementCount: 12 });
  assert.equal(warning.costUsd > 0, true);
  assert.match(warning.message, /15,001 words of source/);
  assert.match(warning.message, /USD \d+\.\d{2}/);
  assert.match(warning.message, /Continue, or cancel/);
});

test("a missing count is loud", () => {
  assert.throws(() => reviewCostWarning({ statementCount: 4 }), /source word count is missing/);
  assert.throws(() => reviewCostWarning({ sourceWords: 70000 }), /statement count is missing/);
});
