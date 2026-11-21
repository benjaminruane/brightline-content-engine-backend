import { describe, test } from "vitest";
import assert from "node:assert/strict";
import { buildBasePrompt } from "../lib/prompt-library/index.js";
import { OUTPUT_TYPE, VISIBILITY } from "../lib/output-intent.js";
import { EVENT_TYPE, LEGACY_EVENT_TYPE } from "../lib/event-type.js";
const REAL_FIRM = "Partners Group";
const CONFIGURED_HOUSE = "Northwind Capital";

const OUTPUT_TYPES = Object.values(OUTPUT_TYPE);
const VISIBILITIES = Object.values(VISIBILITY);
const EVENT_TYPES = [...Object.values(EVENT_TYPE), LEGACY_EVENT_TYPE.NEW_FUND_COMMITMENT];

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
    for (const row of everyCombination(undefined)) {
      assert.equal(
        row.text.includes(REAL_FIRM),
        false,
        `${row.outputType} ${row.visibility} ${row.eventType}`
      );
    }
    for (const row of everyCombination(CONFIGURED_HOUSE)) {
      assert.equal(
        row.text.includes(REAL_FIRM),
        false,
        `${row.outputType} ${row.visibility} ${row.eventType} with house`
      );
    }
  });

  test("a new direct investment uses the shared structure and names only the supplied organisation", () => {
    const { basePromptText } = buildBasePrompt({
      outputType: OUTPUT_TYPE.INVESTOR_LETTER,
      visibility: VISIBILITY.COMPLETE,
      eventType: EVENT_TYPE.NEW_DIRECT_INVESTMENT,
      transactionDate: "Mar 2024",
      investment: "Meridian Capital Partners V",
      authoringOrganisation: CONFIGURED_HOUSE,
    });
    assert.match(basePromptText, /Write the new direct investment/);
    assert.match(basePromptText, /State the deal's status as the facts source states it/);
    assert.doesNotMatch(basePromptText, /Binding constraints/);
    assert.equal(basePromptText.includes(REAL_FIRM), false);
    assert.equal(basePromptText.includes(`The authoring organisation is ${CONFIGURED_HOUSE}.`), true);
    assert.equal(basePromptText.includes(`The words the firm and we mean only ${CONFIGURED_HOUSE}.`), true);
  });

  test("with no organisation passed, no firm is named", () => {
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
