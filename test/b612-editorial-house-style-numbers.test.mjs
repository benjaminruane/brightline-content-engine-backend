/**
 * B612. Editorial thousand_separator notes respect house style number format.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { applyDeterministicStyleFilters } from "../lib/qc/editorial-compliance-reviewer.mjs";

const STATEMENT = "Shopify raised USD 10'000 in the round.";

function concern(rule, note) {
  return {
    concernCode: rule,
    rule,
    note,
    span: [{ startChar: 18, endChar: 25 }],
  };
}

describe("B612 editorial house style numbers", () => {
  test("apostrophe house style drops a 10'000 comma note", () => {
    const note = "'10'000' is not a standard format. Use a comma to separate thousands.";
    const out = applyDeterministicStyleFilters(
      [concern("thousand_separator", note)],
      STATEMENT,
      STATEMENT,
      { houseStyle: { thousands: "apostrophe" } },
    );
    assert.equal(out.length, 0);
  });

  test("comma house style keeps a 10'000 note", () => {
    const note = "'10'000' is not a standard format. Use a comma to separate thousands.";
    const out = applyDeterministicStyleFilters(
      [concern("thousand_separator", note)],
      STATEMENT,
      STATEMENT,
      { houseStyle: { thousands: "comma" } },
    );
    assert.equal(out.length, 1);
    assert.equal(out[0].concernCode, "thousand_separator");
  });
});
