import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { elementFound, extractElements } from "../lib/qc/b394-elements.mjs";
import { evidenceLine, isEquivalenceSentence } from "../lib/qc/evidence-line.mjs";
import { evidenceQuietOf, evidenceQuietWithLabel, layerSpoken, quietOf, quietWithLabel } from "../scripts/diagnostic/lib/leave-alone.mjs";

function found(statement, source, surface) {
  const elements = extractElements(statement, statement, source);
  const element = elements.find((row) => row.surface === surface);
  assert.ok(element, `no element ${surface}`);
  return elementFound(element, source);
}

describe("B458 hedged figures", () => {
  test("nearly 10,000 is a number just under, not a number over", () => {
    const statement = "Customers increased to nearly 10,000.";
    assert.equal(found(statement, "Customers increased to 9,700.", "10,000"), true);
    assert.equal(found(statement, "Customers increased to 9,400.", "10,000"), false);
    assert.equal(found(statement, "Customers increased to 10,400.", "10,000"), false);
  });

  test("approximately allows a coarse band, and a decimal stays tight", () => {
    const round = "Headcount is approximately 3,200.";
    assert.equal(found(round, "Headcount is 3,100.", "3,200"), true);
    assert.equal(found(round, "Headcount is 4,000.", "3,200"), false);
    const tight = "The stake is approximately 1.62 billion.";
    assert.equal(found(tight, "The stake is 1.63 billion.", "1.62 billion"), true);
    assert.equal(found(tight, "The stake is 1.80 billion.", "1.62 billion"), false);
  });

  test("roughly six is a count either side by one, and modestly above is a small step up", () => {
    const statement = "Users return roughly six times.";
    assert.equal(found(statement, "Users return 5 times.", "six"), true);
    assert.equal(found(statement, "Users return 7 times.", "six"), true);
    assert.equal(found(statement, "Users return 4 times.", "six"), false);
    const above = "Revenue was modestly above EUR 196 million.";
    assert.equal(found(above, "Revenue was EUR 218 million.", "EUR 196 million"), true);
    assert.equal(found(above, "Revenue was EUR 400 million.", "EUR 196 million"), false);
    assert.equal(found(above, "Revenue was EUR 190 million.", "EUR 196 million"), false);
  });

  test("an unsatisfied hedge still fails", () => {
    const statement = "International revenue was more than 40 percent.";
    assert.equal(found(statement, "International revenue was 32 percent.", "40 percent"), false);
    const approx = "About 40% of forwarders are on legacy systems.";
    assert.equal(found(approx, "Penetration is 38% and another line is 8.6%.", "40%"), false);
  });
});

describe("B458 equivalence sentences", () => {
  test("the separator sentence goes and the source sentence stays", () => {
    const note = "The source states customers increased from 5,500 a year ago to nearly 10,000 today. The statement conveys the same figures using a different thousands separator.";
    const line = evidenceLine({
      fileName: "memo",
      quote: "customers have increased from 5,500 a year ago to nearly 10,000 today",
      noteText: note,
      noteBucket: "wording",
    });
    assert.equal(line, "The source states customers increased from 5,500 a year ago to nearly 10,000 today.");
    assert.equal(isEquivalenceSentence(line), false);
  });

  test("a wording note that only explains the match falls back to the passage", () => {
    const line = evidenceLine({
      fileName: "memo",
      quote: "eight operational data centers",
      noteText: "The figures match the source.",
      noteBucket: "wording",
    });
    assert.equal(line, 'memo states "eight operational data centers".');
  });

  test("a conflict note that names two figures stays", () => {
    const note = "The source states SEK 12.8 billion. The statement says SEK 18.4 billion.";
    assert.equal(evidenceLine({ fileName: "memo", quote: "12.8", noteText: note, noteBucket: "conflicts" }), note);
  });
});

describe("B458 leave-alone sees the label", () => {
  test("the old tally ignores a false not-in-source headline and the new one does not", () => {
    const card = {
      statement: "Growth was more than 150%.",
      displayVerdict: "supported_full",
      sentenceState: "not_in_source",
      tier: "demands",
      editorialConcerns: [],
      complianceConcerns: [],
      readingNote: { bucket: "wording", text: "The source states 151%." },
    };
    assert.equal(quietOf(card), true);
    assert.equal(evidenceQuietOf(card), true);
    assert.equal(quietWithLabel(card), false);
    assert.equal(evidenceQuietWithLabel(card), false);
    assert.equal(Object.keys(layerSpoken(card)).includes("sentence"), false);
  });
});
