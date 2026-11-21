/**
 * B558. Other update has its own brief. Quote marks and legal suffixes are consistent.
 * Decisions 3 and 4.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { applyGuideAutoFix } from "../lib/style-guide/auto-fix.mjs";
import { buildBasePrompt } from "../lib/prompt-library/index.js";
import { guidance as otherUpdate } from "../lib/prompt-library/text-types/OTHER_UPDATE.mjs";
import { guidance as specialTopic } from "../lib/prompt-library/text-types/SPECIAL_TOPIC.mjs";
import { renderPrinciples } from "../lib/style-guide/principles.mjs";
import { DEFAULT_EVENT_TYPE, getEventTypeLabel } from "../lib/event-type.js";

const QUOTE = [
  "Simon Borrows, 3i's Chief Executive, commented: 'FY2025 was another successful year for 3i, continuing our track record.",
  "",
  "\u201COur FY2025 result was underpinned by our long-term hold assets.'",
].join("\n");

test("Other update is its own brief, and a draft does not describe itself", () => {
  assert.equal(DEFAULT_EVENT_TYPE, "OTHER_UPDATE");
  assert.equal(getEventTypeLabel("OTHER_UPDATE"), "Other update");
  assert.equal(getEventTypeLabel("SPECIAL_TOPIC"), "Special topic");
  assert.match(otherUpdate, /what happened in the period and why/);
  assert.match(otherUpdate, /Do not give the draft a title line/);
  assert.equal(specialTopic, "Lead with the purpose given in the special instructions. State only what the sources support.");
  const update = buildBasePrompt({
    eventType: "OTHER_UPDATE",
    outputType: "reporting_commentary",
    visibility: "complete",
  }).basePromptText;
  assert.match(update, /periodic update on a fund or an investment/);
  assert.equal(update.includes("Special instructions were not provided"), false);
  assert.equal(otherUpdate.includes("This special topic"), false);
  const topic = buildBasePrompt({
    eventType: "SPECIAL_TOPIC",
    outputType: "investor_letter",
    visibility: "complete",
    specialInstructions: "",
  }).basePromptText;
  assert.match(topic, /Special instructions were not provided/);
  const principles = renderPrinciples();
  assert.match(principles, /A draft never describes itself or names its own text type/);
  assert.match(principles, /HPIF quarterly commentary/);
  assert.match(principles, /This special topic focuses on the fund's software exposure/);
});

test("a multi-paragraph quotation uses one mark, and Plc is removed", () => {
  const fixed = applyGuideAutoFix(`${QUOTE}\n\n3i Group Plc reported the year.`, {
    outputType: "press_release",
    authoringOrganisation: "3i Group plc",
  }).text;
  assert.match(fixed, /commented: 'FY2025 was another successful year/);
  assert.match(fixed, /\n\n'Our FY2025 result was underpinned/);
  assert.equal(fixed.includes("\u201C"), false);
  assert.equal(fixed.includes("3i Group Plc"), false);
  assert.match(fixed, /3i Group reported the year/);
  const upper = applyGuideAutoFix("Acme LTD signed.", { outputType: "reporting_commentary" }).text;
  assert.equal(upper, "Acme signed.");
});
