/**
 * B488. The header leads with the loudest label the cards show.
 * Draft 19: one conflict, one statement not in the source, one glance.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { attentionHeader } from "../../brightline-content-engine-frontend/src/modules/reading/attentionHeader.js";

const conflict = {
  statement: "The company was founded in Ottawa.",
  sentenceState: "not_in_source",
  sentenceLabel: "Not in the source",
  displayVerdict: "conflict",
  matchExplanations: [{
    classification: "conflicting",
    writtenFor: "partially_confirmed",
    sourceLabel: "memo",
    explanation: "The source says the company was founded in Toronto.",
  }],
};

const absent = {
  statement: "The margin is 14 percent.",
  sentenceState: "not_in_source",
  sentenceLabel: "Not in the source",
  displayVerdict: "not_supported",
  matchExplanations: [{
    classification: "no_support",
    writtenFor: "no_support",
    sourceLabel: "memo",
    explanation: "The source does not give the margin.",
  }],
};

const beyond = {
  statement: "Growth will continue.",
  sentenceState: "beyond",
  sentenceLabel: "Goes beyond the source",
  displayVerdict: "supported_partial",
  matchExplanations: [{
    classification: "confirmed",
    writtenFor: "confirmed",
    sourceLabel: "memo",
    explanation: "The source gives the past figure.",
  }],
};

test("draft 19 leads with the conflict, then the absence, then the glance", () => {
  const line = attentionHeader([conflict, absent, beyond]);
  assert.equal(
    line,
    "1 statement conflicts with the source. 1 statement is not in the source. 1 worth a glance",
  );
  assert.equal(line.startsWith("1 worth"), false);
});
