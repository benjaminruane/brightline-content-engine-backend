/**
 * B557. No auto-fix changes the words inside quoted speech. Decision 1.
 * The ranges are taken once, before the quote marks are converted.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { applyGuideAutoFix } from "../lib/style-guide/auto-fix.mjs";
import { quotationRanges } from "../lib/qc/mechanics-scan.mjs";

function interiors(text) {
  return quotationRanges(text).map(([from, to]) => text.slice(from + 1, to - 1));
}

const SOURCE = [
  "Simon Borrows, 3i's Chief Executive, commented: \"FY2025 was another successful year for 3i, continuing our track record of consistently delivering strong shareholder returns.",
  "",
  "Our FY2025 result was underpinned by the powerful compounding growth from our long-term hold assets.\"",
].join("\n");

test("the row 13b quotation keeps its words when the marks change", () => {
  const fixed = applyGuideAutoFix(SOURCE, {
    outputType: "press_release",
    authoringOrganisation: "3i Group plc",
  }).text;
  for (const words of interiors(SOURCE)) assert.equal(fixed.includes(words), true);
  assert.equal(fixed.includes("financial year 2025"), false);
  assert.equal(fixed.includes("3i Group's track record"), false);
  assert.equal(fixed.includes("FY2025 was another successful year"), true);
  assert.equal(fixed.includes("continuing our track record"), true);
  assert.match(fixed, /commented: 'FY2025 was another successful year/);
  assert.equal(fixed.includes("'Our FY2025"), false);
});
