/**
 * B404. The reading payload sits beside an assembled card.
 * The flag off leaves that card alone.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { assembleCard } from "../lib/qc/pipeline-v3/stage7-assemble-card.mjs";
import { draftHeader, lightSourcedLine } from "../lib/qc/reading-contract.mjs";
import { attachReadingView } from "../lib/qc/reading-review.mjs";

const STATEMENT = "HICL delivered EBITDA in line with expectations.";
const SOURCE = "HICL delivered EBITDA in line with expectations during the period.";

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
      editorialVerdict: "not_reviewed",
      editorialConcerns: [],
      complianceVerdict: "not_reviewed",
      complianceConcerns: [],
    },
  };
}

function noneNote() {
  return JSON.stringify({ bucket: "none", note: "", disputedIndices: [] });
}

describe("B404 reading payload", () => {
  test("an assembled review gains the reading payload and keeps its card fields", async () => {
    const card = await assembleCard(entry(), 0, {
      pipelineRoute: "v4",
      reviewOptions: { evidenceEnabled: true, editorialEnabled: false, complianceEnabled: false },
      skipEditorialDuplicationJudge: true,
      sources: [{ text: SOURCE, label: "memo" }],
    });
    const before = structuredClone(card);
    const previous = process.env.QC_READING_VIEW;
    delete process.env.QC_READING_VIEW;
    let calls = 0;
    const attached = await attachReadingView({
      cards: [card],
      sources: [{ text: SOURCE, label: "memo" }],
      complete: async () => {
        calls += 1;
        return calls === 1 ? noneNote() : JSON.stringify({ note: "The draft stays close to the source." });
      },
    });
    if (previous == null) delete process.env.QC_READING_VIEW;
    else process.env.QC_READING_VIEW = previous;
    const after = attached.cards[0];
    for (const key of Object.keys(before)) {
      assert.deepEqual(after[key], before[key]);
    }
    assert.equal(after.displayVerdict, before.displayVerdict);
    assert.equal(after.factualBadge, before.factualBadge);
    assert.equal(attached.reading.header.numbers.includes("facts matched"), true);
    assert.equal(typeof attached.reading.header.footnote, "string");
    assert.ok(Array.isArray(after.readingFacts));
    assert.equal(after.readingNote.bucket, "none");
    assert.equal(after.sentenceState, "nothing_to_raise");
    assert.equal(after.tier, "quiet");
    assert.equal(attached.reading.writerFeedback, "The draft stays close to the source.");
    assert.equal(attached.reading.sentences[0].facts.length, after.readingFacts.length);
  });

  test("nothing demanding and one light note takes the little-further line", () => {
    const header = draftHeader([
      { facts: [{ status: "matched" }], sentenceState: "beyond", note: { bucket: "beyond" } },
      { facts: [{ status: "matched" }], sentenceState: "nothing_to_raise", note: { bucket: "wording" } },
    ]);
    assert.equal(header.counts.tiers.demands, 0);
    assert.equal(header.line, lightSourcedLine(1));
    assert.match(header.line, /goes a little further/);
  });

  test("the flag off leaves the payload absent and the card untouched", async () => {
    const card = {
      statement: STATEMENT,
      displayVerdict: "supported_full",
      factualBadge: true,
    };
    const before = structuredClone(card);
    const previous = process.env.QC_READING_VIEW;
    process.env.QC_READING_VIEW = "0";
    let calls = 0;
    const attached = await attachReadingView({
      cards: [card],
      sources: [{ text: SOURCE }],
      complete: async () => {
        calls += 1;
        return noneNote();
      },
    });
    if (previous == null) delete process.env.QC_READING_VIEW;
    else process.env.QC_READING_VIEW = previous;
    assert.equal(calls, 0);
    assert.equal(attached.reading, null);
    assert.deepEqual(attached.cards[0], before);
    assert.equal(attached.cards[0].readingFacts, undefined);
  });
});
