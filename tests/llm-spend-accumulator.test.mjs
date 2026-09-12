import assert from "node:assert/strict";
import { beforeEach, describe, test } from "vitest";

import {
  calculateLlmCostUsd,
  formatLlmSpend,
  getLlmPricingTable,
  getLlmSpend,
  recordLlmSpend,
  resetLlmSpend,
} from "../lib/observability.js";

const UNPRICED_PROVIDER = "openai";
const UNPRICED_MODEL = "zzqq-not-a-real-model";
const UNPRICED_KEY = `${UNPRICED_PROVIDER}/${UNPRICED_MODEL}`;

function firstPricedModel() {
  const table = getLlmPricingTable();
  for (const [provider, models] of Object.entries(table)) {
    const model = Object.keys(models || {})[0];
    if (model) return { provider, model, key: `${provider}/${model}` };
  }
  throw new Error("PRICING table has no models");
}

describe("llm spend accumulator", () => {
  beforeEach(() => {
    resetLlmSpend();
  });

  test("T1 resetLlmSpend then getLlmSpend returns zeros and empty unpricedModels", () => {
    resetLlmSpend();
    const spend = getLlmSpend();
    assert.equal(spend.calls, 0);
    assert.equal(spend.inputTokens, 0);
    assert.equal(spend.cachedInputTokens, 0);
    assert.equal(spend.outputTokens, 0);
    assert.equal(spend.costUsd, 0);
    assert.equal(spend.unpricedCalls, 0);
    assert.deepEqual(spend.unpricedModels, []);
    assert.deepEqual(spend.byModel, {});
  });

  test("T2 two priced calls sum totals under one byModel key", () => {
    const { provider, model, key } = firstPricedModel();
    const usageA = { inputTokens: 1000, cachedInputTokens: 200, outputTokens: 50 };
    const usageB = { inputTokens: 500, cachedInputTokens: 100, outputTokens: 25 };
    recordLlmSpend(provider, model, usageA);
    recordLlmSpend(provider, model, usageB);

    const spend = getLlmSpend();
    assert.equal(spend.calls, 2);
    assert.equal(spend.inputTokens, 1500);
    assert.equal(spend.cachedInputTokens, 300);
    assert.equal(spend.outputTokens, 75);
    assert.equal(spend.unpricedCalls, 0);
    assert.deepEqual(spend.unpricedModels, []);

    const expectedCost =
      calculateLlmCostUsd(provider, model, usageA) + calculateLlmCostUsd(provider, model, usageB);
    assert.equal(spend.costUsd, expectedCost);

    assert.ok(spend.byModel[key]);
    assert.equal(spend.byModel[key].calls, 2);
    assert.equal(spend.byModel[key].inputTokens, 1500);
    assert.equal(spend.byModel[key].cachedInputTokens, 300);
    assert.equal(spend.byModel[key].outputTokens, 75);
    assert.equal(spend.byModel[key].costUsd, expectedCost);
    assert.equal(spend.byModel[key].unpricedCalls, 0);
    assert.equal(Object.keys(spend.byModel).length, 1);
  });

  test("T3 costUsd for a priced model is strictly greater than zero", () => {
    const { provider, model } = firstPricedModel();
    recordLlmSpend(provider, model, { inputTokens: 1000, outputTokens: 100 });
    const spend = getLlmSpend();
    assert.ok(spend.costUsd > 0);
  });

  test("T4 an unpriced model increments calls and tokens but not costUsd", () => {
    const before = getLlmSpend();
    recordLlmSpend(UNPRICED_PROVIDER, UNPRICED_MODEL, {
      inputTokens: 400,
      cachedInputTokens: 40,
      outputTokens: 80,
    });
    const spend = getLlmSpend();
    assert.equal(spend.calls, before.calls + 1);
    assert.equal(spend.inputTokens, 400);
    assert.equal(spend.cachedInputTokens, 40);
    assert.equal(spend.outputTokens, 80);
    assert.equal(spend.costUsd, before.costUsd);
    assert.equal(spend.costUsd, 0);
    assert.equal(spend.unpricedCalls, 1);
    assert.deepEqual(spend.unpricedModels, [UNPRICED_KEY]);
    assert.equal(spend.byModel[UNPRICED_KEY].calls, 1);
    assert.equal(spend.byModel[UNPRICED_KEY].unpricedCalls, 1);
    assert.equal(spend.byModel[UNPRICED_KEY].costUsd, 0);
  });

  test("T5 formatLlmSpend after an unpriced call contains UNDERCOUNT and the key", () => {
    recordLlmSpend(UNPRICED_PROVIDER, UNPRICED_MODEL, {
      inputTokens: 400,
      outputTokens: 80,
    });
    const line = formatLlmSpend();
    assert.ok(line.includes("UNDERCOUNT"));
    assert.ok(line.includes(UNPRICED_KEY));
  });

  test("T6 null, undefined, and empty usage count the call with zero tokens and do not throw", () => {
    const { provider, model } = firstPricedModel();
    recordLlmSpend(provider, model, null);
    recordLlmSpend(provider, model, undefined);
    recordLlmSpend(provider, model, {});
    const spend = getLlmSpend();
    assert.equal(spend.calls, 3);
    assert.equal(spend.inputTokens, 0);
    assert.equal(spend.cachedInputTokens, 0);
    assert.equal(spend.outputTokens, 0);
    assert.equal(spend.costUsd, 0);
  });

  test("T7 formatLlmSpend with zero calls returns the no-calls line", () => {
    assert.equal(formatLlmSpend(), "LLM SPEND no model calls recorded");
  });

  test("T8 getLlmSpend returns a copy", () => {
    const { provider, model, key } = firstPricedModel();
    recordLlmSpend(provider, model, { inputTokens: 10, outputTokens: 2 });
    const first = getLlmSpend();
    first.calls = 999;
    first.inputTokens = 999;
    first.costUsd = 999;
    first.unpricedCalls = 999;
    first.unpricedModels.push("mutated/key");
    first.byModel[key].calls = 999;
    first.byModel["mutated/key"] = { calls: 1 };

    const second = getLlmSpend();
    assert.equal(second.calls, 1);
    assert.equal(second.inputTokens, 10);
    assert.equal(second.outputTokens, 2);
    assert.equal(second.unpricedCalls, 0);
    assert.deepEqual(second.unpricedModels, []);
    assert.equal(second.byModel[key].calls, 1);
    assert.equal(second.byModel["mutated/key"], undefined);
  });
});
