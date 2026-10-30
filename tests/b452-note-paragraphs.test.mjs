/**
 * B452. The craft note is stored as one string. The writer is asked for
 * paragraphs through the schema. The prompt is unchanged.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { craftNoteEndorsement } from "../lib/qc/craft-note-ban.mjs";
import { writerNoteStyleBlock } from "../lib/qc/note-style-block.mjs";
import { WRITER_FEEDBACK_PROMPT } from "../lib/qc/reading-contract.mjs";
import {
  joinWriterNoteParagraphs,
  settleWriterNote,
  writerJsonSchemaForSpan,
  writerText,
} from "../lib/qc/reading-review.mjs";

const EM = "\u2014";

describe("B452 note paragraphs", () => {
  test("the writer schema requires at least two paragraphs, and the prompt does not", () => {
    const schema = writerJsonSchemaForSpan("b404-writer");
    assert.equal(schema.properties.note.type, "array");
    assert.equal(schema.properties.note.minItems, 2);
    assert.equal(schema.properties.note.items.type, "string");
    assert.equal(writerJsonSchemaForSpan("b404-note"), undefined);
    assert.match(WRITER_FEEDBACK_PROMPT, /Do not label the parts of the note and do not go sentence by sentence\./);
    assert.match(WRITER_FEEDBACK_PROMPT, /Return JSON only: \{"note":"\.\.\."\}/);
    assert.equal(WRITER_FEEDBACK_PROMPT.includes(writerNoteStyleBlock()), true);
    assert.equal(WRITER_FEEDBACK_PROMPT.includes("at least two"), false);
  });

  test("paragraphs join with a blank line, and house style runs on the joined text", () => {
    const raw = JSON.stringify({
      note: [`The close was early ${EM} ahead of plan.`, "Growth of 14 percent is the claim."],
    });
    assert.equal(
      writerText(raw),
      "The close was early - ahead of plan.\n\nGrowth of 14% is the claim.",
    );
    assert.equal(joinWriterNoteParagraphs(["  First.  ", "", "Second."]), "First.\n\nSecond.");
  });

  test("a string is still a note, a stringified list is unwrapped, and a broken list is not", () => {
    assert.equal(writerText('{"note":"The opening is buried."}'), "The opening is buried.");
    assert.equal(writerText(JSON.stringify({ note: ["Only one."] })), "Only one.");
    assert.equal(writerText(JSON.stringify({ note: ["One.", 2] })), "");
    assert.equal(writerText(JSON.stringify({ note: [] })), "");
    assert.equal(
      joinWriterNoteParagraphs(JSON.stringify(["First paragraph.", "Second paragraph."])),
      "First paragraph.\n\nSecond paragraph.",
    );
    const broken = '["The opening is clear.", "The line says "hello" and then stops."]';
    assert.equal(
      joinWriterNoteParagraphs(broken),
      'The opening is clear.\n\nThe line says "hello" and then stops.',
    );
    assert.equal(joinWriterNoteParagraphs("[See the note.]"), "[See the note.]");
  });

  test("the ban and a withheld retry see the joined text", () => {
    const raw = JSON.stringify({
      note: ["The opening is buried.", "The source confirms the close."],
    });
    const text = writerText(raw);
    assert.equal(craftNoteEndorsement(text), "the source confirms");
    const settled = settleWriterNote(raw, raw);
    assert.equal(settled.writerFeedback, null);
    assert.equal(settled.writerFeedbackStatus, "withheld");
    assert.equal(settled.writerFeedbackAttempts[0].text.includes("\n\n"), true);
  });
});
