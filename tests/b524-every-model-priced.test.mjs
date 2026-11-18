/**
 * B524. Every configured model has an explicit price.
 * An unlisted model is priced at the highest published rates and named in one warning.
 */
import assert from "node:assert/strict";
import { afterEach, describe, test, vi } from "vitest";
import { STAGE_MODELS } from "../lib/qc/model-config.mjs";
import { READING_MODEL } from "../lib/qc/reading-review.mjs";
import {
  calculateLlmCostUsd,
  getLlmPricingTable,
  highestPublishedRates,
  resetUnlistedPriceWarnings,
} from "../lib/observability.js";

describe("B524 every model is priced", () => {
  afterEach(() => {
    resetUnlistedPriceWarnings();
    vi.restoreAllMocks();
  });

  test("every configured model id has an explicit price", () => {
    const pricing = getLlmPricingTable();
    const models = [
      ...Object.values(STAGE_MODELS).map((row) => `${row.provider}/${row.model}`),
      `anthropic/${READING_MODEL}`,
    ];
    const missing = [...new Set(models)].filter((key) => {
      const [provider, model] = key.split("/");
      return !pricing?.[provider]?.[model];
    });
    assert.deepEqual(missing, []);
  });

  test("an unlisted model is priced at the highest published rates and warned once", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const rates = highestPublishedRates();
    const usage = { inputTokens: 1_000_000, cachedInputTokens: 0, outputTokens: 1_000_000 };
    const cost = calculateLlmCostUsd("openai", "gpt-9-imaginary", usage);
    assert.equal(cost, rates.input + rates.output);
    assert.ok(cost > 0);
    calculateLlmCostUsd("openai", "gpt-9-imaginary", usage);
    const lines = warn.mock.calls.map((call) => call.join(" "));
    assert.equal(lines.length, 1);
    assert.match(lines[0], /gpt-9-imaginary/);
  });
});
