import assert from "node:assert/strict";
import { test } from "vitest";
import { alignNoteOpenerWithLabel } from "../lib/qc/note-card-consistency.mjs";

const harbourline = "The text is close to final, with the narrative arc in good shape, but one figure is wrong. The NAV uses the 31 March figure; replace with EUR 678 million.";

test("'close to final' is dropped under Needs significant work", () => {
  assert.equal(alignNoteOpenerWithLabel(harbourline, "Needs significant work"), "The NAV uses the 31 March figure; replace with EUR 678 million.");
});

test("'close to final' stays under Needs work", () => {
  assert.equal(alignNoteOpenerWithLabel(harbourline, "Needs work"), harbourline);
});

test("'significant rework' is dropped under Minor points", () => {
  const note = "The draft needs significant rework before it can go out. Tighten the second sentence.";
  assert.equal(alignNoteOpenerWithLabel(note, "Minor points to address"), "Tighten the second sentence.");
});

test("a one-sentence note is never emptied", () => {
  assert.equal(alignNoteOpenerWithLabel("Close to final.", "Needs significant work"), "Close to final.");
});
