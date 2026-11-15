import { describe, test } from "vitest";
import assert from "node:assert/strict";
import { buildBasePrompt } from "../lib/prompt-library/index.js";
import { OUTPUT_TYPE, VISIBILITY } from "../lib/output-intent.js";
import { EVENT_TYPE, LEGACY_EVENT_TYPE } from "../lib/event-type.js";
import { AUTHORING_ORGANISATION_ENV } from "../lib/qc/first-person-actor.mjs";

const REAL_FIRM = "Partners Group";
const CONFIGURED_HOUSE = "Northwind Capital";

const OUTPUT_TYPES = Object.values(OUTPUT_TYPE);
const VISIBILITIES = Object.values(VISIBILITY);
const EVENT_TYPES = [...Object.values(EVENT_TYPE), LEGACY_EVENT_TYPE.NEW_FUND_COMMITMENT];

function withEnvHouse(name, fn) {
  const prev = process.env[AUTHORING_ORGANISATION_ENV];
  if (name == null) delete process.env[AUTHORING_ORGANISATION_ENV];
  else process.env[AUTHORING_ORGANISATION_ENV] = name;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env[AUTHORING_ORGANISATION_ENV];
    else process.env[AUTHORING_ORGANISATION_ENV] = prev;
  }
}

function everyCombination(authoringOrganisation) {
  const prompts = [];
  for (const outputType of OUTPUT_TYPES) {
    for (const visibility of VISIBILITIES) {
      for (const eventType of EVENT_TYPES) {
        const { basePromptText } = buildBasePrompt({
          outputType,
          visibility,
          eventType,
          transactionDate: "Mar 2024",
          investment: "Meridian Capital Partners V",
          authoringOrganisation,
        });
        prompts.push({ outputType, visibility, eventType, text: basePromptText });
      }
    }
  }
  return prompts;
}

describe("B209a house identity in prompts", () => {
  test("no real firm name appears in any prompt built by buildBasePrompt", () => {
    withEnvHouse(null, () => {
      for (const row of everyCombination(undefined)) {
        assert.equal(
          row.text.includes(REAL_FIRM),
          false,
          `${row.outputType} ${row.visibility} ${row.eventType}`
        );
      }
    });
    withEnvHouse(CONFIGURED_HOUSE, () => {
      for (const row of everyCombination(undefined)) {
        assert.equal(
          row.text.includes(REAL_FIRM),
          false,
          `${row.outputType} ${row.visibility} ${row.eventType} with house`
        );
      }
    });
  });

  test("a new direct investment uses the shared structure and does not name a firm", () => {
    withEnvHouse(CONFIGURED_HOUSE, () => {
      const { basePromptText } = buildBasePrompt({
        outputType: OUTPUT_TYPE.INVESTOR_LETTER,
        visibility: VISIBILITY.COMPLETE,
        eventType: EVENT_TYPE.NEW_DIRECT_INVESTMENT,
        transactionDate: "Mar 2024",
        investment: "Meridian Capital Partners V",
      });
      assert.match(basePromptText, /Write the new direct investment/);
      assert.match(basePromptText, /State the deal's status as the facts source states it/);
      assert.doesNotMatch(basePromptText, /Binding constraints/);
      assert.equal(basePromptText.includes(REAL_FIRM), false);
      assert.equal(basePromptText.includes(CONFIGURED_HOUSE), false);
    });
  });

  test("with no organisation configured, no firm is named", () => {
    withEnvHouse(null, () => {
      const { basePromptText } = buildBasePrompt({
        outputType: OUTPUT_TYPE.INVESTOR_LETTER,
        visibility: VISIBILITY.COMPLETE,
        eventType: EVENT_TYPE.NEW_DIRECT_INVESTMENT,
        transactionDate: "Mar 2024",
        investment: "Meridian Capital Partners V",
        authoringOrganisation: null,
      });
      assert.equal(basePromptText.includes(REAL_FIRM), false);
      assert.equal(basePromptText.includes(CONFIGURED_HOUSE), false);
      assert.match(basePromptText, /---METHODOLOGY---/);
    });
  });
});
