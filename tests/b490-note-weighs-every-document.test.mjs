/**
 * B490. The note weighs every document. A two-document disagreement is not wording.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { acceptNote, READING_NOTE_PROMPT } from "../lib/qc/reading-contract.mjs";
import { readingNoteSystem, readingSourceText } from "../lib/qc/reading-review.mjs";

test("the prompt carries every document block", () => {
  const system = readingNoteSystem(readingSourceText([
    { label: "18a_synth_cross_source_pair_initial", text: "Annual recurring revenue was EUR 38 million." },
    { label: "18b_synth_cross_source_pair_update", text: "Annual recurring revenue was EUR 35 million." },
  ]));
  assert.match(system, /Document: 18a_synth_cross_source_pair_initial/);
  assert.match(system, /Document: 18b_synth_cross_source_pair_update/);
  assert.match(READING_NOTE_PROMPT, /Weigh every document/);
  assert.match(READING_NOTE_PROMPT, /Do not call that statement a restatement/);
  assert.match(READING_NOTE_PROMPT, /do not call it the same claim/);
});

test("a two-document disagreement payload is not accepted as wording", () => {
  const accepted = acceptNote({
    bucket: "wording",
    text: "The statement restates the initial memo.",
    documentValues: [
      { document: "18a_synth_cross_source_pair_initial", value: "EUR 38 million" },
      { document: "18b_synth_cross_source_pair_update", value: "EUR 35 million" },
    ],
  }, []);
  assert.equal(accepted.ok, false);
  assert.equal(accepted.reason, "documents_disagree");
});
