import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";
import { readerEvidenceSentence } from "../lib/qc/reader-reason.mjs";
import { shownLabel, shownState, shownTier } from "../lib/qc/shown-verdict.mjs";
import { transactionDemand, transactionShift } from "../lib/qc/transaction-state.mjs";
import { transactionDemand as screenDemand } from "../../brightline-content-engine-frontend/src/modules/drafting/transactionState.js";

const pass = JSON.parse(readFileSync(new URL("../scripts/diagnostic/b464/pass-1.json", import.meta.url), "utf8"));

function card(fixtureId, index) {
  const row = pass.cards.find((entry) => String(entry.fixtureId).padStart(2, "0") === fixtureId && entry.index === index);
  if (!row) throw new Error(`missing ${fixtureId}:${index}`);
  return row;
}

test("B473: committed against an open approval is a disagreement", () => {
  const row = card("04", 1);
  const shift = transactionShift(row);
  assert.equal(row.sentenceLabel, "Nothing raised");
  assert.equal(shift.source, "proposed");
  assert.equal(shift.draft, "committed");
  assert.equal(shownLabel(row), "Conflicts with the source");
  assert.equal(shownTier(shownState(row)), "demands");
  assert.equal(readerEvidenceSentence(row), "The source and the statement disagree, because the source is still seeking approval while the statement says the firm has committed.");
  assert.equal(screenDemand(row).sentence, transactionDemand(row).sentence);
});

test("B473: the same state stays quiet, and a missing source state is not this check", () => {
  assert.equal(transactionShift(card("06", 10)), null);
  assert.equal(shownLabel(card("06", 10)), "Nothing raised");
  assert.equal(transactionShift(card("02", 1)), null);
  assert.equal(shownLabel(card("02", 1)), "Nothing raised");
  assert.equal(transactionDemand(card("08", 14)), null);
  assert.equal(shownLabel(card("08", 14)), "Goes beyond the source");
  assert.equal(shownTier(shownState(card("08", 14))), "light");
  assert.equal(shownLabel(card("19", 4)), "Nothing raised");
  assert.equal(transactionDemand(card("08", 2)), null);
  assert.match(readerEvidenceSentence(card("08", 2)), /^The source describes the investment as a proposal/);
  assert.match(readerEvidenceSentence(card("15", 2)), /^The source says Halden Group/);
  assert.match(readerEvidenceSentence(card("18", 0)), /recommend an investment of EUR 158 million/);
  assert.match(readerEvidenceSentence(card("18", 2)), /recommend an investment of EUR 158 million/);
});

test("B473: the screen names the backend file", () => {
  const screen = readFileSync(
    new URL("../../brightline-content-engine-frontend/src/modules/drafting/transactionState.js", import.meta.url),
    "utf8",
  );
  assert.match(screen, /lib\/qc\/transaction-state\.mjs/);
});
