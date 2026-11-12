/**
 * B491. The completion field counts only when the statement says the deal is done.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { completionEffect, shownState } from "../lib/qc/shown-verdict.mjs";

const AGREED = "Partners Group has agreed to sell atNorth, a leading pan-Nordic data center platform.";
const EXPECTED = "The transaction is expected to close in the first quarter of 2026, subject to customary regulatory approvals.";
const VALUES = "The transaction values the Company at an enterprise value of EUR 445 million.";
const NEW_INVESTMENT = "We are writing to inform you of a new investment in Pinterest.";
const COMMITTED = "We have committed USD 10 million.";
const INVESTED = "We have invested EUR 480 million.";
const COMPLETION = "We are writing to confirm completion of the transaction.";
const HOLDS = "The fund holds a majority stake in a renewable-energy generation platform.";
const HOLD = "We look forward to providing further updates as the hold progresses.";

function card(statement, completion, state = "nothing_raised") {
  return {
    statement,
    sentenceState: state,
    statementVerdict: { state },
    readingNote: { bucket: "beyond", text: "The documents are still open.", completion },
  };
}

test("pending has no effect unless the statement says the deal is done", () => {
  for (const statement of [AGREED, EXPECTED, VALUES]) {
    const row = card(statement, "pending");
    assert.equal(completionEffect(row), "", statement);
    assert.equal(shownState(row), "nothing_raised", statement);
  }
  for (const statement of [NEW_INVESTMENT, COMMITTED, INVESTED, COMPLETION, HOLDS, HOLD]) {
    const row = card(statement, "pending");
    assert.equal(completionEffect(row), "conflicts", statement);
    assert.equal(shownState(row), "conflicts", statement);
  }
});

test("predates has no effect on a value sentence and is light when the deal is done", () => {
  const quiet = card(VALUES, "predates");
  assert.equal(completionEffect(quiet), "");
  assert.equal(shownState(quiet), "nothing_raised");
  const done = card(INVESTED, "predates");
  assert.equal(completionEffect(done), "beyond");
  assert.equal(shownState(done), "beyond");
});

test("a loud base state stays loud with or without the gate", () => {
  const blocked = card(AGREED, "pending", "conflicts");
  const allowed = card(INVESTED, "pending", "conflicts");
  const light = card(INVESTED, "predates", "conflicts");
  assert.equal(completionEffect(blocked), "");
  assert.equal(shownState(blocked), "conflicts");
  assert.equal(completionEffect(allowed), "conflicts");
  assert.equal(shownState(allowed), "conflicts");
  assert.equal(completionEffect(light), "beyond");
  assert.equal(shownState(light), "conflicts");
});
