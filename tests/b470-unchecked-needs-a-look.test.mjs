import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";
import { buildReviewData, evidenceFindingForExport } from "../lib/qc/export-review-data.mjs";
import { readerEvidenceSentence } from "../lib/qc/reader-reason.mjs";
import { shownLabel, shownState, shownTier } from "../lib/qc/shown-verdict.mjs";

const pass = JSON.parse(readFileSync(new URL("../scripts/diagnostic/b464/pass-1.json", import.meta.url), "utf8"));

function card(fixtureId, index) {
  const row = pass.cards.find((entry) => String(entry.fixtureId).padStart(2, "0") === fixtureId && entry.index === index);
  if (!row) throw new Error(`missing ${fixtureId}:${index}`);
  return row;
}

test("B470: a sentence nobody checked is not called nothing raised", () => {
  for (const id of [["11", 9], ["15", 12]]) {
    const row = card(id[0], id[1]);
    assert.equal(row.sentenceLabel, "Nothing raised");
    assert.equal(shownLabel(row), "Needs a look");
    assert.equal(shownTier(shownState(row)), "light");
    assert.equal(readerEvidenceSentence(row), "This check did not run, because the match came back empty.");
    assert.equal(evidenceFindingForExport(row, false), readerEvidenceSentence(row));
    const exported = buildReviewData({ statements: [{ qcCard: row }] }).statements[0];
    assert.equal(exported.verdict, "Needs a look");
    assert.equal(exported.evidenceFinding, readerEvidenceSentence(row));
  }
  const quiet = pass.cards.filter((row) => shownLabel(row) === "Nothing raised" && row.evidenceNotReviewedReason);
  assert.equal(quiet.length, 0);
  assert.equal(shownLabel(card("19", 4)), "Nothing raised");
  assert.equal(readerEvidenceSentence(card("02", 4)), "The figures in this sentence match the source. The check that reads the whole claim did not finish, so read this sentence against the source yourself.");
});

test("B470: the screen names the same check", () => {
  const screen = readFileSync(
    new URL("../../brightline-content-engine-frontend/src/modules/drafting/displayVerdictLabels.js", import.meta.url),
    "utf8",
  );
  assert.match(screen, /uncheckedLook\(qcCard\)/);
});
