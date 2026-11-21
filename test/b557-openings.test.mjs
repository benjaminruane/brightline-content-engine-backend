/**
 * B557. The opening date applies to dated events. Decisions 2, 3, 4, 5, 6, and 7.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { applyGuideAutoFix } from "../lib/style-guide/auto-fix.mjs";
import { renderPrinciples } from "../lib/style-guide/principles.mjs";
import { buildBasePrompt } from "../lib/prompt-library/index.js";
import { guidance as fundRevaluation } from "../lib/prompt-library/text-types/FUND_REVALUATION.mjs";

test("a dated event opens with In and the month and year", () => {
  const exit = renderPrinciples({
    eventType: "DIRECT_INVESTMENT_EXIT",
    outputType: "reporting_commentary",
    transactionDate: "June 2026",
  });
  assert.match(exit, /The transaction date for this draft is June 2026/);
  assert.match(exit, /Open with In June 2026/);
  const kept = applyGuideAutoFix("In June 2026, Kestrel Partners Fund IV agreed to sell.", {
    eventType: "DIRECT_INVESTMENT_EXIT",
  }).text;
  assert.equal(kept, "In June 2026, Kestrel Partners Fund IV agreed to sell.");
});

test("commentary and opinion do not invent a dated opening", () => {
  const special = renderPrinciples({
    eventType: "SPECIAL_TOPIC",
    outputType: "investor_letter",
    transactionDate: "July 2025",
  });
  assert.match(special, /Open with the subject/);
  assert.match(special, /Do not invent a month and year/);
  assert.equal(special.includes("Open with In July 2025"), false);
  const commentary = renderPrinciples({
    eventType: "GENERAL",
    outputType: "reporting_commentary",
    transactionDate: "July 2025",
  });
  assert.equal(commentary.includes("Open with In July 2025"), false);
  const results = renderPrinciples({
    eventType: "GENERAL",
    outputType: "press_release",
    transactionDate: "March 2025",
  });
  assert.match(results, /Open with In March 2025/);
});

test("the fund revaluation line uses the product owner's example", () => {
  assert.match(fundRevaluation, /The valuation of Kestrel Partners Fund IV declined over the third quarter of 2026, driven by/);
  const example = fundRevaluation.slice(0, fundRevaluation.indexOf("Do not mention"));
  assert.equal(/cash flow/i.test(example), false);
  assert.equal(/accrual/i.test(example), false);
  const prompt = buildBasePrompt({
    eventType: "FUND_REVALUATION",
    outputType: "reporting_commentary",
    visibility: "COMPLETE",
  }).basePromptText;
  assert.match(prompt, /declined over the third quarter of 2026/);
});

test("the principles name the firm only when it acts, keep one date, and drop empty sentences", () => {
  const text = renderPrinciples({ eventType: "FUND_DISTRIBUTION" });
  assert.match(text, /only where it is the actor/);
  assert.match(text, /no named recipient or payer/);
  assert.match(text, /In September 2026, Kestrel Partners Fund IV called capital to fund/);
  assert.match(text, /The opening date anchors the text/);
  assert.match(text, /never a second date for a step in the same story/);
  assert.match(text, /distributed proceeds from the sale of a 60% stake in Harbourline Foods/);
  assert.match(text, /Each sentence must carry a fact or an insight/);
  assert.match(text, /The sale of the shares reflected value created during Kestrel's ownership/);
  assert.match(text, /Marks argues/);
});
