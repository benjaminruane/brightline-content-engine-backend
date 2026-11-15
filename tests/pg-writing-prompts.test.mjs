import { describe, test } from "vitest";
import assert from "node:assert/strict";
import { buildBasePrompt } from "../lib/prompt-library/index.js";

describe("composed writing prompt", () => {
  test("buildBasePrompt uses guidance and the cover list for a new direct investment", () => {
    const { basePromptText } = buildBasePrompt({
      outputType: "reporting_commentary",
      visibility: "complete",
      eventType: "NEW_DIRECT_INVESTMENT",
      transactionDate: "Jun 2025",
      investment: "TestCo",
      specialInstructions: "",
      sources: [],
    });
    const outputIdx = basePromptText.indexOf("Output type:");
    const guidanceIdx = basePromptText.indexOf("Write the new direct investment.");
    assert.ok(outputIdx >= 0);
    assert.ok(guidanceIdx > outputIdx);
    assert.match(basePromptText, /Cover, in this order:/);
    assert.match(basePromptText, /Length: 100 to 150 words. Stay within this range/);
    assert.doesNotMatch(basePromptText, /Binding constraints/);
    assert.match(basePromptText, /---METHODOLOGY---/);
  });

  test("buildBasePrompt uses guidance for a new primary commitment", () => {
    const { basePromptText } = buildBasePrompt({
      outputType: "reporting_commentary",
      visibility: "public",
      eventType: "NEW_FUND_COMMITMENT",
      transactionDate: "Jun 2025",
      investment: "Aurora Next Generation Infrastructure",
      specialInstructions: "",
      sources: [],
    });
    assert.match(basePromptText, /Write the new primary commitment/);
    assert.match(basePromptText, /Leave out, unless the special instructions ask for it:/);
    assert.match(basePromptText, /the commitment amount/);
    assert.doesNotMatch(basePromptText, /exactly ONE paragraph/);
  });

  test("buildBasePrompt falls back to generic scaffold for other event types", () => {
    const { basePromptText } = buildBasePrompt({
      outputType: "reporting_commentary",
      visibility: "complete",
      eventType: "SPECIAL_TOPIC",
      transactionDate: "Jan 2024",
      investment: "Acme",
      sources: [],
    });
    assert.doesNotMatch(basePromptText, /Classification into lead, joint, or co-investment/);
  });

  test("a confirmed deal status is a this-run fact and the default adds nothing", () => {
    const confirmed = buildBasePrompt({
      outputType: "investor_letter",
      eventType: "NEW_DIRECT_INVESTMENT",
      dealStatus: "Signed or agreed",
    });
    assert.match(confirmed.basePromptText, /The writer confirms the deal status is: Signed or agreed/);
    assert.match(confirmed.basePromptText, /This confirmation counts as a facts source for status only/);
    const untouched = buildBasePrompt({
      outputType: "investor_letter",
      eventType: "NEW_DIRECT_INVESTMENT",
      dealStatus: "As the source states",
    });
    assert.doesNotMatch(untouched.basePromptText, /The writer confirms the deal status/);
  });
});
