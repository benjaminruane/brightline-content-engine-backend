/**
 * B443. A refused craft note keeps both attempts. The card's identity does not move.
 * B444. The craft note is refused on its own list. The evidence ban is unchanged.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { assembleCard } from "../lib/qc/pipeline-v3/stage7-assemble-card.mjs";
import { noteEndorsement } from "../lib/qc/reading-contract.mjs";
import { attachReadingView, settleWriterNote } from "../lib/qc/reading-review.mjs";
import { identityOf } from "../lib/qc/worked-record.mjs";

const STATEMENT = "HICL delivered EBITDA in line with expectations.";
const SOURCE = "HICL delivered EBITDA in line with expectations during the period.";
const RETRY = "The previous note was refused. Write the note again without those words.";

function entry() {
  return {
    statementText: STATEMENT,
    startChar: 0,
    endChar: STATEMENT.length,
    sourceMatches: [{ sourceIndex: 0, classification: "confirmed", sourceLabel: "memo", passage: STATEMENT }],
    verdictResult: { verdict: "confirmed", hasConflict: false, contributingSourceIndices: [0] },
    excerptResult: { primaryExcerpt: { passage: STATEMENT, sourceLabel: "memo" } },
    supportSpans: [{ passage: STATEMENT, classification: "confirmed" }],
    editorialResult: {
      editorialVerdict: "concern",
      editorialConcerns: [{ concernCode: "sentence_length", note: "The sentence is long.", suggestedDirection: "Split it." }],
      complianceVerdict: "clean",
      complianceConcerns: [],
    },
  };
}

function noneNote() {
  return JSON.stringify({ bucket: "none", note: "", disputedIndices: [] });
}

async function card() {
  return assembleCard(entry(), 0, {
    pipelineRoute: "v4",
    reviewOptions: { evidenceEnabled: true, editorialEnabled: true, complianceEnabled: false },
    skipEditorialDuplicationJudge: true,
    sources: [{ text: SOURCE, label: "memo" }],
  });
}

describe("B443 writer refusal record", () => {
  test("the evidence ban still catches confirmed, and a missing retry is loud", () => {
    assert.equal(noteEndorsement("The draft is confirmed."), "confirmed");
    const shown = settleWriterNote(JSON.stringify({ note: "The draft is confirmed." }));
    assert.equal(shown.writerFeedbackStatus, "shown");
    assert.throws(
      () => settleWriterNote(JSON.stringify({ note: "The source confirms the opening." })),
      /retry text is missing/
    );
  });

  test("both refused attempts are kept, and the retry still does not name the phrase", () => {
    const settled = settleWriterNote(
      JSON.stringify({ note: "The source confirms the opening." }),
      JSON.stringify({ note: "The figures are verified against the source." })
    );
    assert.equal(settled.writerFeedback, null);
    assert.equal(settled.writerFeedbackStatus, "withheld");
    assert.equal(settled.writerFeedbackRefused, "The figures are verified against the source.");
    assert.equal(settled.writerFeedbackRefusal, "verified against the source");
    assert.deepEqual(settled.writerFeedbackAttempts, [
      { text: "The source confirms the opening.", reason: "the source confirms" },
      { text: "The figures are verified against the source.", reason: "verified against the source" },
    ]);
  });

  test("an empty retry keeps the first phrase on the attempt, and the old field stays empty", () => {
    const settled = settleWriterNote(JSON.stringify({ note: "The source confirms the opening." }), "{}");
    assert.equal(settled.writerFeedbackStatus, "withheld");
    assert.equal(settled.writerFeedbackRefused, "The source confirms the opening.");
    assert.equal(settled.writerFeedbackRefusal, "empty");
    assert.equal(settled.writerFeedbackAttempts[0].reason, "the source confirms");
    assert.equal(settled.writerFeedbackAttempts[1].reason, "empty");
  });

  test("a clean second attempt is shown, and the refused first attempt is still stored", () => {
    const settled = settleWriterNote(
      JSON.stringify({ feedback: "The source confirms the opening." }),
      JSON.stringify({ text: "The draft repeats its point." })
    );
    assert.equal(settled.writerFeedback, "The draft repeats its point.");
    assert.equal(settled.writerFeedbackStatus, "shown");
    assert.equal(settled.writerFeedbackRefusal, undefined);
    assert.equal(settled.writerFeedbackAttempts[0].reason, "the source confirms");
    assert.equal(settled.writerFeedbackAttempts[1].reason, null);
  });

  test("a refused note on the reading payload leaves the card identity unchanged", async () => {
    const before = await card();
    before.sentenceLabel = "Nothing raised";
    before.tier = "quiet";
    before.readingNote = { bucket: "none", text: "" };
    const identity = identityOf(before);
    const concerns = structuredClone(before.editorialConcerns);
    const seen = [];
    let calls = 0;
    const previous = process.env.QC_READING_VIEW;
    delete process.env.QC_READING_VIEW;
    const attached = await attachReadingView({
      cards: [before],
      sources: [{ text: SOURCE, label: "memo" }],
      complete: async (messages) => {
        seen.push(messages);
        calls += 1;
        if (calls === 1) return noneNote();
        if (calls === 2) return JSON.stringify({ note: "The source confirms the opening." });
        return JSON.stringify({ note: "The figures are verified against the source." });
      },
    });
    if (previous == null) delete process.env.QC_READING_VIEW;
    else process.env.QC_READING_VIEW = previous;
    assert.deepEqual(identityOf(attached.cards[0]), identity);
    assert.deepEqual(attached.cards[0].editorialConcerns, concerns);
    assert.equal(attached.reading.writerFeedback, null);
    assert.equal(attached.reading.writerFeedbackStatus, "withheld");
    assert.equal(attached.reading.writerFeedbackAttempts[0].reason, "the source confirms");
    assert.equal(attached.reading.writerFeedbackAttempts[1].reason, "verified against the source");
    assert.equal(typeof attached.reading.writerWithheldLine, "string");
    const retry = seen[2];
    assert.equal(retry[1].content.endsWith(RETRY), true);
    assert.equal(retry[1].content.includes("the source confirms"), false);
  });
});
