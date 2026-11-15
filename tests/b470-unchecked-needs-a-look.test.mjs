import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";
import { buildReviewData } from "../lib/qc/export-review-data.mjs";
import { readerEvidenceSentence } from "../lib/qc/reader-reason.mjs";
import { shownLabel, shownState, shownTrace } from "../lib/qc/shown-verdict.mjs";

const pass = JSON.parse(readFileSync(new URL("../scripts/diagnostic/b464/pass-1.json", import.meta.url), "utf8"));

function card(fixtureId, index) {
  const row = pass.cards.find((entry) => String(entry.fixtureId).padStart(2, "0") === fixtureId && entry.index === index);
  if (!row) throw new Error(`missing ${fixtureId}:${index}`);
  return row;
}

test("B470: a supported sentence is not raised when the match did not finish", () => {
  for (const id of [["11", 9], ["15", 12]]) {
    const row = card(id[0], id[1]);
    assert.equal(row.sentenceLabel, "Nothing raised");
    assert.equal(shownState(row), "nothing_raised");
    assert.equal(shownLabel(row), "Nothing raised");
    assert.equal(shownTrace(row).setBy.branch, "readerSupportedCheckIncomplete");
    assert.equal(String(readerEvidenceSentence(row) || "").includes("came back empty"), false);
    const exported = buildReviewData({ statements: [{ qcCard: row }] }).statements[0];
    assert.equal(exported.verdict, "Nothing raised");
  }
  const quiet = pass.cards.filter((row) => shownLabel(row) === "Nothing raised" && row.evidenceNotReviewedReason);
  assert.ok(quiet.length > 0);
  for (const row of quiet) {
    const bucket = String(row.readingNote?.bucket || "");
    assert.equal(row.readingNote?.refused === true, false);
    assert.equal(bucket === "none" || bucket === "wording", true);
  }
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
