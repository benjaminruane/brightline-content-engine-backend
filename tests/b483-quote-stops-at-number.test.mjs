/**
 * B483. The quote is the number and the word that follows it.
 * A word before the number is not shown.
 * lib/qc/quantity-reading.mjs is the span.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "vitest";
import { readQuantities } from "../lib/qc/quantity-reading.mjs";
import { resolveSupersession } from "../lib/qc/supersession.mjs";

function dated(raw, iso) {
  return { date: new Date(iso), raw, cue: "Date: label" };
}

const ordered = {
  0: dated("15 April 2025", "2025-04-15T00:00:00Z"),
  1: dated("28 May 2025", "2025-05-28T00:00:00Z"),
};

function quote(text) {
  return readQuantities(text).map((row) => row.raw);
}

function note(earlier, later) {
  return resolveSupersession({
    statement: earlier,
    aggregateVerdict: "conflicting",
    sourceMatches: [
      { sourceIndex: 0, sourceLabel: "alpha memo", classification: "confirmed", passage: earlier },
      { sourceIndex: 1, sourceLabel: "beta memo", classification: "conflicting", passage: later },
    ],
    asOfBySourceIndex: ordered,
    sources: [{ label: "alpha memo" }, { label: "beta memo" }],
  }).supersededNotes[0];
}

describe("B483 quote stops at the number", () => {
  test("nothing before the number is inside the quote", () => {
    assert.deepEqual(quote("It generates ARR of EUR 38 million"), ["EUR 38 million"]);
    assert.deepEqual(quote("The Company reported revenue of EUR 92 million in FY2024"), ["EUR 92 million"]);
    assert.deepEqual(quote("Cleaned ARR is EUR 35 million"), ["EUR 35 million"]);
    assert.deepEqual(quote("Management confirmed the headcount was 240"), ["240"]);
    assert.deepEqual(quote("The total is 142"), ["142"]);
  });

  test("a word that follows the number stays in the quote", () => {
    assert.deepEqual(quote("1.2 GW"), ["1.2 GW"]);
    assert.deepEqual(quote("240 staff"), ["240 staff"]);
    assert.deepEqual(quote("41 portfolio companies"), ["41 portfolio companies"]);
    assert.deepEqual(quote("412 property management companies"), ["412 property management companies"]);
    assert.deepEqual(quote("23% IRR"), ["23% IRR"]);
    assert.deepEqual(quote("2.6x MOIC"), ["2.6x MOIC"]);
  });

  test("several numbers under one shared word still produce nothing", () => {
    const draft = "Average session length is 12 minutes, against 18 minutes and a peer median of 15 minutes.";
    assert.deepEqual(note(draft, draft), undefined);
    assert.deepEqual(note(draft, "Average session length is 20 minutes."), undefined);
  });

  test("the unit vocabulary test still has no unit word in the reader", () => {
    const src = readFileSync(new URL("../lib/qc/quantity-reading.mjs", import.meta.url), "utf8");
    for (const word of ["GW", "MW", "MOIC", "IRR", "bps", "basis points", "people", "staff", "employees", "stores", "minutes", "tonnes", "acres", "companies"]) {
      const pattern = word.includes(" ")
        ? new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
        : new RegExp(`\\b${word}\\b`, "i");
      assert.equal(pattern.test(src), false, word);
    }
  });
});
