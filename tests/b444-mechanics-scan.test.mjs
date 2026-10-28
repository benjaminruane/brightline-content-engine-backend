/**
 * B444. The scan finds percentage, long dash, and first person.
 * The review prompt does not ask the model for those three.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import editorialRules from "../lib/rulebook/editorialRules.js";
import { OUTPUT_TYPE, getOutputTypeLabel } from "../lib/output-intent.js";
import { resolveStyleGuide } from "../lib/qc/style-guide.mjs";
import { buildEditorialStyleSystemPrompt } from "../lib/qc/editorial-compliance-reviewer.mjs";
import { scanMechanics } from "../lib/qc/mechanics-scan.mjs";
import { applyEditorialSourceAwareness } from "../lib/qc/editorial-source-awareness.mjs";

function codes(statement, outputType) {
  return scanMechanics({ statement, outputType }).map((row) => ({
    code: row.concernCode,
    quote: row.quote,
  }));
}

describe("B444 mechanics scan", () => {
  test("each spelled percentage is one concern, and a % sign is not", () => {
    const statement = "Yield is 5.4 percent and utilisation is 88 per cent. Margin is 12%.";
    const rows = scanMechanics({ statement, outputType: "reporting_commentary" });
    const percentages = rows.filter((row) => row.concernCode === "percentage_notation");
    assert.deepEqual(percentages.map((row) => row.quote), ["5.4 percent", "88 per cent"]);
    assert.equal(percentages[0].text.includes("'5.4 percent'"), true);
    assert.equal(statement.slice(percentages[0].span[0].startChar, percentages[0].span[0].endChar), "5.4 percent");
  });

  test("each long dash outside quotation marks is one concern", () => {
    const statement = "The close was early \u2014 ahead of plan. The source said \"late \u2014 by a week\".";
    const dashes = scanMechanics({ statement, outputType: "reporting_commentary" })
      .filter((row) => row.concernCode === "em_dash");
    assert.equal(dashes.length, 1);
    assert.equal(dashes[0].quote, "\u2014");
  });

  test("an en dash uses the same rule, because that is the existing class", () => {
    const rows = codes("The range is 4\u20135 years.", "reporting_commentary");
    assert.deepEqual(rows, [{ code: "em_dash", quote: "\u2013" }]);
  });

  test("first person on commentary is first_person_plural, one concern per pronoun", () => {
    const rows = codes("We recommend the deal on our reading of the file.", "reporting_commentary");
    assert.deepEqual(rows, [
      { code: "first_person_plural", quote: "We" },
      { code: "first_person_plural", quote: "our" },
    ]);
  });

  test("first person in a press release body is voice_consistency, and quoted speech is not", () => {
    const statement = 'The firm announced the close. "We will keep the plant," the chief executive said.';
    assert.deepEqual(codes(statement, "press_release"), []);
    const body = "We announced the close on Monday.";
    assert.deepEqual(codes(body, "press_release"), [{ code: "voice_consistency", quote: "We" }]);
  });

  test("the country abbreviation US is not the pronoun", () => {
    assert.deepEqual(
      codes("The firm supplies the leading US defense primes.", "press_release"),
      []
    );
    assert.deepEqual(codes("The firm told us the date.", "press_release"), [
      { code: "voice_consistency", quote: "us" },
    ]);
  });

  test("first person is not a concern where the house voice permits it", () => {
    const statement = "We believe the fund should deliver returns in line with its predecessor.";
    assert.deepEqual(codes(statement, "investor_letter"), []);
    assert.deepEqual(codes(statement, "linkedin_post"), []);
  });

  test("a spelled percentage that also sits in the matched passage is still a concern", () => {
    const statement = "Revenue grew 11 percent over five years.";
    const [row] = scanMechanics({ statement, outputType: "reporting_commentary" });
    const result = applyEditorialSourceAwareness({
      statement,
      concerns: [row],
      passages: ["Revenue grew 11 percent over five years in the source."],
      editorialVerdict: "concern",
      outputType: "reporting_commentary",
    });
    assert.equal(result.concerns.length, 1);
    assert.equal(result.concerns[0].quote, "11 percent");
  });

  test("a missing statement or output type is loud", () => {
    assert.throws(() => scanMechanics({ outputType: "press_release" }), /statement is missing/);
    assert.throws(() => scanMechanics({ statement: "We announced it." }), /output type is missing/);
    assert.throws(() => scanMechanics({ statement: "We announced it.", outputType: "poem" }), /house voice table/);
  });

  test("the review prompt does not ask for the scanned rules", () => {
    const commentary = buildEditorialStyleSystemPrompt({
      outputTypeLabel: getOutputTypeLabel(OUTPUT_TYPE.REPORTING_COMMENTARY),
      editorialRules,
      structuredStyleRules: resolveStyleGuide({
        outputType: OUTPUT_TYPE.REPORTING_COMMENTARY,
        promptHouseName: "Halden Group",
      }),
      outputSlug: "reporting_commentary",
      outputType: OUTPUT_TYPE.REPORTING_COMMENTARY,
      houseName: "Halden Group",
    });
    assert.equal(commentary.includes("\n- percentage_notation:"), false);
    assert.equal(commentary.includes("\n- em_dash:"), false);
    assert.equal(commentary.includes("\n- first_person_plural:"), false);
    assert.equal(commentary.includes("FIRST-PERSON REMOVAL"), false);
    assert.match(commentary, /oxford_comma:/);
    assert.match(commentary, /Flag an unintended switch in voice/);
    const release = buildEditorialStyleSystemPrompt({
      outputTypeLabel: getOutputTypeLabel(OUTPUT_TYPE.PRESS_RELEASE),
      editorialRules,
      structuredStyleRules: resolveStyleGuide({ outputType: OUTPUT_TYPE.PRESS_RELEASE, promptHouseName: "Halden Group" }),
      outputSlug: "press_release",
      outputType: OUTPUT_TYPE.PRESS_RELEASE,
      houseName: "Halden Group",
    });
    assert.equal(release.includes("Flag first person in the body"), false);
  });
});
