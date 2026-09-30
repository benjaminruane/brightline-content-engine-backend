/**
 * B354 / B355. The drop rule tests the objectionable term.
 * Causal: connective. Evaluative: deleted word. Other: B354 whole phrase.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";

import {
  applyEditorialSourceAwareness,
  FLAGGED_TEXT_ROUTE,
  selectFlaggedTextsFromConcern,
} from "../lib/qc/editorial-source-awareness.mjs";

function drop(statement, note, passage, { suggestedDirection, concernCode } = {}) {
  const concern = {
    concernCode: concernCode || "marketing_language_excess",
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
  test("DROPS when the causal connective is in the matched passage", () => {
    const statement = "The increase was driven primarily by a 14% rise in the share price.";
    const note = "The phrase 'driven primarily by' overstates causation.";
    const passage = "driven primarily by a 14% increase in 3i Infrastructure plc's share price";
    const selected = selectFlaggedTextsFromConcern({ note }, statement);
    assert.equal(selected.route, FLAGGED_TEXT_ROUTE.QUOTED);
    assert.deepEqual(selected.texts, ["driven primarily by"]);
    const after = drop(statement, note, passage, { concernCode: "overreach_unsupported_causal" });
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

  test("SURVIVES a one-word evaluative term that is not in the matched passage", () => {
    const statement = "This produced significant proceeds for the year.";
    const note = "Delete 'significant'.";
    const direction = "Delete 'significant'. The phrase becomes 'generated proceeds for 3i'.";
    const passage = "Action completed a capital restructuring with a pro-rata redemption of shares.";
    const selected = selectFlaggedTextsFromConcern({ note, suggestedDirection: direction }, statement);
    assert.equal(selected.route, FLAGGED_TEXT_ROUTE.QUOTED);
    assert.equal(selected.texts.includes("significant"), true);
    const after = drop(statement, note, passage, { suggestedDirection: direction });
    assert.equal(after.concerns.length, 1);
    assert.equal(after.dropped.length, 0);
  });

  test("DROPS a case-differing evaluative pair", () => {
    const statement = "The programme is set for another Record year.";
    const note = "The phrase 'Record year' is unsubstantiated.";
    const direction =
      "Delete 'Record year' and rewrite the sentence so that it reads naturally without it. Do not substitute a milder word for the deleted text.";
    const passage = "on track for another record year with an excellent reception";
    const after = drop(statement, note, passage, { suggestedDirection: direction });
    assert.equal(after.concerns.length, 0);
    assert.equal(after.dropped.length, 1);
  });
});
