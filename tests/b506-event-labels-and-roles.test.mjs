/**
 * B506. Text-type labels, and a source role that is accepted and otherwise ignored.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import {
  DEFAULT_EVENT_TYPE,
  EVENT_TYPE,
  EVENT_TYPE_OPTIONS,
  getEventTypeLabel,
  normalizeEventType,
} from "../lib/event-type.js";
import { annotateSourceRoles, sourceRole, sourcesForPrompt } from "../lib/source-role.mjs";
import { buildResponseSources, splitSourcesForResponse } from "../lib/response-sources.mjs";

const LABELS = [
  "General",
  "New direct investment",
  "Direct investment add-on",
  "Direct investment exit",
  "Direct investment revaluation",
  "New secondary investment",
  "New fund commitment",
  "Fund capital call",
  "Fund distribution",
  "Fund revaluation",
  "Other update",
];

test("text types keep their keys, in the screen order, and Other update is the default", () => {
  assert.deepEqual(EVENT_TYPE_OPTIONS.map((row) => row.label), LABELS);
  assert.deepEqual(EVENT_TYPE_OPTIONS.map((row) => row.id), [
    EVENT_TYPE.GENERAL,
    EVENT_TYPE.NEW_DIRECT_INVESTMENT,
    EVENT_TYPE.ADD_ON_DIRECT_INVESTMENT,
    EVENT_TYPE.DIRECT_INVESTMENT_EXIT,
    EVENT_TYPE.DIRECT_INVESTMENT_REVALUATION,
    EVENT_TYPE.NEW_SECONDARY_INVESTMENT,
    EVENT_TYPE.NEW_PRIMARY_COMMITMENT,
    EVENT_TYPE.FUND_CAPITAL_CALL,
    EVENT_TYPE.FUND_DISTRIBUTION,
    EVENT_TYPE.FUND_REVALUATION,
    EVENT_TYPE.SPECIAL_TOPIC,
  ]);
  assert.equal(EVENT_TYPE.NEW_PRIMARY_COMMITMENT, "NEW_PRIMARY_COMMITMENT");
  assert.equal(getEventTypeLabel(EVENT_TYPE.ADD_ON_DIRECT_INVESTMENT), "Direct investment add-on");
  assert.equal(getEventTypeLabel(EVENT_TYPE.NEW_PRIMARY_COMMITMENT), "New fund commitment");
  assert.equal(getEventTypeLabel(EVENT_TYPE.SPECIAL_TOPIC), "Other update");
  assert.equal(DEFAULT_EVENT_TYPE, EVENT_TYPE.SPECIAL_TOPIC);
  assert.equal(normalizeEventType(""), EVENT_TYPE.SPECIAL_TOPIC);
  assert.equal(normalizeEventType(undefined), EVENT_TYPE.SPECIAL_TOPIC);
});

test("a source role is passed through, and a missing role is facts", () => {
  assert.equal(sourceRole(undefined), "facts");
  assert.equal(sourceRole(""), "facts");
  assert.equal(sourceRole("context"), "context");
  const annotated = annotateSourceRoles([
    { text: "The fund called capital.", name: "Call" },
    { text: "Background only.", name: "Note", role: "context" },
  ]);
  assert.equal(annotated[0].role, "facts");
  assert.equal(annotated[1].role, "context");
  assert.equal(annotated[0].text, "The fund called capital.");
  const promptSources = sourcesForPrompt(annotated);
  assert.equal(Object.prototype.hasOwnProperty.call(promptSources[0], "role"), false);
  assert.equal(promptSources[1].text, "Background only.");

  const { kept } = splitSourcesForResponse(
    [
      { text: "The fund called capital.", publicationState: "unknown" },
      { text: "Background only.", publicationState: "unknown", role: "context" },
    ],
    [
      { name: "Call" },
      { name: "Note", role: "context" },
    ]
  );
  const response = buildResponseSources(kept);
  assert.equal(response[0].role, "facts");
  assert.equal(response[1].role, "context");
  assert.equal(response[0].text, "The fund called capital.");
  assert.throws(() => sourceRole("both"), /source role is missing/);
});
