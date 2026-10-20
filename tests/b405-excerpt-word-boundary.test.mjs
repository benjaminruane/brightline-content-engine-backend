/**
 * B405. A quote does not start or end in the middle of a word.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";

import { finishExcerptEdges, trimExcerptToSentences } from "../lib/qc/excerpt-sentences.mjs";

describe("B405 word boundary", () => {
  test("a passage ending RMAT Desi is extended to RMAT Designation", () => {
    const source = "The firm received RMAT Designation last year.";
    const passage = "The firm received RMAT Desi";
    const start = source.indexOf(passage);
    const out = finishExcerptEdges(passage, source, start);
    assert.equal(out, "The firm received RMAT Designation");
    const viaTrim = trimExcerptToSentences(passage, "", { sourceText: source, startOffset: start });
    assert.equal(viaTrim, out);
  });

  test("a word that needs more than 30 characters is cut back", () => {
    const long = "x".repeat(40);
    const source = `alpha ${long} beta`;
    const passage = `alpha ${"x".repeat(5)}`;
    const out = finishExcerptEdges(passage, source, 0);
    assert.equal(out, "alpha…");
    assert.ok(out.endsWith("…"));
  });

  test("a passage ending in a full stop is unchanged", () => {
    const source = "The fund closed in June. More text follows here today.";
    const passage = "The fund closed in June.";
    assert.equal(finishExcerptEdges(passage, source, 0), passage);
  });

  test("a passage starting mid-word is trimmed forward", () => {
    const source = "Designation was granted.";
    const passage = "nation was granted.";
    const start = source.indexOf(passage);
    const out = finishExcerptEdges(passage, source, start);
    assert.equal(out, "…was granted.");
    assert.ok(out.startsWith("…"));
  });
});
