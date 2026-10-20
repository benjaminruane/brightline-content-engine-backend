/**
 * B407. The stored quote is a source slice. Line ids cover that slice.
 * An ellipsis is a display mark and is not a character in the passage.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";

import { lineIdsCovering, storedExcerpt, trimExcerptToSentences } from "../lib/qc/excerpt-sentences.mjs";
import { selectExcerpts } from "../lib/qc/pipeline-v4/stage4-select-excerpts.mjs";

const SOURCE = [
  "Log In",
  "The Board confirmed the interim dividend of 4.2 pence per share.",
  "Earnings were in line with expectations for the half year.",
].join("\n");

describe("B407 excerpt line ids", () => {
  test("a stored passage is a slice and its line ids cover that slice", () => {
    const start = SOURCE.indexOf("The Board");
    const end = SOURCE.indexOf("share.") + "share.".length;
    const shown = SOURCE.slice(start, end);
    const stored = storedExcerpt(shown, SOURCE, start);
    assert.equal(SOURCE.slice(stored.start, stored.end), stored.parts[0]);
    assert.equal(stored.parts[0].includes("…"), false);
    assert.equal(stored.parts[0].includes(" ... "), false);
    assert.deepEqual(stored.lineIds, lineIdsCovering(SOURCE, stored.start, stored.end));
    assert.deepEqual(stored.lineIds, ["L2"]);
  });

  test("a gap stores each slice and the ellipsis is not in either", () => {
    const shown = "The Board confirmed the interim dividend of 4.2 pence per share. ... Earnings were in line with expectations for the half year.";
    const stored = storedExcerpt(shown, SOURCE, 0);
    assert.equal(stored.parts.length, 2);
    assert.equal(SOURCE.slice(stored.ranges[0].start, stored.ranges[0].end), stored.parts[0]);
    assert.equal(SOURCE.slice(stored.ranges[1].start, stored.ranges[1].end), stored.parts[1]);
    assert.equal(stored.parts.join("").includes("..."), false);
    assert.ok(stored.lineIds.includes("L2"));
    assert.ok(stored.lineIds.includes("L3"));
    assert.equal(SOURCE.slice(stored.start, stored.end), stored.parts[0]);
  });

  test("a cut ends on a word and the ellipsis is not stored", () => {
    const sentence = `${"alpha ".repeat(99)}omega.`;
    const shown = trimExcerptToSentences(sentence, "");
    assert.ok(shown.endsWith("…"));
    const stored = storedExcerpt(shown, sentence, 0);
    assert.equal(stored.excerptCut, true);
    assert.equal(stored.parts[0].includes("…"), false);
    assert.equal(sentence.slice(stored.start, stored.end), stored.parts[0]);
    assert.match(stored.parts[0], /[A-Za-z0-9]$/);
  });

  test("selectExcerpts records line ids and does not put an ellipsis in the passage", () => {
    const statement = "The interim dividend was 4.2 pence per share.";
    const sources = [{ label: "Release", text: SOURCE }];
    const start = SOURCE.indexOf("The Board");
    const end = SOURCE.indexOf("share.") + "share.".length;
    const result = selectExcerpts({
      statementText: statement,
      verdict: "confirmed",
      hasConflict: false,
      sources,
      statementMatches: [{
        sourceIndex: 0,
        sourceLabel: "Release",
        classification: "confirmed",
        passage: SOURCE.slice(start, end),
        start,
        end,
      }],
    });
    const excerpt = result?.primaryExcerpt;
    assert.ok(excerpt);
    assert.equal(excerpt.passage.includes("…"), false);
    assert.equal(excerpt.passage.includes(" ... "), false);
    assert.equal(SOURCE.slice(excerpt.start, excerpt.end), excerpt.passage);
    assert.ok(Array.isArray(excerpt.lineIds));
    assert.ok(excerpt.lineIds.includes("L2"));
  });
});
