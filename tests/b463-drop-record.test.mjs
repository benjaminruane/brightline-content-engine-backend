/**
 * B463. A drop keeps the words, the rule, and the reason.
 * The silence that already counted the drop keeps its id, reason, and count.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { stripUnquotedCraft } from "../lib/qc/constructive-feedback.mjs";
import {
  concernContent,
  dropRecord,
  dropsFromRewrites,
  rejectionContent,
  silenceWithContent,
} from "../lib/qc/drop-record.mjs";

describe("B463 drop record", () => {
  test("the record is the rule, the reason, and the words", () => {
    const row = dropRecord("source_awareness", "dropped", "The objection names the source.");
    assert.deepEqual(row, {
      rule: "source_awareness",
      reason: "dropped",
      content: "The objection names the source.",
    });
  });

  test("a missing rule is refused", () => {
    assert.equal(dropRecord("", "dropped", "words"), null);
  });

  test("a silence keeps its count and gains the words", () => {
    const silence = silenceWithContent("note_rejections", "disputes were dropped", [
      { surface: "EUR 318 million", reason: "not_named" },
    ], rejectionContent);
    assert.equal(silence.id, "note_rejections");
    assert.equal(silence.reason, "disputes were dropped");
    assert.equal(silence.count, 1);
    assert.deepEqual(silence.content, ["EUR 318 million (not_named)"]);
  });

  test("a class rewrite becomes the same shape", () => {
    const rows = dropsFromRewrites([
      { rule: "period_gate", from: "confirmed", to: "conflicting", evidence: "2024 paired with 2023" },
    ]);
    assert.equal(rows[0].rule, "period_gate");
    assert.equal(rows[0].reason, "confirmed to conflicting");
    assert.equal(rows[0].content, "2024 paired with 2023");
  });

  test("a dropped craft paragraph is kept, and the piece the reader gets is the kept text", () => {
    const piece = "Ready.\n\nThe source says the figure.\n\nThis paragraph quotes nothing.";
    const notes = [{ statementText: "The source says the figure.", kind: "evidence", cardNote: "The source says the figure." }];
    const bag = [];
    const shown = stripUnquotedCraft(piece, { draftText: "other draft", notes, droppedParagraphs: bag });
    const plain = stripUnquotedCraft(piece, { draftText: "other draft", notes });
    assert.equal(shown, plain);
    assert.equal(bag.length, 1);
    assert.match(bag[0], /quotes nothing/);
    assert.equal(concernContent({ note: "The objection." }), "The objection.");
  });
});
