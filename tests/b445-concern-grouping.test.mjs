/**
 * B445. One concern per rule per statement. Every occurrence stays on span.
 * One occurrence is the same object the scan produced before grouping.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { scanMechanics } from "../lib/qc/mechanics-scan.mjs";
import { marksEntriesFromConcerns } from "../lib/qc/reading-review.mjs";

describe("B445 concern grouping", () => {
  test("one spelled percentage is the same concern as before grouping", () => {
    const statement = "Revenue grew 11 percent over five years.";
    const start = statement.indexOf("11 percent");
    const [row] = scanMechanics({ statement, outputType: "reporting_commentary" });
    assert.deepEqual(row, {
      concernCode: "percentage_notation",
      rule: "percentage_notation",
      category: "style_guide",
      note: "The percentage is written '11 percent'. Write it with %.",
      concernText: "The percentage is written '11 percent'. Write it with %.",
      text: "The percentage is written '11 percent'. Write it with %.",
      suggestedDirection: "Write '11 percent' with %.",
      quote: "11 percent",
      span: [{ startChar: start, endChar: start + "11 percent".length }],
    });
  });

  test("one long dash is the same concern as before grouping", () => {
    const statement = "The close was early \u2014 ahead of plan.";
    const start = statement.indexOf("\u2014");
    const [row] = scanMechanics({ statement, outputType: "reporting_commentary" });
    assert.equal(row.concernCode, "em_dash");
    assert.equal(row.text, "A long dash stands in this sentence. Use a hyphen.");
    assert.equal(row.suggestedDirection, "Replace the long dash with a hyphen.");
    assert.equal(row.quote, "\u2014");
    assert.deepEqual(row.span, [{ startChar: start, endChar: start + 1 }]);
  });

  test("one pronoun is the same concern as before grouping", () => {
    const statement = "We announced the close on Monday.";
    const [row] = scanMechanics({ statement, outputType: "press_release" });
    assert.equal(row.concernCode, "voice_consistency");
    assert.equal(row.category, "editorial");
    assert.equal(row.text, "'We' is the writer speaking as we. This piece speaks in the third person.");
    assert.equal(row.quote, "We");
    assert.equal(row.span.length, 1);
  });

  test("four percentages are one concern, and the prose names each one", () => {
    const statement = "Cuts were 34 percent, 28 percent, 22 percent and 40 percent.";
    const rows = scanMechanics({ statement, outputType: "reporting_commentary" });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].concernCode, "percentage_notation");
    assert.equal(rows[0].span.length, 4);
    assert.equal(
      rows[0].text,
      "The percentages are written '34 percent', '28 percent', '22 percent', and '40 percent'. Write them with %."
    );
    const located = rows[0].span.map((span) => statement.slice(span.startChar, span.endChar));
    assert.deepEqual(located, ["34 percent", "28 percent", "22 percent", "40 percent"]);
    assert.equal(rows[0].quote, "34 percent");
  });

  test("a percentage and a long dash stay two concerns", () => {
    const statement = "Margin rose 8 percent \u2014 ahead of the plan.";
    const rows = scanMechanics({ statement, outputType: "reporting_commentary" });
    assert.deepEqual(rows.map((row) => row.concernCode), ["percentage_notation", "em_dash"]);
    assert.equal(rows[0].span.length, 1);
    assert.equal(rows[1].span.length, 1);
  });

  test("two long dashes are one concern that says there are two", () => {
    const statement = "The close was early \u2014 ahead of plan \u2014 and held.";
    const [row] = scanMechanics({ statement, outputType: "reporting_commentary" });
    assert.equal(row.span.length, 2);
    assert.equal(row.text, "2 long dashes stand in this sentence. Use a hyphen.");
    assert.equal(row.suggestedDirection, "Replace each long dash with a hyphen.");
  });

  test("two pronouns are one concern, and the prose names both", () => {
    const statement = "We recommend the deal on our reading of the file.";
    const [row] = scanMechanics({ statement, outputType: "reporting_commentary" });
    assert.equal(row.concernCode, "first_person_plural");
    assert.equal(row.span.length, 2);
    assert.equal(
      row.text,
      "'We' and 'our' are the writer speaking as we. This piece speaks in the third person."
    );
    assert.equal(row.suggestedDirection, "Recast 'We' and 'our' into the third person.");
  });

  test("a draft mark points at every span, and one span is still one mark", () => {
    const statement = "Cuts were 34 percent and 28 percent.";
    const [grouped] = scanMechanics({ statement, outputType: "reporting_commentary" });
    const marks = marksEntriesFromConcerns([grouped], statement, 11);
    assert.equal(marks.length, 2);
    assert.deepEqual(
      marks.map((mark) => mark.thing1.quote),
      ["34 percent", "28 percent"]
    );
    assert.equal(marks[0].id, "S11:editorial:percentage_notation:0");
    assert.equal(marks[1].id, "S11:editorial:percentage_notation:1");
    const single = "Revenue grew 11 percent.";
    const [one] = scanMechanics({ statement: single, outputType: "reporting_commentary" });
    const oneMark = marksEntriesFromConcerns([one], single, 2);
    assert.equal(oneMark.length, 1);
    assert.equal(oneMark[0].thing1.quote, "11 percent");
    assert.equal(oneMark[0].id, "S2:editorial:percentage_notation:0");
  });
});
