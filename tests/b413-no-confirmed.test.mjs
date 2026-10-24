import assert from "node:assert/strict";
import { describe, test } from "vitest";
import {
  evidenceCountClass,
  evidenceDisplayVerdictLabel,
  normalizeExportVerdict,
} from "../lib/qc/evidence-display-verdict.mjs";

describe("B413 supported_full is not labelled Confirmed", () => {
  test("the label, the export, and the summary use Nothing raised", () => {
    assert.equal(evidenceDisplayVerdictLabel("supported_full"), "Nothing raised");
    assert.equal(normalizeExportVerdict("supported_full"), "Nothing raised");
    assert.equal(evidenceDisplayVerdictLabel("supported_full").includes("Confirmed"), false);
    assert.equal(normalizeExportVerdict("supported_full").includes("Confirmed"), false);
    assert.equal(evidenceCountClass("supported_full"), "confirmed");
  });
});
