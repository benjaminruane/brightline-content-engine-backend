/**
 * B560. An auto-fix or scanned style rule is not sent to the Review style model.
 * The billions scan reports only an amount of 1,000 million or more.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { buildEditorialStyleSystemPrompt } from "../lib/qc/editorial-compliance-reviewer.mjs";
import { scanMagnitude } from "../lib/qc/magnitude-scan.mjs";
import { resolveStyleGuide } from "../lib/qc/style-guide.mjs";

const rules = resolveStyleGuide({ outputType: "reporting_commentary" });

test("the style model is not given the billions rule", () => {
  const prompt = buildEditorialStyleSystemPrompt({
    outputTypeLabel: "Reporting commentary",
    editorialRules: [],
    structuredStyleRules: rules,
    outputSlug: "reporting_commentary",
    outputType: "reporting_commentary",
    houseName: "Halden Group",
  });
  assert.equal(prompt.includes("1,000 million"), false);
  assert.equal(prompt.includes("- magnitude:"), false);
  assert.equal(prompt.includes("hyperbole_vs_qualitative"), true);
});

test("USD 20 million, USD 5.5 million, and 20% are outside the billions scan", () => {
  const small = "The round is priced at a USD 20 million pre-money valuation, with potential to increase exposure to USD 7 million.";
  const revenue = "Shopify serves customers with annualized revenue of about USD 5.5 million.";
  const headline = "3i Group Reports Fifth Consecutive Year Of Returns Above 20%";
  assert.deepEqual(scanMagnitude({ statement: small, houseStyle: { magnitude: "billions" } }), []);
  assert.deepEqual(scanMagnitude({ statement: revenue, houseStyle: { magnitude: "billions" } }), []);
  assert.deepEqual(scanMagnitude({ statement: headline, houseStyle: { magnitude: "billions" } }), []);
});

test("GBP 5,049 million is inside the billions scan, and the millions choice is not", () => {
  const statement = "The total return was GBP 5,049 million.";
  const hits = scanMagnitude({ statement, houseStyle: { magnitude: "billions" } });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].rule, "magnitude");
  assert.match(hits[0].note, /1,000 million or more/);
  assert.deepEqual(scanMagnitude({ statement, houseStyle: { magnitude: "millions" } }), []);
});
