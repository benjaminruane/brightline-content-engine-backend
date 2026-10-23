/**
 * B403B. A wording note does not mark the sentence. Every matcher hit is kept.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { locateElement } from "../lib/qc/b394-elements.mjs";
import {
  READING_NOTE_PROMPT,
  STATE_LABELS,
  WELL_SOURCED_LINE,
  applyReadingContract,
  buildFacts,
  draftHeader,
  sentenceState,
  shownOccurrences,
} from "../lib/qc/reading-contract.mjs";

function fact(status, surface = "HICL") {
  return { kind: "name", surface, status };
}

describe("B403B wording does not mark", () => {
  test("a wording note is nothing to raise and worth_a_look is gone", () => {
    const state = sentenceState([fact("matched")], { bucket: "wording", text: "Same point, other words." });
    assert.equal(state, "nothing_to_raise");
    assert.equal(STATE_LABELS.worth_a_look, undefined);
    assert.notEqual(state, null);
  });

  test("wording stays in the counts and is not on the header line", () => {
    const only = draftHeader([
      {
        facts: [fact("matched")],
        sentenceState: "nothing_to_raise",
        note: { bucket: "wording", text: "Same point, other words." },
      },
    ]);
    assert.equal(only.line, WELL_SOURCED_LINE);
    assert.equal(only.numbers, "1 of 1 facts matched · 0 to look at · 0 worth a glance");
    assert.equal(only.counts.wordingNotes, 1);
    assert.equal(only.counts.statements.nothing_to_raise, 1);

    const mixed = draftHeader([
      { facts: [fact("matched")], sentenceState: "nothing_to_raise", note: { bucket: "wording" } },
      { facts: [fact("matched")], sentenceState: "conflicts", note: { bucket: "conflicts" } },
      { facts: [fact("matched")], sentenceState: "nothing_to_raise", note: { bucket: "wording" } },
    ]);
    assert.equal(mixed.numbers, "3 of 3 facts matched · 1 to look at · 0 worth a glance");
    assert.match(mixed.line, /1 statement conflicts/);
  });

  test("the card stores a wording note behind a collapsed line", () => {
    const applied = applyReadingContract(
      { statement: "HICL grew.", displayVerdict: "supported_full", factualBadge: true },
      {
        facts: [fact("matched")],
        note: { bucket: "wording", text: "The source says grew and the statement says grew." },
        sentenceState: "nothing_to_raise",
      }
    );
    assert.equal(applied.sentenceState, "nothing_to_raise");
    assert.equal(applied.wordingLine, "1 wording note");
    assert.match(applied.readingNote.text, /grew/);
    assert.equal(applied.displayVerdict, "supported_full");
  });

  test("every matching line is kept and the card shows three", () => {
    const source = ["HICL one.", "Other.", "HICL two.", "HICL three.", "HICL four."].join("\n");
    const located = locateElement({ kind: "name", surface: "HICL" }, source);
    assert.equal(located.occurrenceCount, 4);
    assert.equal(located.occurrences.length, 4);
    assert.deepEqual(
      located.occurrences.map((row) => row.lineId),
      ["L1", "L3", "L4", "L5"]
    );
    assert.ok(located.occurrences[0].extract.includes("HICL"));
    assert.equal(located.occurrences[2].lineBeforeId, "L3");
    assert.equal(located.occurrences[2].lineAfterId, "L5");
    const facts = buildFacts({ statement: "HICL grew.", draft: "HICL grew.", sourceText: source });
    const matched = facts.find((row) => row.surface === "HICL");
    assert.equal(matched.lineGap, false);
    assert.equal(matched.occurrenceCount, matched.occurrences.length);
    const card = shownOccurrences(matched);
    assert.equal(card.shown.length, 3);
    assert.equal(card.more, "and 1 more");
    assert.equal(card.shown.length + 1, matched.occurrenceCount);
  });

  test("the prompt asks whether the claim changed and does not name the two acceptance sentences", () => {
    assert.match(READING_NOTE_PROMPT, /does the difference change what is being claimed, or only how it is said/);
    assert.equal(READING_NOTE_PROMPT.includes("conflicts|beyond"), false);
    assert.equal(READING_NOTE_PROMPT.toLowerCase().includes("budgets"), false);
    assert.equal(READING_NOTE_PROMPT.toLowerCase().includes("several"), false);
  });
});
