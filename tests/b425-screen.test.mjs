import assert from "node:assert/strict";
import { test } from "vitest";
import { displayedEvidenceProse } from "../lib/qc/evidence-findings.mjs";
import { excerptIsReadable } from "../lib/qc/readable-excerpt.mjs";

test("a quotation mark is not a readable extract, and a sentence is", () => {
  assert.equal(excerptIsReadable("\""), false);
  assert.equal(excerptIsReadable("  "), false);
  assert.equal(excerptIsReadable("\u00a0"), false);
  assert.equal(excerptIsReadable("HICL has delivered robust operational performance"), true);
});

test("not_in_source shows the reading note and withholds a confirming paragraph", () => {
  const budgets = "The source says EBITDA is delivered in line with expectations, not in line with budgets. \"Budgets\" is a different benchmark than the \"expectations\" stated in the source.";
  assert.equal(displayedEvidenceProse("not_in_source", budgets), budgets);
  assert.equal(displayedEvidenceProse("not_in_source", "The source confirms the statement and it aligns with the draft as stated."), "");
  assert.equal(displayedEvidenceProse("nothing_raised", budgets), null);
});
