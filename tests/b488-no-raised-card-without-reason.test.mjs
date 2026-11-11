/**
 * B488. A raised card on the stored B486 pass has a reason.
 * 18:4 names both memos and both figures. The reading note is not the reason.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { readerEvidenceSentence } from "../lib/qc/reader-reason.mjs";

const pass = JSON.parse(readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../scripts/diagnostic/b486/pass-1.json"),
  "utf8",
));

function card(fixtureId, index) {
  const row = pass.cards.find((entry) => String(entry.fixtureId).padStart(2, "0") === fixtureId && entry.index === index);
  if (!row) throw new Error(`missing ${fixtureId}:${index}`);
  return row;
}

test("a compact raised card still has a reason", () => {
  for (const [fixtureId, index] of [["01", 0], ["18", 4], ["19", 7], ["25", 4]]) {
    const reason = readerEvidenceSentence(card(fixtureId, index)) || "";
    assert.notEqual(reason, "", `${fixtureId}:${index}`);
  }
});

test("18:4 names both memos and both figures, and does not use the reading note", () => {
  const row = card("18", 4);
  const reason = readerEvidenceSentence(row) || "";
  assert.match(reason, /28 May 2025/);
  assert.match(reason, /15 April 2025/);
  assert.match(reason, /EUR 35 million/);
  assert.match(reason, /EUR 38 million/);
  assert.match(reason, /18b_synth_cross_source_pair_update/);
  assert.match(reason, /18a_synth_cross_source_pair_initial/);
  assert.equal(reason.includes(row.readingNote.text), false);
});
