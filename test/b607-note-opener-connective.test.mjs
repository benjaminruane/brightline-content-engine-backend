/**
 * B607. When alignNoteOpenerWithLabel drops the opener, strip a dangling connective
 * from the new first sentence.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import {
  alignNoteOpenerWithLabel,
  stripDanglingOpenerConnective,
} from "../lib/qc/note-card-consistency.mjs";

test("Ostara: dropped opener clears leading 'also' on the next sentence", () => {
  const note = [
    "The draft is close to final and needs only light edits.",
    "The opening characterisation also runs ahead of what either source will carry.",
    "Two sentences need a harder look against the fact sheet.",
  ].join(" ");
  const out = alignNoteOpenerWithLabel(note, "Needs significant work");
  assert.match(out, /^The opening characterisation runs ahead/);
  assert.doesNotMatch(out, /\balso runs ahead\b/);
});

test("'However, the NAV ...' becomes 'The NAV ...'", () => {
  assert.equal(
    stripDanglingOpenerConnective("However, the NAV uses the March figure."),
    "The NAV uses the March figure.",
  );
  const note = [
    "The text is close to final, with the narrative arc in good shape.",
    "However, the NAV uses the March figure.",
  ].join(" ");
  const out = alignNoteOpenerWithLabel(note, "Needs significant work");
  assert.equal(out, "The NAV uses the March figure.");
});

test("leading That said / Still are cleared", () => {
  assert.equal(
    stripDanglingOpenerConnective("That said, the second sentence overreaches."),
    "The second sentence overreaches.",
  );
  assert.equal(
    stripDanglingOpenerConnective("Still, the figure needs checking."),
    "The figure needs checking.",
  );
});
