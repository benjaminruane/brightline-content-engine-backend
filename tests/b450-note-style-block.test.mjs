/**
 * B450. The craft note's house style is composed from the style guide.
 * The hand-written line is gone. Voice rules are not on the note.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { WRITER_FEEDBACK_PROMPT } from "../lib/qc/reading-contract.mjs";
import { STYLE_GUIDE_LAYER_1, STYLE_GUIDE_LAYER_2_CLIENT } from "../lib/qc/style-guide.mjs";
import {
  NOTE_ENFORCED_REWRITES,
  NOTE_PROMPT_ONLY,
  NOTE_STYLE_EXCLUSIONS,
  enforcedNoteStyleRuleIds,
  noteStyleRules,
  standardForNote,
  writerNoteStyleBlock,
} from "../lib/qc/note-style-block.mjs";
import { applyNoteHouseStyle } from "../lib/qc/note-house-style.mjs";

const KEPT_LINES = [
  "Write one short note to the writer about the draft as a whole.",
  "Speak as a senior editor talking to a colleague. Say what is strong and what is weak, plainly.",
  "Do not label the parts of the note and do not go sentence by sentence.",
  "Where a weakness has a clear example in the draft, quote the example rather than describing the problem in the abstract.",
  "Do not claim the draft has been checked against the source.",
  'Return JSON only: {"note":"..."}',
];

describe("B450 note style block", () => {
  test("the prompt keeps Ben's lines and composes house style from the guide", () => {
    for (const line of KEPT_LINES) {
      assert.equal(WRITER_FEEDBACK_PROMPT.includes(line), true, line);
    }
    assert.equal(WRITER_FEEDBACK_PROMPT.includes("plain hyphens, never a long dash"), false);
    assert.match(
      WRITER_FEEDBACK_PROMPT,
      /These rules govern the note you are writing, not the draft you are reading/
    );
    assert.equal(WRITER_FEEDBACK_PROMPT.includes(writerNoteStyleBlock()), true);
    assert.equal(WRITER_FEEDBACK_PROMPT.includes("\u2014"), false);
    assert.equal(WRITER_FEEDBACK_PROMPT.includes("\u2013"), false);
    assert.equal(WRITER_FEEDBACK_PROMPT.includes("\u201C"), false);
    assert.equal(WRITER_FEEDBACK_PROMPT.includes("\u201D"), false);
    assert.equal(WRITER_FEEDBACK_PROMPT.includes("\u2018"), false);
    assert.equal(WRITER_FEEDBACK_PROMPT.includes("\u2019"), false);
  });

  test("voice and draft-judgment rules are excluded, and the rest are universal rules", () => {
    const ids = noteStyleRules().map((rule) => rule.id);
    for (const row of NOTE_STYLE_EXCLUSIONS) {
      assert.equal(ids.includes(row.id), false, row.id);
      assert.equal(WRITER_FEEDBACK_PROMPT.includes(`- ${row.id}:`), false, row.id);
    }
    assert.equal(ids.includes("first_person_plural"), false);
    assert.equal(ids.includes("em_dash"), true);
    assert.equal(ids.includes("percentage_notation"), true);
    assert.equal(ids.includes("english_variant"), true);
    assert.equal(ids.includes("thousand_separator"), true);
    for (const rule of noteStyleRules()) {
      assert.equal(rule.applies_to.includes("*"), true, rule.id);
      assert.equal(WRITER_FEEDBACK_PROMPT.includes(rule.correct_example.replaceAll("\u2014", "-").replaceAll("\u2013", "-")), true, rule.id);
    }
  });

  test("the enforcer rewrites only the safe rules, and they are in the guide", () => {
    const guideIds = new Set([...STYLE_GUIDE_LAYER_1, ...STYLE_GUIDE_LAYER_2_CLIENT].map((rule) => rule.id));
    const enforcedIds = enforcedNoteStyleRuleIds();
    assert.deepEqual(enforcedIds, NOTE_ENFORCED_REWRITES.map((row) => row.id));
    for (const id of enforcedIds) assert.equal(guideIds.has(id), true, id);
    const enforced = new Set(enforcedIds);
    const promptOnly = new Set(NOTE_PROMPT_ONLY.map((row) => row.id));
    for (const rule of noteStyleRules()) {
      assert.equal(enforced.has(rule.id) || promptOnly.has(rule.id), true, rule.id);
    }
    const curly = "The draft says \u201Cgrowth\u201D and the firm\u2019s \u2018plan\u2019.";
    assert.equal(applyNoteHouseStyle(curly), "The draft says \"growth\" and the firm's 'plan'.");
  });

  test("a missing description is refused", () => {
    assert.throws(() => standardForNote(""), /description is missing/);
  });
});
