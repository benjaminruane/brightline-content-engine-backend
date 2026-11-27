/**
 * B613. Source age uses whole completed years to today.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { formatAgeFromDates, wholeYearsBetween } from "../lib/qc/source-recency.mjs";

describe("B613 source age years", () => {
  test("Shopify October 12, 2010 is 16 years on 27 November 2026", () => {
    const from = new Date(Date.UTC(2010, 9, 12));
    const today = new Date(Date.UTC(2026, 10, 27));
    assert.equal(wholeYearsBetween(from, today), 16);
    assert.equal(formatAgeFromDates(from, today), "16 years");
  });

  test("day before anniversary is still the prior whole year", () => {
    const from = new Date(Date.UTC(2010, 9, 12));
    const before = new Date(Date.UTC(2026, 9, 11));
    assert.equal(wholeYearsBetween(from, before), 15);
    assert.equal(formatAgeFromDates(from, before), "15 years");
  });

  test("anniversary day counts the new year", () => {
    const from = new Date(Date.UTC(2010, 9, 12));
    const onDay = new Date(Date.UTC(2026, 9, 12));
    assert.equal(wholeYearsBetween(from, onDay), 16);
    assert.equal(formatAgeFromDates(from, onDay), "16 years");
  });
});
