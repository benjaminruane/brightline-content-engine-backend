/**
 * B403A. A refused note cannot blank a sentence. A matched fact carries
 * the matcher's line. A period-length cardinal is not an element.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { droppedPeriodLengths, extractElements } from "../lib/qc/b394-elements.mjs";
import {
  READING_NOTE_PROMPT,
  STATE_LABELS,
  WELL_SOURCED_LINE,
  acceptNote,
  buildFacts,
  draftHeader,
  sentenceState,
  settleFacts,
} from "../lib/qc/reading-contract.mjs";

const SOURCE = ["The prior sentence.", "HICL grew in the period.", "The following sentence."].join("\n");

function fact(status, surface = "HICL") {
  return { kind: "name", surface, status };
}

describe("B403A note contract", () => {
  test("sentenceState is never null when the note is refused", () => {
    const state = sentenceState([fact("matched")], { refused: true });
    assert.equal(state, "nothing_raised");
    assert.notEqual(state, null);
    assert.equal(STATE_LABELS[state], "Nothing raised");
    assert.equal(sentenceState([fact("matched")], null), "nothing_raised");
  });

  test("a refused note does not set a state and the matched draft keeps the positive line", () => {
    const state = sentenceState([fact("matched")], { refused: true });
    assert.equal(state, "nothing_raised");
    const header = draftHeader([{ facts: [fact("matched")], sentenceState: state }]);
    assert.equal(header.counts.statements.nothing_raised, 1);
    assert.equal(header.counts.statements.note_withheld, 0);
    assert.equal(header.line, WELL_SOURCED_LINE);
  });

  test("not_found still beats a withheld note", () => {
    const state = sentenceState([fact("not_found", "HCIL")], { refused: true });
    assert.equal(state, "not_in_source");
  });

  test("a disputed index resolves and an out of range index does not", () => {
    const elements = [fact("matched", "HCIL"), fact("matched", "HICL")];
    const accepted = acceptNote(
      { bucket: "conflicts", text: "The statement says HCIL.", disputedIndices: [0, 9] },
      elements
    );
    assert.equal(accepted.ok, true);
    assert.deepEqual(accepted.note.disputedIndices, [0]);
    assert.equal(accepted.rejections[0].reason, "index_out_of_range");
    const settled = settleFacts(
      [
        { ...elements[0], status: "matched" },
        { ...elements[1], status: "matched" },
      ],
      accepted.note
    );
    assert.equal(settled[0].status, "matched_disputed");
    assert.equal(settled[1].status, "matched");
  });

  test("a kind prefix is stripped before a surface fallback matches", () => {
    const elements = [fact("matched", "HCIL")];
    const accepted = acceptNote(
      { bucket: "beyond", text: "The source does not use that spelling.", disputedElements: ["name: HCIL"] },
      elements
    );
    assert.deepEqual(accepted.note.disputedIndices, [0]);
    assert.equal(accepted.rejections.length, 0);
  });

  test("a matched fact carries the line, and the extract contains the surface", () => {
    const facts = buildFacts({
      statement: "HICL grew.",
      draft: "HICL grew.",
      sourceText: SOURCE,
    });
    const matched = facts.find((row) => row.surface === "HICL");
    assert.ok(matched);
    assert.equal(matched.status, "matched");
    assert.equal(matched.lineGap, false);
    assert.equal(matched.lineId, "L2");
    assert.equal(matched.lineBeforeId, "L1");
    assert.equal(matched.lineAfterId, "L3");
    assert.ok(matched.extract.includes("HICL"));
  });

  test("an empty note is refused unless the bucket is none", () => {
    const facts = [fact("matched")];
    const empty = acceptNote({ bucket: "wording", text: "  ", disputedIndices: [] }, facts);
    assert.equal(empty.ok, false);
    assert.equal(empty.reason, "empty_note");
    const none = acceptNote({ bucket: "none", text: "", disputedIndices: [] }, facts);
    assert.equal(none.ok, true);
    assert.equal(sentenceState(facts, { refused: true, reason: "empty_note" }), "nothing_raised");
  });

  test("the prompt does not offer a bucket string the model can copy", () => {
    assert.equal(READING_NOTE_PROMPT.includes("conflicts|beyond"), false);
    assert.match(READING_NOTE_PROMPT, /disputedIndices/);
  });

  test("a period-length cardinal is not an element when the source states the endpoints", () => {
    const statement = "HICL Infrastructure's performance for the five months to 28 February 2026 was positive.";
    const source = "The period from 1 October 2025 to 28 February 2026.";
    const facts = extractElements(statement, statement, source);
    assert.equal(
      facts.some((row) => row.surface.toLowerCase() === "five"),
      false
    );
    assert.equal(
      facts.some((row) => row.kind === "date" && row.surface.includes("28 February 2026")),
      true
    );
    const dropped = droppedPeriodLengths(statement, statement, source);
    assert.equal(dropped.length, 1);
    assert.equal(dropped[0].surface.toLowerCase(), "five");
    const kept = extractElements(
      "3i Group delivered a total return for the six months to 30 June 2025.",
      "",
      "Results for the six months to 30 September 2025."
    );
    assert.equal(
      kept.some((row) => row.surface.toLowerCase() === "six"),
      true
    );
    const planted = extractElements(
      "Performance for the six months to 31 December 2025 was positive.",
      "",
      source
    );
    assert.equal(
      planted.some((row) => row.surface.toLowerCase() === "six"),
      true
    );
    const count = extractElements("Action completed two financing transactions.", "", source);
    assert.equal(
      count.some((row) => row.surface.toLowerCase() === "two"),
      true
    );
  });
});
