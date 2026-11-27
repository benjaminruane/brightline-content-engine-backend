/**
 * B613. PDF / export source badges are letters.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { sourceLetter, sourceLetterFromNumber } from "../lib/export/source-letter.mjs";
import { exportBlocks } from "../lib/export/export-blocks.mjs";

const howToRead = { title: "How", labels: [], lineNote: "x", disclaimer: "d" };

describe("B613 source letters export", () => {
  test("sourceLetter maps 0-based index to A..Z then AA", () => {
    assert.equal(sourceLetter(0), "A");
    assert.equal(sourceLetter(1), "B");
    assert.equal(sourceLetter(25), "Z");
    assert.equal(sourceLetter(26), "AA");
    assert.equal(sourceLetter(27), "AB");
    assert.equal(sourceLetterFromNumber(1), "A");
    assert.equal(sourceLetterFromNumber(3), "C");
  });

  test("exportBlocks letterizes passage and source numbers", () => {
    const document = {
      title: {
        name: "Demo: review",
        verdict: "Needs work",
        verdictReason: "",
        sourceNames: ["One.txt", "Two.txt"],
        detail: "investor letter · v1",
      },
      summary: {
        readiness: "Needs work",
        readinessReason: "",
        facts: "ok",
        counts: [],
      },
      draft: [],
      fullDraft: "",
      sources: [
        { name: "One.txt", number: 1 },
        { name: "Two.txt", number: 2 },
      ],
      cards: [
        {
          heading: "S1 · Conflicts with the source",
          tone: "red",
          sentence: "NAV was EUR 1.",
          reason: "Conflicts with the source",
          passages: [{ text: "NAV was EUR 2.", lines: "line 1", sourceNumber: 1 }],
          also: { heading: "Also appears at", text: "EUR 2 again.", lines: "line 4", sourceNumber: 2 },
          concerns: [],
        },
      ],
      disclaimer: "d",
      howToRead,
    };
    const blocks = exportBlocks(document, { sources: true, cards: true });
    const sources = blocks.filter((b) => b.kind === "source");
    assert.equal(sources[0].number, "A");
    assert.equal(sources[1].number, "B");
    const passage = blocks.find((b) => b.kind === "passage");
    assert.equal(passage.number, "A");
    const also = blocks.find((b) => b.kind === "also");
    assert.equal(also.number, "B");
  });
});
