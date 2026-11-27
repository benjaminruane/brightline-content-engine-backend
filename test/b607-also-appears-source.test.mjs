/**
 * B607. Also-appears passages use joined-source line numbers (same as the screen).
 * Harbourline: "On 30 September 2026 the Fund completed..." is source 2, line 18.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import {
  joinSourceTexts,
  locatePassageLine,
  resolveAlsoAppearsAgainstSources,
  sourceNumberForLine,
} from "../lib/qc/resolve-also-appears.mjs";

const fixture = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fixtures/b602/harbourline.json"), "utf8"),
);

const texts = (fixture.sources || []).map((row) => row.text);
const PASSAGE = "On 30 September 2026 the Fund completed the sale of a 60% shareholding in Harbourline Foods Limited to Northshore Consumer Partners.";

test("Harbourline September completion is joined line 18 in source 2", () => {
  const joined = joinSourceTexts(texts);
  const located = locatePassageLine(joined, PASSAGE);
  assert.equal(located?.id, "L18");
  assert.equal(sourceNumberForLine(texts, located.id), 2);
});

test("resolveAlsoAppearsAgainstSources remaps per-source L9 to joined L18", () => {
  const card = {
    statement: "The sale is expected to complete in the third quarter.",
    conflictExcerpt: {
      passage: PASSAGE,
      // Stage 4 per-document line id (distribution notice alone).
      lineIds: ["L9"],
      sourceNumber: 1,
    },
  };
  const out = resolveAlsoAppearsAgainstSources(card, texts);
  assert.deepEqual(out.conflictExcerpt.lineIds, ["L18"]);
  assert.equal(out.conflictExcerpt.sourceNumber, 2);
  assert.deepEqual(out.alsoRelevantLineIds, ["L18"]);
});
