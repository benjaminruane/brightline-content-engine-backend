/**
 * B502. Draft marks follow the card's combined state.
 * Nothing raised keeps none. A held-back note's solid mark does not survive.
 * Dotted marks stay only on craft or compliance notes.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { buildDraftMarks, marksForCombinedState } from "../lib/qc/draft-marks.mjs";

const SENTENCE = "Revenue has grown from EUR 312 million in 2020 to EUR 587 million in 2024, a compound annual rate of 17%.";
const PHRASE = "a compound annual rate of 17%";

test("a Nothing raised card drops the held-back note's solid mark", () => {
  const note = {
    bucket: "beyond",
    text: `The statement rounds "${PHRASE}", which the source states as 17.1%.`,
  };
  const built = buildDraftMarks({
    draft: SENTENCE,
    statements: [{ index: 6, id: "6", text: SENTENCE, note, facts: [] }],
    entries: [],
  });
  assert.equal(built.marks.some((mark) => mark.surface === PHRASE), true);
  const quiet = {
    index: 6,
    statement: SENTENCE,
    statementVerdict: { state: "nothing_raised" },
    wordingNoteWithheld: { count: 1, text: "The statement rounds this to 17%, which does not change the claim." },
  };
  assert.equal(marksForCombinedState(built.marks, [quiet]).length, 0);
  const loud = {
    index: 6,
    statement: SENTENCE,
    statementVerdict: { state: "beyond" },
  };
  assert.equal(marksForCombinedState(built.marks, [loud]).some((mark) => mark.surface === PHRASE), true);
});

test("craft or compliance notes keep a dotted mark and drop a solid one", () => {
  const solid = {
    start: 0,
    end: 3,
    statementIndex: 1,
    kind: "fact",
    severity: "concern",
    origin: "note",
    surface: "17%",
  };
  const dotted = {
    start: 4,
    end: 8,
    statementIndex: 1,
    kind: "editorial",
    severity: "concern",
    origin: "action",
    surface: "rate",
  };
  const card = {
    index: 1,
    statementVerdict: { state: "nothing_raised" },
    editorialConcerns: [{ concernCode: "hype", text: "exceptional" }],
  };
  const kept = marksForCombinedState([solid, dotted], [card]);
  assert.deepEqual(kept.map((mark) => mark.kind), ["editorial"]);
});
