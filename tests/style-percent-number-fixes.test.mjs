import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { applyDeterministicStyleFilters } from "../lib/qc/editorial-compliance-reviewer.mjs";

function concernWithCite(rule, statement, cited, extras = {}) {
  const startChar = statement.indexOf(cited);
  assert.ok(startChar >= 0, `cited "${cited}" not in statement`);
  return {
    rule,
    concernCode: rule,
    note: extras.note || `${rule} on ${cited}`,
    suggestedDirection: extras.suggestedDirection || `Fix '${cited}'.`,
    span: [{ startChar, endChar: startChar + cited.length }],
  };
}

describe("B54 percentage_notation per cent", () => {
  test("keeps percentage_notation on two-word British '88 per cent'", () => {
    const statement = "Utilisation has reached a record 88 per cent.";
    const out = applyDeterministicStyleFilters(
      [concernWithCite("percentage_notation", statement, "88 per cent")],
      statement,
      statement
    );
    assert.equal(out.length, 1);
    assert.equal(out[0].concernCode, "percentage_notation");
  });

  test("keeps percentage_notation on one-word 'percent'", () => {
    const statement = "Net initial yield is 5.4 percent.";
    const out = applyDeterministicStyleFilters(
      [concernWithCite("percentage_notation", statement, "5.4 percent")],
      statement,
      statement
    );
    assert.equal(out.length, 1);
    assert.equal(out[0].concernCode, "percentage_notation");
  });

  test("drops percentage_notation when the cited span already uses %", () => {
    const statement = "Net initial yield is 5.4%.";
    const out = applyDeterministicStyleFilters(
      [concernWithCite("percentage_notation", statement, "5.4%")],
      statement,
      statement
    );
    assert.equal(out.length, 0);
  });

  test("drops percentage_notation when the statement uses % throughout", () => {
    const statement = "Net IRR to date stands at 14%.";
    const out = applyDeterministicStyleFilters(
      [
        concernWithCite("percentage_notation", statement, "14%", {
          note: "Use the % symbol.",
        }),
      ],
      statement,
      statement
    );
    assert.equal(out.length, 0);
  });
});

describe("F14 number_spelling spelled-out 0–12", () => {
  test("drops number_spelling on cited 'twelve'", () => {
    const statement =
      "The company anticipates two further bolt-on acquisitions over the coming twelve months.";
    const out = applyDeterministicStyleFilters(
      [concernWithCite("number_spelling", statement, "twelve")],
      statement,
      statement
    );
    assert.equal(out.length, 0);
  });

  test("drops number_spelling on cited 'twelve months' (prose duration, not a physical unit)", () => {
    const statement =
      "The company anticipates two further bolt-on acquisitions over the coming twelve months.";
    const out = applyDeterministicStyleFilters(
      [concernWithCite("number_spelling", statement, "twelve months")],
      statement,
      statement
    );
    assert.equal(out.length, 0);
  });

  test("keeps a genuine number_spelling violation on numeral 7", () => {
    const statement = "The Fund made 7 investments in the first year.";
    const out = applyDeterministicStyleFilters(
      [
        concernWithCite("number_spelling", statement, "7 investments", {
          suggestedDirection: "Replace '7' with 'seven'.",
        }),
      ],
      statement,
      statement
    );
    assert.equal(out.length, 1);
    assert.equal(out[0].concernCode, "number_spelling");
  });
});
