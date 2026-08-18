import assert from "node:assert/strict";
import { describe, test } from "vitest";
import {
  applyDeterministicStyleFilters,
  isQuarterNotationSpan,
} from "../lib/qc/editorial-compliance-reviewer.mjs";

function spellingConcern(statement, cited) {
  const startChar = statement.indexOf(cited);
  assert.ok(startChar >= 0, `cited ${cited} not in statement`);
  return {
    rule: "number_spelling",
    concernCode: "number_spelling",
    note: `Spell out ${cited}.`,
    suggestedDirection: `Replace '${cited}' with a spelled form.`,
    span: [{ startChar, endChar: startChar + cited.length }],
  };
}

describe("F8 number_spelling quarter-notation filter", () => {
  test("isQuarterNotationSpan matches Qn, Qn YYYY, nQ, n quarter", () => {
    assert.equal(isQuarterNotationSpan("Q3 2010"), true);
    assert.equal(isQuarterNotationSpan("Q1"), true);
    assert.equal(isQuarterNotationSpan("3Q25"), true);
    assert.equal(isQuarterNotationSpan("3rd quarter"), true);
    assert.equal(isQuarterNotationSpan("in Q3 2010"), true);
    assert.equal(isQuarterNotationSpan("8 employees"), false);
    assert.equal(isQuarterNotationSpan("12 investments"), false);
  });

  test("drops number_spelling whose cited span is Q3 2010", () => {
    const statement = "Revenue in Q3 2010 was GBP 12 million.";
    const out = applyDeterministicStyleFilters(
      [spellingConcern(statement, "Q3 2010")],
      statement,
      statement
    );
    assert.equal(out.length, 0);
  });

  test("keeps a genuine number_spelling violation", () => {
    const statement = "The Fund made 7 new investments across the portfolio.";
    const out = applyDeterministicStyleFilters(
      [spellingConcern(statement, "7 new investments")],
      statement,
      statement
    );
    assert.equal(out.length, 1);
    assert.equal(out[0].concernCode, "number_spelling");
  });

  test("does not drop other concern types citing a quarter", () => {
    const statement = "The closing occurred in Q3 2010.";
    const startChar = statement.indexOf("Q3 2010");
    const out = applyDeterministicStyleFilters(
      [
        {
          rule: "date_format",
          concernCode: "date_format",
          note: "Use full month names.",
          span: [{ startChar, endChar: startChar + 7 }],
        },
      ],
      statement,
      statement
    );
    assert.equal(out.length, 1);
    assert.equal(out[0].concernCode, "date_format");
  });
});
