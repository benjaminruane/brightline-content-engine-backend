import { describe, test } from "vitest";
import assert from "node:assert/strict";
import {
  applyPlaceholderGuard,
  PLACEHOLDER_GUARD_MESSAGE,
} from "../lib/prompt-library/placeholder-guard.mjs";

const PREVIOUS = "Halden Group invested in Nordic SaaS Holdings in March 2026.";

describe("B209b placeholder guard", () => {
  test("a model output carrying [transaction date] is refused and the previous text is kept", () => {
    const modelOutput =
      "In [transaction date], Partners Group invested in Nordic SaaS Holdings.";
    const result = applyPlaceholderGuard(modelOutput, PREVIOUS);
    assert.equal(result.accepted, false);
    assert.equal(result.text, PREVIOUS);
    assert.equal(result.message, PLACEHOLDER_GUARD_MESSAGE);
  });

  test("a clean output passes through unchanged", () => {
    const modelOutput =
      "In March 2026, Halden Group invested in Nordic SaaS Holdings, a Stockholm-headquartered platform.";
    const result = applyPlaceholderGuard(modelOutput, PREVIOUS);
    assert.equal(result.accepted, true);
    assert.equal(result.text, modelOutput);
    assert.equal(result.message, null);
  });
});
