/**
 * B480. A revision is the two readings the matcher already paired.
 * The sentence shape is the one B479 reads. lib/qc/reader-reason.mjs.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { readerEvidenceSentence, reasonNamesRevision } from "../lib/qc/reader-reason.mjs";
import { shownState } from "../lib/qc/shown-verdict.mjs";
import { resolveSupersession, revisionSentence } from "../lib/qc/supersession.mjs";

function dated(raw, iso) {
  return { date: new Date(iso), raw, cue: "Date: label" };
}

function reading(index, label, statementRaw, sourceRaw, statementValue, sourceValue) {
  return {
    sourceIndex: index,
    sourceLabel: label,
    classification: statementValue === sourceValue ? "confirmed" : "conflicting",
    statementFigures: [{ kind: "count", value: statementValue, raw: statementRaw }],
    sourceFigures: [{ kind: "count", value: sourceValue, raw: sourceRaw }],
  };
}

const statement = "The firm has 12 offices.";
const ordered = {
  0: dated("15 April 2025", "2025-04-15T00:00:00Z"),
  1: dated("28 May 2025", "2025-05-28T00:00:00Z"),
};

function args(asOf, matches) {
  return {
    statement,
    aggregateVerdict: "conflicting",
    sourceMatches: matches,
    asOfBySourceIndex: asOf,
    sources: [
      { text: "", label: "alpha memo" },
      { text: "", label: "beta memo" },
    ],
  };
}

function pair(laterValue, laterRaw, earlierValue, earlierRaw) {
  return [
    reading(0, "alpha memo", "12 offices", earlierRaw, 12, earlierValue),
    reading(1, "beta memo", "12 offices", laterRaw, 12, laterValue),
  ];
}

describe("B480 revision from readings", () => {
  test("a reading the old phrase list did not know is still a revision", () => {
    const out = resolveSupersession(args(ordered, pair(19, "19 offices", 12, "12 offices")));
    assert.equal(
      out.supersededNotes[0],
      "The later source beta memo dated 28 May 2025 gives 19 offices. The earlier source alpha memo dated 15 April 2025 gives 12 offices."
    );
    assert.equal(out.verdictOverride, null);
    assert.deepEqual(out.demotedSourceIndices, []);
  });

  test("later disagrees and no earlier reading agrees, so nothing is claimed", () => {
    assert.equal(revisionSentence(args(ordered, pair(19, "19 offices", 4, "4 offices"))), "");
    assert.deepEqual(resolveSupersession(args(ordered, pair(19, "19 offices", 4, "4 offices"))).supersededNotes, []);
  });

  test("one dated document gives nothing", () => {
    const asOf = { 0: ordered[0], 1: null };
    assert.equal(revisionSentence(args(asOf, pair(19, "19 offices", 12, "12 offices"))), "");
    assert.deepEqual(resolveSupersession(args(asOf, pair(19, "19 offices", 12, "12 offices"))).supersededNotes, []);
  });

  test("two documents that share the latest date give nothing", () => {
    const day = dated("28 May 2025", "2025-05-28T00:00:00Z");
    const asOf = { 0: day, 1: { ...day, date: new Date("2025-05-28T00:00:00Z") } };
    assert.equal(revisionSentence(args(asOf, pair(19, "19 offices", 12, "12 offices"))), "");
    assert.deepEqual(resolveSupersession(args(asOf, pair(19, "19 offices", 12, "12 offices"))).supersededNotes, []);
  });

  test("an undated pair names both readings and claims no order", () => {
    const out = resolveSupersession(args({ 0: null, 1: null }, pair(19, "19 offices", 12, "12 offices")));
    assert.equal(out.supersededNotes[0], "The documents differ. alpha memo gives 12 offices. beta memo gives 19 offices.");
  });

  test("B479 still reads both figures in the sentence this ticket writes", () => {
    const sentence = revisionSentence(args(ordered, pair(19, "19 offices", 12, "12 offices")));
    const kept = "The April memo gave 12 offices. The May pack puts the figure at 19 offices.";
    assert.equal(reasonNamesRevision(sentence), true);
    assert.equal(reasonNamesRevision(kept, sentence), true);
    assert.equal(reasonNamesRevision("The April memo gave 12 offices.", sentence), false);
    const card = {
      statement,
      sentenceState: "conflicts",
      statementVerdict: { state: "conflicts" },
      displayVerdict: "conflict",
      displayedEvidenceProse: kept,
      supersededSourceNotes: [sentence],
    };
    assert.equal(readerEvidenceSentence(card), kept);
    assert.equal(shownState(card), "conflicts");
  });
});
