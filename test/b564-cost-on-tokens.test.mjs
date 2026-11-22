/**
 * B564. The warning and the guard use tokens sent. Real spend aborts the run.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { reviewCostWarning } from "../lib/qc/review-cost-warning.mjs";
import { armSpendCap, disarmSpendCap } from "../scripts/diagnostic/lib/cost-guard.mjs";
import { assertSpendWithinCap, recordLlmSpend, resetLlmSpend } from "../lib/observability.js";

test("a source over about 20,000 tokens warns, and the cost is the tokens sent", () => {
  assert.equal(reviewCostWarning({ sourceChars: 80_000, statementCount: 2 }), null);
  const warning = reviewCostWarning({ sourceChars: 251_677, statementCount: 10 });
  assert.equal(warning.sourceTokens, Math.ceil(251_677 / 4));
  assert.match(warning.message, /tokens of source on each check/);
  assert.equal(warning.costUsd > 1, true);
});

test("real spend aborts the run once it passes the cap, and the next call does not start", () => {
  resetLlmSpend();
  armSpendCap(1);
  assert.doesNotThrow(() => assertSpendWithinCap());
  assert.throws(
    () => recordLlmSpend("openai", "gpt-4o-2024-08-06", { inputTokens: 1_000_000, outputTokens: 0 }),
    (err) => err.code === "cost_cap" && err.spend.calls === 1,
  );
  assert.throws(() => assertSpendWithinCap(), (err) => err.code === "cost_cap");
  disarmSpendCap();
  resetLlmSpend();
});
