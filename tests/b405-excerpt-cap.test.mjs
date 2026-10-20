/**
 * B405. A displayed quote stays within 400 characters.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";

import { MAX_EXCERPT_CHARS, trimExcerptToSentences } from "../lib/qc/excerpt-sentences.mjs";
import { offsetsForShownPassage } from "../lib/qc/pipeline-v4/stage4-select-excerpts.mjs";

function padded(token, target) {
  let text = token;
  while (text.length < target) text += " filler";
  return `${text}.`;
}

describe("B405 excerpt cap", () => {
  test("a must-keep cover longer than 400 keeps the sentences nearest the needles", () => {
    const s0 = padded("northline grew 12%", 180);
    const s1 = padded("bridgework continued steadily", 220);
    const s2 = padded("midpoint grew 12% at WIDGET", 150);
    const s3 = padded("ordinary trading continued", 220);
    const s4 = padded("farline sat at WIDGET", 220);
    const passage = [s0, s1, s2, s3, s4].join(" ");
    const cover = passage;
    assert.ok(cover.length > MAX_EXCERPT_CHARS);

    const out = trimExcerptToSentences(passage, "12% WIDGET");
    assert.ok(out.length <= MAX_EXCERPT_CHARS);
    assert.ok(out.includes(" ... "));
    assert.ok(out.includes("northline"));
    assert.ok(out.includes("midpoint"));
    assert.equal(out.includes("farline"), false);
    assert.equal(out.includes("bridgework"), false);
  });

  test("a single sentence of 600 characters is cut at a word boundary", () => {
    const sentence = `${"alpha ".repeat(99)}omega.`;
    assert.ok(sentence.length >= 600);
    const out = trimExcerptToSentences(sentence, "");
    assert.ok(out.length <= MAX_EXCERPT_CHARS);
    assert.ok(out.endsWith("…"));
    assert.match(out, /[A-Za-z0-9]…$/);
    assert.equal(out.includes("omega"), false);
  });

  test("an excerpt already under the cap is unchanged", () => {
    const passage = "Alpha opened the fund in March. Beta closed the fund in June.";
    assert.equal(trimExcerptToSentences(passage, ""), passage);
  });

  test("offsets bracket the stored slice, including a gap and a cut", () => {
    const source = "Alpha opened the fund in March. Beta closed the fund in June.";
    const exact = offsetsForShownPassage(source, source);
    assert.equal(source.slice(exact.start, exact.end), source);

    const gapped = "Alpha opened the fund in March. ... Beta closed the fund in June.";
    const first = offsetsForShownPassage(gapped, source);
    assert.equal(source.slice(first.start, first.end), "Alpha opened the fund in March.");

    const sentence = `${"alpha ".repeat(99)}omega.`;
    const cut = trimExcerptToSentences(sentence, "");
    const cutBounds = offsetsForShownPassage(cut, sentence);
    const stored = cut.replace(/…$/, "");
    assert.equal(cut.includes("…"), true);
    assert.equal(sentence.slice(cutBounds.start, cutBounds.end), stored);
    assert.equal(stored.includes("…"), false);
  });
});
