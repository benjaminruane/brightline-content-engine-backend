/**
 * B524. Two concurrent requests keep their own spend.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { getLlmSpend, recordLlmSpend, runWithLlmSpend } from "../lib/observability.js";

describe("B524 spend is per request", () => {
  test("two concurrent requests record their own costs exactly", async () => {
    const [left, right] = await Promise.all([
      runWithLlmSpend(async () => {
        recordLlmSpend("openai", "gpt-4o-2024-08-06", { inputTokens: 1_000_000, outputTokens: 0 });
        await new Promise((resolve) => setTimeout(resolve, 30));
        recordLlmSpend("openai", "gpt-4o-2024-08-06", { inputTokens: 1_000_000, outputTokens: 0 });
        return getLlmSpend().costUsd;
      }),
      runWithLlmSpend(async () => {
        recordLlmSpend("openai", "gpt-4o-mini-2024-07-18", { inputTokens: 1_000_000, outputTokens: 0 });
        await new Promise((resolve) => setTimeout(resolve, 30));
        return getLlmSpend().costUsd;
      }),
    ]);
    assert.equal(left, 5);
    assert.equal(right, 0.15);
  });
});
