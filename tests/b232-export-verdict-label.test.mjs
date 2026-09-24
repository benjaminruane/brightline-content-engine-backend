/**
 * B232: export verdict labels use the same allowlist as the screen, compared after trim.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { normalizeExportVerdict } from "../lib/qc/evidence-display-verdict.mjs";

describe("B232 export verdict label", () => {
  test("an unrecognised slug is Unverifiable, not Confirmed", () => {
    assert.equal(normalizeExportVerdict("banana"), "Unverifiable");
    assert.equal(normalizeExportVerdict("supported"), "Unverifiable");
  });

  test("a correct slug with different case and surrounding whitespace is not Confirmed", () => {
    assert.equal(normalizeExportVerdict(" Supported_Partial "), "Partially confirmed");
    assert.equal(normalizeExportVerdict(" CONFLICT "), "Conflicting");
    assert.equal(normalizeExportVerdict(" Not_Supported "), "No support");
  });

  test("supported_full still reads Confirmed after trim", () => {
    assert.equal(normalizeExportVerdict(" supported_full "), "Confirmed");
  });

  test("an allowlisted unverifiable slug is Unverifiable", () => {
    assert.equal(normalizeExportVerdict("unverifiable"), "Unverifiable");
  });
});
