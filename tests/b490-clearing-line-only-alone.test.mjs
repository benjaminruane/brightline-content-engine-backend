/**
 * B490. The clearing line stays only when the deal's state is the only difference.
 * Measured on the stored B486 pass.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { applyClearingLine, CLEARING_LINE } from "../lib/qc/clearing-line.mjs";
import { readerEvidenceSentence } from "../lib/qc/reader-reason.mjs";

const pass = JSON.parse(readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../scripts/diagnostic/b486/pass-1.json"),
  "utf8",
));

function card(id, index) {
  const row = pass.cards.find((entry) => String(entry.fixtureId).padStart(2, "0") === id && entry.index === index);
  if (!row) throw new Error(`missing ${id}:${index}`);
  return row;
}

test("F15 #2 does not carry the clearing line, and F04 #0 and F17 #0 do", () => {
  const fifteen = card("15", 2);
  assert.equal(applyClearingLine(fifteen.readingNote.text).includes(CLEARING_LINE), false);
  assert.equal((readerEvidenceSentence(fifteen) || "").includes(CLEARING_LINE), false);
  for (const [id, index] of [["04", 0], ["17", 0]]) {
    const row = card(id, index);
    assert.equal(applyClearingLine(row.readingNote.text).includes(CLEARING_LINE), true, `${id}:${index}`);
    assert.equal((readerEvidenceSentence(row) || "").includes(CLEARING_LINE), true, `${id}:${index}`);
  }
});
