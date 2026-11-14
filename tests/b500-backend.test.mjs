/**
 * B500. One explanation, and export counts from the combined state.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { assessmentCountLines, combinedVerdict } from "../lib/qc/combined-verdict.mjs";
import { presentExplanation } from "../lib/qc/reader-reason.mjs";

function resolve(card) {
  return combinedVerdict({
    verdict: card.statementVerdict,
    editorialConcerns: card.editorialConcerns,
    complianceVerdict: card.complianceVerdict,
    complianceConcerns: card.complianceConcerns,
  });
}

test("an explanation does not repeat a quote the excerpt already shows", () => {
  const quote = "We have committed funding for";
  const shown = presentExplanation(
    `The memo states "${quote}". A source supports part of this statement, not all of it. The wording is yours.`,
    [`The board minute says we have committed funding for the plant.`],
  );
  assert.equal(shown, "");
  const kept = presentExplanation(
    `The memo states "${quote}". The figure in the draft is higher.`,
    [quote],
  );
  assert.equal(kept, "The figure in the draft is higher.");
  assert.equal(kept.includes(quote), false);
});

test("export counts each card once, by combined state", () => {
  const cards = [
    { statementVerdict: { state: "conflicts" }, editorialConcerns: [], complianceConcerns: [], complianceVerdict: "clean" },
    { statementVerdict: { state: "not_in_source" }, editorialConcerns: [], complianceConcerns: [], complianceVerdict: "clean" },
    { statementVerdict: { state: "nothing_raised" }, editorialConcerns: [], complianceConcerns: [{ concernCode: "x" }], complianceVerdict: "hard_concern" },
    { statementVerdict: { state: "beyond" }, editorialConcerns: [{ concernCode: "structural_integrity" }], complianceConcerns: [], complianceVerdict: "clean" },
    { statementVerdict: { state: "partial" }, editorialConcerns: [], complianceConcerns: [], complianceVerdict: "clean" },
    { statementVerdict: { state: "note_withheld" }, editorialConcerns: [], complianceConcerns: [], complianceVerdict: "clean" },
    { statementVerdict: { state: "nothing_raised" }, editorialConcerns: [{ concernCode: "structural_integrity" }], complianceConcerns: [], complianceVerdict: "clean" },
    { statementVerdict: { state: "nothing_raised" }, editorialConcerns: [], complianceConcerns: [], complianceVerdict: "clean" },
  ];
  const lines = assessmentCountLines(cards, resolve);
  assert.deepEqual(lines.map((line) => line.text), [
    "1 conflicts with the source",
    "1 is not in the source",
    "1 compliance risk",
    "2 go beyond the source",
    "1 needs a look",
    "1 has craft or compliance notes",
  ]);
  const counted = lines.reduce((sum, line) => sum + line.count, 0);
  assert.equal(counted, cards.filter((card) => resolve(card).state !== "nothing_raised").length);
  for (const line of lines) {
    const matches = cards.filter((card) => line.states.includes(resolve(card).state));
    assert.equal(matches.length, line.count);
  }
});
