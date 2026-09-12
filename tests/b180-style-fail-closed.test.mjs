import assert from "node:assert/strict";
import { describe, test } from "vitest";
import {
  applyDeterministicStyleFilters,
  suppressNoChangeDirections,
} from "../lib/qc/editorial-compliance-reviewer.mjs";

function spanless(rule, statement, extras = {}) {
  return {
    rule,
    concernCode: rule,
    note: extras.note || `${rule} on spanless statement`,
    suggestedDirection: extras.suggestedDirection || `Fix ${rule}.`,
    suggestedRewrite: extras.suggestedRewrite || "",
  };
}

describe("B180 span-free statement-scoped filters", () => {
  test("T1 smart_quotes on a statement using only straight quotes: DROPPED", () => {
    const statement = 'The update said "growth remains on track" for the year.';
    const out = applyDeterministicStyleFilters(
      [spanless("smart_quotes", statement)],
      statement,
      statement
    );
    assert.equal(out.length, 0);
  });

  test("T2 smart_quotes on a statement containing a curly quote: KEPT", () => {
    const statement = "The update said \u201Cgrowth remains on track\u201D for the year.";
    const out = applyDeterministicStyleFilters(
      [spanless("smart_quotes", statement)],
      statement,
      statement
    );
    assert.equal(out.length, 1);
    assert.equal(out[0].concernCode, "smart_quotes");
  });

  test("T3 em_dash on a statement with no dash of any kind: DROPPED", () => {
    const statement = "The Company completed the acquisition in the second quarter.";
    const out = applyDeterministicStyleFilters(
      [spanless("em_dash", statement)],
      statement,
      statement
    );
    assert.equal(out.length, 0);
  });

  test("T4 em_dash on a statement containing an em dash: KEPT", () => {
    const statement = "The Company completed the acquisition \u2014 a second-quarter close.";
    const out = applyDeterministicStyleFilters(
      [spanless("em_dash", statement)],
      statement,
      statement
    );
    assert.equal(out.length, 1);
    assert.equal(out[0].concernCode, "em_dash");
  });

  test("T5 thousand_separator on apostrophe grouping (F13:S11 / B176): DROPPED", () => {
    const statement =
      "Third, the addressable European market of 14'000 forwarders gives meaningful headroom from the Company's current 8.6% penetration.";
    const out = applyDeterministicStyleFilters(
      [spanless("thousand_separator", statement)],
      statement,
      statement
    );
    assert.equal(out.length, 0);
  });

  test("T6 thousand_separator on a statement containing 5,500: KEPT", () => {
    const statement = "Headcount reached 5,500 by year end.";
    const out = applyDeterministicStyleFilters(
      [spanless("thousand_separator", statement)],
      statement,
      statement
    );
    assert.equal(out.length, 1);
    assert.equal(out[0].concernCode, "thousand_separator");
  });

  test("T7 a rule not in STYLE_RULE_STATEMENT_SCOPED, with no span: KEPT", () => {
    const statement = "The advisers included legal, tax, and operations specialists.";
    const out = applyDeterministicStyleFilters(
      [spanless("oxford_comma", statement)],
      statement,
      statement
    );
    assert.equal(out.length, 1);
    assert.equal(out[0].concernCode, "oxford_comma");
  });
});

describe("B180 suppressNoChangeDirections", () => {
  test("T8 No change needed at the start of the direction: DROPPED", () => {
    const out = suppressNoChangeDirections([
      spanless("oxford_comma", "", {
        suggestedDirection: "No change needed as the Oxford comma is correctly used.",
      }),
    ]);
    assert.equal(out.length, 0);
  });

  test("T9 Replace X with identical X: DROPPED", () => {
    const out = suppressNoChangeDirections([
      spanless("currency_format", "", {
        suggestedDirection: "Replace 'EUR 84 million' with 'EUR 84 million'.",
      }),
    ]);
    assert.equal(out.length, 0);
  });

  test("T10 Replace 5,500 with 5'500: KEPT", () => {
    const out = suppressNoChangeDirections([
      spanless("thousand_separator", "", {
        suggestedDirection: "Replace '5,500' with '5'500'.",
      }),
    ]);
    assert.equal(out.length, 1);
  });

  test("T11 one of two Replace pairs is a no-op: KEPT", () => {
    const out = suppressNoChangeDirections([
      spanless("currency_format", "", {
        suggestedDirection:
          "Replace 'EUR 84 million' with 'CHF 84 million' and '5,500' with '5,500'.",
      }),
    ]);
    assert.equal(out.length, 1);
  });

  test("T12 no change needed mentioned mid-sentence of a real proposal: KEPT", () => {
    const out = suppressNoChangeDirections([
      spanless("thousand_separator", "", {
        suggestedDirection:
          "Replace '5,500' with '5'500'; no change needed to the surrounding wording.",
      }),
    ]);
    assert.equal(out.length, 1);
  });
});
