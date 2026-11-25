/**
 * B488. A light Partly card does not say the part was not recorded when the card knows it.
 * A wording note on that line goes quiet. A clause that names the part is kept.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";
import { isPartialUnrecorded } from "../lib/qc/partial-sentence.mjs";
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

test("a wording note on the unrecorded line stays a partial, not Nothing raised", () => {
  for (const [fixtureId, index] of [["08", 3], ["08", 6], ["14", 3]]) {
    const row = card(fixtureId, index);
    assert.notEqual(shownState(row), "nothing_raised", `${fixtureId}:${index}`);
    assert.equal(shownLabel(row) === "Goes beyond the source" || shownLabel(row) === "Needs a look", true, `${fixtureId}:${index}`);
  }
});

test("15:9 keeps the clause that names the missing part", () => {
  const row = card("15", 9);
  const reason = readerEvidenceSentence(row) || "";
  assert.equal(shownLabel(row), "Goes beyond the source");
  assert.equal(shownTier(shownState(row)), "light");
  assert.equal(isPartialUnrecorded(reason), false);
  assert.match(reason, /continued runway to 70%/);
  assert.match(reason, /material gross margin expansion/);
});
