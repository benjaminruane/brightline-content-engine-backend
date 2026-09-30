/**
 * B354 Part 1. The drop rule must test the objectionable term.
 * Whole-phrase containment, two-word floor, quoted phrase is the objection.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";

import {
  applyEditorialSourceAwareness,
  FLAGGED_TEXT_ROUTE,
  selectFlaggedTextsFromConcern,
} from "../lib/qc/editorial-source-awareness.mjs";

function drop(statement, note, passage, suggestedDirection) {
  const concern = {
    concernCode: "marketing_language_excess",
    note,
    suggestedDirection,
  };
  return applyEditorialSourceAwareness({
    statement,
    concerns: [concern],
    passages: [passage],
    editorialVerdict: "concern",
  });
}

describe("B354 editorial drop tests the objectionable term", () => {
  test("DROPS when the quoted objection is in the matched passage", () => {
    const statement = "The increase was driven primarily by a 14% rise in the share price.";
    const note = "The phrase 'driven primarily by' overstates causation.";
    const passage = "driven primarily by a 14% increase in 3i Infrastructure plc's share price";
    const selected = selectFlaggedTextsFromConcern({ note }, statement);
    assert.equal(selected.route, FLAGGED_TEXT_ROUTE.QUOTED);
    assert.deepEqual(selected.texts, ["driven primarily by"]);
    const after = drop(statement, note, passage);
    assert.equal(after.concerns.length, 0);
    assert.equal(after.dropped.length, 1);
    assert.equal(after.dropped[0].slug, "editorial_phrase_in_source");
    assert.equal(after.editorialVerdict, "clean");
  });

  test("SURVIVES when the quoted objection is longer than the source phrase", () => {
    const statement = "The fund delivered returns of 14% across the entire portfolio.";
    const note = "The phrase 'returns of 14% across the entire portfolio' is not established.";
    const passage = "the infrastructure asset portfolio delivered returns of 14% for the period";
    const selected = selectFlaggedTextsFromConcern({ note }, statement);
    assert.equal(selected.route, FLAGGED_TEXT_ROUTE.QUOTED);
    assert.deepEqual(selected.texts, ["returns of 14% across the entire portfolio"]);
    const after = drop(statement, note, passage);
    assert.equal(after.concerns.length, 1);
    assert.equal(after.dropped.length, 0);
    assert.equal(after.editorialVerdict, "concern");
  });

  test("SURVIVES a one-word quote below the floor even when the word is in another subject", () => {
    const statement = "This produced significant proceeds for the year.";
    const note = "Delete 'significant'.";
    const passage = "a significant valuation uplift in TCR";
    const selected = selectFlaggedTextsFromConcern({ note }, statement);
    assert.equal(selected.route, FLAGGED_TEXT_ROUTE.QUOTED);
    assert.deepEqual(selected.texts, ["significant"]);
    const after = drop(statement, note, passage);
    assert.equal(after.concerns.length, 1);
    assert.equal(after.dropped.length, 0);
  });

  test("DROPS a case-differing pair", () => {
    const statement = "The programme is set for another Record year.";
    const note = "The phrase 'Record year' is unsubstantiated.";
    const passage = "on track for another record year with an excellent reception";
    const after = drop(statement, note, passage);
    assert.equal(after.concerns.length, 0);
    assert.equal(after.dropped.length, 1);
  });
});
