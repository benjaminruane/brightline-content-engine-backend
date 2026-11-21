/**
 * B556. A firm's decision is written as made. An opening carries the month and year.
 * Decisions 1, 3, and 7.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { buildBasePrompt } from "../lib/prompt-library/index.js";
import { renderPrinciples } from "../lib/style-guide/principles.mjs";
import { UNCONFIRMED_STATUS_LINE } from "../lib/deal-status.mjs";

function brief(extra = {}) {
  return buildBasePrompt({
    eventType: "NEW_PRIMARY_COMMITMENT",
    outputType: "reporting_commentary",
    visibility: "complete",
    transactionDate: "September 2026",
    ...extra,
  }).basePromptText;
}

describe("B556 decisions and openings", () => {
  test("the decision principle has one meaning and no contradicting example", () => {
    const text = renderPrinciples({ transactionDate: "October 2026" });
    assert.match(text, /state the firm's decision as made: agreed to invest, committed, or agreed to acquire/);
    assert.match(text, /Claim completion only when a source says it is done/);
    assert.match(text, /expected to complete in the first quarter of 2027/);
    assert.match(text, /board recommending a dividend, stays as stated/);
    assert.match(text, /In October 2026, Halden Group committed to Aldermoor Capital Fund VI/);
    assert.equal(text.includes("the draft says it was recommended, not that the firm committed"), false);
    assert.equal(text.includes("Do not write recommended, proposed, seek approval"), false);
    assert.match(UNCONFIRMED_STATUS_LINE, /state the firm's decision as made/);
    assert.equal(UNCONFIRMED_STATUS_LINE.includes("not that it was approved, agreed or completed"), false);
  });

  test("the opening names the transaction date, and an empty field is said out loud", () => {
    const dated = brief();
    assert.match(dated, /Open with the month and year from the transaction date field/);
    assert.match(dated, /The transaction date for this draft is September 2026/);
    assert.match(dated, /In September 2026, Kestrel Partners Fund IV called capital/);
    const empty = renderPrinciples({ transactionDate: "" });
    assert.match(empty, /The transaction date field is empty/);
    const unread = renderPrinciples({ transactionDate: "not a date" });
    assert.match(unread, /could not be read as a month and year/);
  });

  test("the closing principle names the two weak endings", () => {
    const text = renderPrinciples();
    assert.match(text, /supports a compelling risk-reward profile for this new portfolio company/);
    assert.match(text, /These factors make ABC a compelling investment/);
    assert.match(text, /carried with its specifics/);
  });
});
