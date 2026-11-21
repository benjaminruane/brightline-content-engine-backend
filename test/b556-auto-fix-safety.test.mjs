/**
 * B556. Auto-fix only where the words cannot change meaning.
 * Decisions 4, 5, and 6.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "vitest";
import { applyGuideAutoFix } from "../lib/style-guide/auto-fix.mjs";
import { STYLE_GUIDE, STYLE_GUIDE_HEADER, guideEntry } from "../lib/style-guide/guide.mjs";
import { scanPeriodPlacement } from "../lib/style-guide/period-placement.mjs";
import { resolveStyleChoices } from "../lib/style-guide/render.mjs";

const HOUSE = resolveStyleChoices(null);

function fixed(text, extra = {}) {
  return applyGuideAutoFix(text, {
    outputType: "reporting_commentary",
    styleChoices: HOUSE,
    ...extra,
  }).text;
}

describe("B556 auto-fix safety", () => {
  test("the guide states the auto-fix principle, and the Oxford comma is no longer a transform", () => {
    const guide = readFileSync(new URL("../lib/style-guide/guide.mjs", import.meta.url), "utf8");
    assert.equal(guide.includes(STYLE_GUIDE_HEADER), true);
    const oxford = guideEntry("oxford_comma");
    assert.equal(oxford.enforcement.kind, "review-flag");
    assert.equal(oxford.enforcement.transformId, undefined);
    assert.equal(oxford.enforcement.scanId, "oxford_comma");
    const derived = guideEntry("derived_figure");
    assert.equal(derived.enforcement.kind, "guidance");
    assert.match(derived.correct[0], /equating to a 14% margin/);
    assert.equal(STYLE_GUIDE.some((entry) => entry.enforcement?.transformId === "list_commas"), false);
  });

  test("two-item phrases are left untouched", () => {
    for (const sentence of [
      "Growth was supported by mix and procurement savings.",
      "The portfolio is spread across vintages and sub-sectors.",
      "Shopify serves small and mid-sized businesses and at-home entrepreneurs.",
      "supported by mix, and procurement savings",
    ]) {
      assert.equal(fixed(sentence), sentence);
    }
  });

  test("currency codes run before the billions conversion", () => {
    assert.equal(fixed("The return was £5,049 million."), "The return was GBP 5.0 billion.");
    assert.equal(fixed("The fund held $653 million and €9 million."), "The fund held USD 653 million and EUR 9 million.");
    assert.equal(
      fixed("$12.1 million was the price.", { sources: [{ text: "The contract price was C$4 million." }] }),
      "CAD 12.1 million was the price."
    );
  });

  test("a period directly before a noun is left and flagged, and any other period is spelled", () => {
    assert.equal(fixed("Q1 2026 revenue grew."), "Q1 2026 revenue grew.");
    assert.equal(fixed("Results arrived in Q3 2026."), "Results arrived in the third quarter of 2026.");
    const flagged = scanPeriodPlacement({ statement: "Q1 2026 revenue grew." });
    assert.equal(flagged.length, 1);
    assert.equal(flagged[0].concernCode, "period_placement");
    assert.equal(scanPeriodPlacement({ statement: "Revenue for the first quarter of 2026." }).length, 0);
    assert.equal(scanPeriodPlacement({ statement: "first quarter of 2026 revenue grew." }).length, 1);
  });
});
