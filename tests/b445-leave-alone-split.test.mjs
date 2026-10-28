/**
 * B445. Evidence leave-alone ignores a scanned house-style concern.
 * The combined quiet number still counts every layer.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import {
  applyMechanicsScan,
  evidenceQuietOf,
  houseStyleMentions,
  isScannedHouseStyle,
  layerSpoken,
  quietOf,
  tallyLeaveAlone,
} from "../scripts/diagnostic/lib/leave-alone.mjs";

function card(overrides) {
  return {
    statement: "Revenue grew 11 percent.",
    displayVerdict: "supported_full",
    editorialConcerns: [],
    editorialVerdict: "clean",
    complianceConcerns: [],
    ...overrides,
  };
}

describe("B445 leave-alone split", () => {
  test("the six layers are the B441 layers", () => {
    assert.deepEqual(Object.keys(layerSpoken(card())), [
      "evidence",
      "editorial",
      "compliance",
      "note",
      "framing",
      "recency",
    ]);
  });

  test("a percentage concern leaves the evidence number and leaves the combined number", () => {
    const row = card({
      editorialConcerns: [{ concernCode: "percentage_notation", text: "percent" }],
      editorialVerdict: "concern",
    });
    assert.equal(quietOf(row), false);
    assert.equal(evidenceQuietOf(row), true);
    assert.deepEqual(houseStyleMentions(row), ["percentage_notation"]);
  });

  test("a factual challenge is not evidence leave-alone", () => {
    const row = card({ displayVerdict: "conflict" });
    assert.equal(quietOf(row), false);
    assert.equal(evidenceQuietOf(row), false);
  });

  test("a craft concern still speaks on the evidence number", () => {
    const row = card({
      editorialConcerns: [
        { concernCode: "materiality", text: "The claim is thin." },
        { concernCode: "percentage_notation", text: "percent" },
      ],
    });
    assert.equal(evidenceQuietOf(row), false);
    assert.deepEqual(houseStyleMentions(row), ["percentage_notation"]);
  });

  test("first-person voice_consistency is house style, and a voice switch is not", () => {
    const pronoun = { concernCode: "voice_consistency", text: "The statement uses the first person." };
    const voice = { concernCode: "voice_consistency", text: "The sentence switches into the passive." };
    assert.equal(isScannedHouseStyle(pronoun), true);
    assert.equal(isScannedHouseStyle(voice), false);
    const row = card({ editorialConcerns: [voice] });
    assert.equal(evidenceQuietOf(row), false);
  });

  test("the scan replaces occurrence concerns with one concern per rule", () => {
    const statement = "Cuts were 34 percent and 28 percent.";
    const row = card({
      statement,
      editorialConcerns: [
        { concernCode: "percentage_notation", text: "34 percent" },
        { concernCode: "percentage_notation", text: "28 percent" },
        { concernCode: "materiality", text: "The claim is thin." },
      ],
    });
    const next = applyMechanicsScan(row, "reporting_commentary");
    const codes = next.editorialConcerns.map((item) => item.concernCode);
    assert.deepEqual(codes, ["materiality", "percentage_notation"]);
    const percentage = next.editorialConcerns[1];
    assert.equal(percentage.span.length, 2);
    assert.equal(percentage.text.includes("'34 percent'"), true);
    assert.equal(percentage.text.includes("'28 percent'"), true);
  });

  test("a card the reviewer did not review is left as stored", () => {
    const row = card({
      editorialVerdict: "not_reviewed",
      editorialConcerns: [],
      statement: "Revenue grew 11 percent.",
    });
    const next = applyMechanicsScan(row, "reporting_commentary");
    assert.equal(next, row);
  });

  test("a missing concern list is refused", () => {
    assert.throws(
      () => applyMechanicsScan(card({ editorialConcerns: null }), "reporting_commentary"),
      /editorialConcerns is missing/
    );
  });

  test("the tally reports the three numbers", () => {
    const quiet = card();
    const style = card({
      editorialConcerns: [
        { concernCode: "em_dash", text: "dash" },
        { concernCode: "em_dash", text: "dash" },
      ],
    });
    const conflict = card({ displayVerdict: "conflict" });
    const tally = tallyLeaveAlone([quiet, style, conflict]);
    assert.equal(tally.n, 3);
    assert.equal(tally.combinedQuiet, 1);
    assert.equal(tally.evidenceLeaveAlone, 2);
    assert.equal(tally.houseStyleMentions.em_dash, 2);
    assert.equal(tally.houseStyleStatements.em_dash, 1);
  });
});
