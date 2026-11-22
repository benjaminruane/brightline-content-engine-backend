/**
 * B561. A source over the long-source threshold warns with an estimated cost before Review.
 * B564. The threshold is 20,000 tokens of the text that is sent, not a word count.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { LONG_SOURCE_TOKENS, reviewCostWarning } from "../lib/qc/review-cost-warning.mjs";

test("20,000 tokens of source does not warn, and one token over does, with a cost", () => {
  assert.equal(LONG_SOURCE_TOKENS, 20000);
  assert.equal(reviewCostWarning({ sourceChars: 80000, statementCount: 12 }), null);
  const warning = reviewCostWarning({ sourceChars: 80004, statementCount: 12 });
  assert.equal(warning.sourceTokens, 20001);
  assert.equal(warning.costUsd > 0, true);
  assert.match(warning.message, /20,001 tokens of source/);
  assert.match(warning.message, /USD \d+\.\d{2}/);
  assert.match(warning.message, /Continue, or cancel/);
});

test("a missing count is loud", () => {
  assert.throws(() => reviewCostWarning({ statementCount: 4 }), /source character count is missing/);
  assert.throws(() => reviewCostWarning({ sourceChars: 90000 }), /statement count is missing/);
});
