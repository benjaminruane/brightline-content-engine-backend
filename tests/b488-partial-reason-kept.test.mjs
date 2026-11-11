/**
 * B488. A light Partly card does not say the part was not recorded when the card knows it.
 * A wording note on that line goes quiet. A clause that names the part is kept.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { PARTIAL_UNRECORDED } from "../lib/qc/partial-sentence.mjs";
import { readerEvidenceSentence } from "../lib/qc/reader-reason.mjs";
import { shownLabel, shownState, shownTier } from "../lib/qc/shown-verdict.mjs";

const pass = JSON.parse(readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "../scripts/diagnostic/b486/pass-1.json"),
  "utf8",
));

function card(fixtureId, index) {
  const row = pass.cards.find((entry) => String(entry.fixtureId).padStart(2, "0") === fixtureId && entry.index === index);
  if (!row) throw new Error(`missing ${fixtureId}:${index}`);
  return row;
}

test("a wording note on the unrecorded line is Nothing raised", () => {
  for (const [fixtureId, index] of [["08", 3], ["08", 6], ["14", 3]]) {
    const row = card(fixtureId, index);
    assert.equal(shownState(row), "nothing_raised", `${fixtureId}:${index}`);
    assert.equal(shownTier(shownState(row)), "quiet", `${fixtureId}:${index}`);
    assert.equal(shownLabel(row), "Nothing raised", `${fixtureId}:${index}`);
    assert.equal((readerEvidenceSentence(row) || "").includes(PARTIAL_UNRECORDED), false);
  }
});

test("15:9 keeps the clause that names the missing part", () => {
  const row = card("15", 9);
  const reason = readerEvidenceSentence(row) || "";
  assert.equal(shownLabel(row), "Partly in the source");
  assert.equal(shownTier(shownState(row)), "light");
  assert.equal(reason.includes(PARTIAL_UNRECORDED), false);
  assert.match(reason, /continued runway to 70%/);
  assert.match(reason, /material gross margin expansion/);
});
