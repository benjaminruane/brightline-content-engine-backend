/**
 * B558. A capital call and a distribution do not name the investor. Decision 2.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { buildBasePrompt } from "../lib/prompt-library/index.js";
import { guidance as callGuidance } from "../lib/prompt-library/text-types/FUND_CAPITAL_CALL.mjs";
import { guidance as distributionGuidance } from "../lib/prompt-library/text-types/FUND_DISTRIBUTION.mjs";
import { getEventTypeFraming } from "../lib/event-type.js";
import { renderPrinciples } from "../lib/style-guide/principles.mjs";

test("the call and the distribution name the fund and no payer or recipient", () => {
  const call = buildBasePrompt({
    eventType: "FUND_CAPITAL_CALL",
    outputType: "reporting_commentary",
    visibility: "complete",
  }).basePromptText;
  const distribution = buildBasePrompt({
    eventType: "FUND_DISTRIBUTION",
    outputType: "reporting_commentary",
    visibility: "public",
  }).basePromptText;
  assert.match(callGuidance, /The fund calls\. Do not name a payer\./);
  assert.match(distributionGuidance, /The fund distributes\. Do not name a recipient\./);
  assert.equal(callGuidance.includes("the firm pays"), false);
  assert.equal(distributionGuidance.includes("the firm receives"), false);
  assert.match(call, /The fund calls\. Do not name a payer\./);
  assert.match(distribution, /The fund distributes\. Do not name a recipient\./);
  assert.equal(call.includes("The fund calls and the firm pays."), false);
  assert.equal(distribution.includes("The fund distributes and the firm receives."), false);
  assert.match(getEventTypeFraming("FUND_CAPITAL_CALL"), /Do not name a payer/);
  assert.match(getEventTypeFraming("FUND_DISTRIBUTION"), /Do not name a recipient/);
  const principles = renderPrinciples({ eventType: "FUND_DISTRIBUTION" });
  assert.match(principles, /no named recipient or payer/);
  assert.match(principles, /Do not write that the firm paid a capital call or received a distribution/);
  assert.match(principles, /do not name the payer or the recipient/);
});
