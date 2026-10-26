import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { statementVerdict } from "../lib/qc/statement-verdict.mjs";
import { READER_LINES } from "../lib/qc/reader-lines.mjs";
import {
  annotateStored,
  identityOf,
  notReviewedReasonFromMatches,
  partialGroundFromMatches,
  scrubConcernList,
} from "../lib/qc/worked-record.mjs";
import { replayStored } from "../scripts/diagnostic/b438/replay.mjs";

describe("B438 record without moving a verdict", () => {
  test("a partial ground is copied and the class stays", () => {
    const card = {
      supportState: "partial",
      displayVerdict: "supported_partial",
      sentenceLabel: "Nothing raised",
      tier: "quiet",
      evidenceSummary: "The year is in the source. The headcount is not.",
      editorialConcerns: [],
    };
    const next = annotateStored(card);
    assert.equal(next.supportState, "partial");
    assert.equal(next.displayVerdict, "supported_partial");
    assert.equal(next.sentenceLabel, "Nothing raised");
    assert.equal(next.tier, "quiet");
    assert.equal(next.partialGround.recorded, true);
    assert.match(next.partialGround.text, /headcount/);
  });

  test("a partial with no summary records that the ground is absent", () => {
    const next = annotateStored({
      supportState: "partial",
      displayVerdict: "supported_partial",
      evidenceSummary: "  ",
    });
    assert.equal(next.partialGround.recorded, false);
    assert.equal(next.partialGround.absentAt, "stage2 match explanation");
    assert.equal(next.supportState, "partial");
  });

  test("a live match explanation is the ground", () => {
    const ground = partialGroundFromMatches([
      { classification: "partially_confirmed", explanation: "The year is backed. The count is not." },
      { classification: "confirmed", explanation: "The year is in the source." },
    ]);
    assert.equal(ground.text, "The year is backed. The count is not.");
    assert.equal(ground.source, "stage2_explanation");
  });

  test("an empty not-reviewed reason becomes could_not_determine", () => {
    const card = {
      displayVerdict: "not reviewed",
      supportState: "skipped",
      sentenceLabel: "Nothing raised",
      tier: "quiet",
      evidenceNotReviewedReason: null,
    };
    const next = annotateStored(card);
    assert.deepEqual(identityOf(card), identityOf(next));
    assert.equal(next.evidenceNotReviewedReason, "could_not_determine");
    assert.equal(next.notReviewedRecord.determined, false);
  });

  test("an empty confirmation is a known reason", () => {
    assert.equal(
      notReviewedReasonFromMatches([{ emptyConfirmationRefused: true, classification: "not_reviewed" }]),
      "empty_confirmation_refused"
    );
  });

  test("a resolved organisation removes the false sentence and keeps the concern", () => {
    const concerns = [
      {
        concernCode: "voice_consistency",
        text: "The statement uses first person. The authoring organisation is not identified in this draft.",
      },
    ];
    const next = scrubConcernList(concerns, "Halden Group");
    assert.equal(next.length, 1);
    assert.equal(next[0].concernCode, "voice_consistency");
    assert.equal(next[0].text, "The statement uses first person.");
    assert.match(scrubConcernList(concerns, null)[0].text, /not identified/);
  });

  test("the sentence label does not read the display verdict", () => {
    const verdict = statementVerdict({ facts: [], note: null, entries: [] });
    assert.equal(verdict.state, "nothing_raised");
    assert.equal(verdict.tier, "quiet");
  });

  test("reader lines live in one block", () => {
    assert.match(READER_LINES.noteWithheld, /could not be shown/);
    assert.match(READER_LINES.writerWithheld, /could not be shown/);
    assert.doesNotMatch(READER_LINES.noteWithheld, /system/i);
  });

  test("both stored passes keep identity", () => {
    const result = replayStored();
    assert.equal(result.passes.length, 2);
    for (const pass of result.passes) {
      assert.equal(pass.count, 261);
      const moved = pass.rows.filter((row) => row.moved.length);
      assert.deepEqual(moved, []);
    }
  });
});
