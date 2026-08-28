import assert from "node:assert/strict";
import { describe, test } from "vitest";

import {
  cacheHitRate,
  calculateLlmCostUsd,
  getLlmPricingTable,
} from "../lib/observability.js";

const REVISER_MODEL = "gpt-5.1-2025-11-13";

describe("gpt-5.1 pricing", () => {
  test("the reviser model is priced, so its cost no longer reports as zero", () => {
    const cost = calculateLlmCostUsd("openai", REVISER_MODEL, {
      inputTokens: 1_000_000,
      outputTokens: 0,
    });
    assert.equal(cost, 1.25);
  });

  test("every openai model publishes a cached input rate", () => {
    for (const [model, rate] of Object.entries(getLlmPricingTable().openai)) {
      assert.ok(
        Number.isFinite(rate.cachedInput),
        `${model} is missing cachedInput and would bill cache reads at full price`
      );
      assert.ok(rate.cachedInput < rate.input, `${model} cachedInput must beat input`);
    }
  });
});

describe("cached input tokens are billed at the cached rate", () => {
  test("a full cache hit costs a tenth of a full miss on gpt-5.1", () => {
    const miss = calculateLlmCostUsd("openai", REVISER_MODEL, {
      inputTokens: 1_000_000,
      outputTokens: 0,
    });
    const hit = calculateLlmCostUsd("openai", REVISER_MODEL, {
      inputTokens: 1_000_000,
      cachedInputTokens: 1_000_000,
      outputTokens: 0,
    });
    assert.equal(hit, 0.125);
    assert.equal(hit, miss * 0.1);
  });

  test("cached tokens are a subset of input, not an addition to it", () => {
    // 4,767 of a 5,427-token prefix cached, the stage 1 shape from efaed13.
    const cost = calculateLlmCostUsd("openai", REVISER_MODEL, {
      inputTokens: 5427,
      cachedInputTokens: 4767,
      outputTokens: 0,
    });
    const expected = ((5427 - 4767) * 1.25 + 4767 * 0.125) / 1_000_000;
    assert.ok(Math.abs(cost - expected) < 1e-12);
  });

  test("a cached count above the input count cannot produce a negative bill", () => {
    const cost = calculateLlmCostUsd("openai", REVISER_MODEL, {
      inputTokens: 100,
      cachedInputTokens: 999_999,
      outputTokens: 0,
    });
    assert.ok(cost > 0);
    assert.equal(cost, (100 * 0.125) / 1_000_000);
  });

  test("the raw OpenAI usage shape is read directly", () => {
    const cost = calculateLlmCostUsd("openai", REVISER_MODEL, {
      prompt_tokens: 1000,
      completion_tokens: 0,
      prompt_tokens_details: { cached_tokens: 1000 },
    });
    assert.equal(cost, (1000 * 0.125) / 1_000_000);
  });

  test("a model with no cached rate bills cache reads at the full input rate", () => {
    // Anthropic sends no cache_control, so its entries publish no cached rate.
    const cost = calculateLlmCostUsd("anthropic", "claude-sonnet-4-6", {
      inputTokens: 1_000_000,
      cachedInputTokens: 1_000_000,
      outputTokens: 0,
    });
    assert.equal(cost, 3.0);
  });

  test("an unpriced model still reports zero", () => {
    assert.equal(calculateLlmCostUsd("openai", "gpt-9-imaginary", { inputTokens: 1000 }), 0);
  });
});

describe("cacheHitRate", () => {
  test("reports the fraction of input served from cache", () => {
    assert.equal(cacheHitRate({ inputTokens: 1000, cachedInputTokens: 250 }), 0.25);
  });

  test("is zero when nothing was cached or nothing was sent", () => {
    assert.equal(cacheHitRate({ inputTokens: 1000 }), 0);
    assert.equal(cacheHitRate({ inputTokens: 0, cachedInputTokens: 0 }), 0);
    assert.equal(cacheHitRate(null), 0);
  });
});
