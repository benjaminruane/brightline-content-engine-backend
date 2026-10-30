/**
 * B453. A refused note is Needs a look, tier demands.
 * A louder fact still wins. A wording note stays quiet.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { STATE_LABELS, sentenceState, sentenceTier } from "../lib/qc/reading-contract.mjs";
import { statementVerdict } from "../lib/qc/statement-verdict.mjs";
import { shownLabel, shownTier } from "../lib/qc/shown-verdict.mjs";

function fact(status) {
  return { kind: "name", surface: "Cirrus", status };
}

test("a refused note assigns note_withheld", () => {
  const verdict = statementVerdict({
    facts: [fact("matched")],
    note: { refused: true, reason: "bucket" },
    entries: [],
  });
  assert.equal(verdict.state, "note_withheld");
  assert.equal(verdict.tier, "demands");
  assert.equal(STATE_LABELS[verdict.state], "Needs a look");
  assert.equal(sentenceTier("note_withheld"), "demands");
  assert.equal(shownTier("note_withheld"), "demands");
  assert.equal(shownLabel({ statementVerdict: verdict, displayVerdict: "supported_full" }), "Needs a look");
  assert.equal(sentenceState([fact("matched")], { refused: true, reason: "endorsing_language" }), "note_withheld");
});

test("a missing fact still beats a refused note", () => {
  const verdict = statementVerdict({
    facts: [fact("not_found")],
    note: { refused: true, reason: "bucket" },
    entries: [],
  });
  assert.equal(verdict.state, "not_in_source");
  assert.equal(verdict.tier, "demands");
});

test("a wording note stays nothing raised", () => {
  const verdict = statementVerdict({
    facts: [fact("matched")],
    note: { bucket: "wording", text: "The source confirms this in other words." },
    entries: [],
  });
  assert.equal(verdict.state, "nothing_raised");
  assert.equal(verdict.tier, "quiet");
});

test("a missing note stays nothing raised", () => {
  const verdict = statementVerdict({
    facts: [fact("matched")],
    note: null,
    entries: [],
  });
  assert.equal(verdict.state, "nothing_raised");
});
