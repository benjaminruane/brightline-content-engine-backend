import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { renderDraftStyleSection } from "../lib/style-guide/render.mjs";
import {
  BEN_HOUSE_STYLE,
  NEW_ACCOUNT_HOUSE_STYLE,
  houseStyleForRow,
  styleGuideText,
} from "../lib/house-style-choice.mjs";
import { buildBasePrompt } from "../lib/prompt-library/index.js";
import { constructiveFeedbackSystemPrompt, CONSTRUCTIVE_FEEDBACK_V2_SYSTEM_PROMPT } from "../lib/qc/constructive-feedback-v2.mjs";
import { resolveStyleGuide } from "../lib/qc/style-guide.mjs";

describe("B543 house style per account", () => {
  test("omitted and Ben's pair keep the style block that already shipped", () => {
    const shipped = renderDraftStyleSection({ spelling: "US", thousands: "comma" }).trim();
    assert.equal(styleGuideText(null), shipped);
    assert.notEqual(styleGuideText(BEN_HOUSE_STYLE), shipped);
  });

  test("a comma account is told to write 5,500, and a UK account is told to use UK spelling", () => {
    const comma = styleGuideText({ spelling: "US", thousands: "comma" });
    assert.equal(comma.includes("5,500"), true);
    assert.equal(comma.includes("Do not use commas as thousands separators."), false);
    const uk = styleGuideText({ spelling: "UK", thousands: "apostrophe" });
    assert.equal(uk.includes("UK English"), true);
    assert.equal(uk.includes("Use US English spellings"), false);
  });

  test("a new account defaults to US and a comma, and an admin with no stored choice keeps the apostrophe", () => {
    assert.deepEqual(NEW_ACCOUNT_HOUSE_STYLE, { spelling: "US", thousands: "comma" });
    assert.deepEqual(houseStyleForRow({}, false), NEW_ACCOUNT_HOUSE_STYLE);
    assert.deepEqual(houseStyleForRow({}, true), NEW_ACCOUNT_HOUSE_STYLE);
    assert.deepEqual(houseStyleForRow({ spelling: "UK", thousands: "comma" }, true), { spelling: "UK", thousands: "comma" });
  });

  test("the house style check and the feedback prompt change only when the choice is not Ben's", () => {
    const omitted = resolveStyleGuide({ outputType: "REPORTING_COMMENTARY" });
    const comma = resolveStyleGuide({ outputType: "REPORTING_COMMENTARY", houseStyle: NEW_ACCOUNT_HOUSE_STYLE });
    assert.equal(omitted.find((rule) => rule.id === "thousand_separator").description, comma.find((rule) => rule.id === "thousand_separator").description);
    const ben = resolveStyleGuide({ outputType: "REPORTING_COMMENTARY", houseStyle: BEN_HOUSE_STYLE });
    assert.match(ben.find((rule) => rule.id === "thousand_separator").description, /apostrophe/);
    const commaRules = resolveStyleGuide({ outputType: "REPORTING_COMMENTARY", houseStyle: { spelling: "US", thousands: "comma" } });
    assert.equal(commaRules.find((rule) => rule.id === "thousand_separator").description.includes("5,500"), true);
    assert.equal(constructiveFeedbackSystemPrompt(null), CONSTRUCTIVE_FEEDBACK_V2_SYSTEM_PROMPT);
    assert.equal(constructiveFeedbackSystemPrompt(BEN_HOUSE_STYLE), CONSTRUCTIVE_FEEDBACK_V2_SYSTEM_PROMPT);
    const uk = constructiveFeedbackSystemPrompt({ spelling: "UK", thousands: "apostrophe" });
    assert.equal(uk.includes("UK English"), true);
  });

  test("an omitted brief uses the new-account comma, and an apostrophe brief differs", () => {
    const omitted = buildBasePrompt({
      eventType: "SPECIAL_TOPIC",
      outputType: "REPORTING_COMMENTARY",
      visibility: "complete",
    }).basePromptText;
    const comma = buildBasePrompt({
      eventType: "SPECIAL_TOPIC",
      outputType: "REPORTING_COMMENTARY",
      visibility: "complete",
      houseStyle: { spelling: "US", thousands: "comma" },
    }).basePromptText;
    const apostrophe = buildBasePrompt({
      eventType: "SPECIAL_TOPIC",
      outputType: "REPORTING_COMMENTARY",
      visibility: "complete",
      houseStyle: BEN_HOUSE_STYLE,
    }).basePromptText;
    assert.equal(omitted.includes("Use a comma as the thousands separator"), true);
    assert.equal(comma, omitted);
    assert.equal(apostrophe.includes("apostrophe"), true);
    assert.notEqual(apostrophe, omitted);
  });
});
