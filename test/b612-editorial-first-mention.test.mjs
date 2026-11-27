/**
 * B612. Editorial first-mention / names notes know earlier sentences.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { applyDeterministicStyleFilters } from "../lib/qc/editorial-compliance-reviewer.mjs";

const DRAFT =
  "In November 2026, ABC agreed to invest USD 5 million in the Series A financing of Shopify, a Canadian commerce platform. "
  + "Shopify reported USD 10'000 of revenue in the period.";

const S2 = "Shopify reported USD 10'000 of revenue in the period.";
const FIRST_ONLY = "AcmeCorp reported USD 10 million of revenue in the period.";
const FIRST_DRAFT = FIRST_ONLY;

function namesConcern(name) {
  return {
    concernCode: "names",
    rule: "names",
    note: `The statement uses '${name}' without first introducing it as the official name.`,
  };
}

describe("B612 editorial first mention", () => {
  test("drops a Shopify first-mention note when an earlier sentence introduces it", () => {
    const out = applyDeterministicStyleFilters(
      [namesConcern("Shopify")],
      S2,
      DRAFT,
      {},
    );
    assert.equal(out.length, 0);
  });

  test("keeps a first-mention note when the name is first used in that sentence", () => {
    const out = applyDeterministicStyleFilters(
      [namesConcern("AcmeCorp")],
      FIRST_ONLY,
      FIRST_DRAFT,
      {},
    );
    assert.equal(out.length, 1);
    assert.equal(out[0].concernCode, "names");
  });
});
