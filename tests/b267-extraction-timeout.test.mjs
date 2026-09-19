/**
 * B267: extraction's timeout tracks the Function cap at 300 seconds.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { EXTRACTION_TIMEOUT_MS } from "../lib/extract-text-from-source.mjs";

describe("B267 extraction timeout tracks the Function cap", () => {
  test("EXTRACTION_TIMEOUT_MS is 300000", () => {
    assert.equal(EXTRACTION_TIMEOUT_MS, 300_000);
  });
});
