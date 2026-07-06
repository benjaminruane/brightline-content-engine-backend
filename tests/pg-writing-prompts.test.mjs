import { describe, test } from "vitest";
import assert from "node:assert/strict";
import { buildBasePrompt } from "../lib/prompt-library/index.js";
import { buildPgWritingScaffold, normalizePgInvestmentName, PG_WRITING_EVENT } from "../lib/prompt-library/pg-writing-prompts.mjs";
import { VISIBILITY } from "../lib/output-intent.js";

describe("pg-writing-prompts", () => {
  test("normalizePgInvestmentName trims trailing punctuation before substitution", () => {
    assert.equal(normalizePgInvestmentName("  Meridian Capital Partners V,  "), "Meridian Capital Partners V");
    assert.equal(normalizePgInvestmentName('"Gestcompost"'), "Gestcompost");
  });

  test("buildPgWritingScaffold substitutes trimmed investment name", () => {
    const text = buildPgWritingScaffold(PG_WRITING_EVENT.NEW_DIRECT_INVESTMENT, VISIBILITY.COMPLETE, {
      transactionDate: "Mar 2024",
      investment: "Meridian Capital Partners V,",
      sources: [],
    });
    assert.match(text, /The investment is Meridian Capital Partners V\./);
    assert.match(text, /Partners Group invested in Meridian Capital Partners V, a/);
  });

  test("buildPgWritingScaffold substitutes placeholders and verb", () => {
    const text = buildPgWritingScaffold(PG_WRITING_EVENT.NEW_DIRECT_INVESTMENT, VISIBILITY.COMPLETE, {
      transactionDate: "Mar 2024",
      investment: "Gestcompost",
      specialInstructions: "Emphasise circular economy theme.",
      sources: [{ label: "IC memo", text: "Revenue EUR 120m." }],
    });
    assert.ok(text);
    assert.match(text, /Mar 2024/);
    assert.match(text, /Gestcompost/);
    assert.match(text, /invested in/);
    assert.match(text, /IC memo/);
    assert.match(text, /Binding constraints \(highest precedence/);
    assert.match(text, /MUST NOT be used as the transaction date/);
    assert.match(text, /Never substitute 'the firm'/);
    assert.match(text, /The investment is Gestcompost/);
    assert.match(text, /Do NOT substitute a different company or fund name/);
    assert.match(text, /exactly TWO paragraphs/);
    assert.match(text, /Paragraph 1 describes the asset/);
    assert.match(text, /must not exceed 150 words/);
    assert.match(text, /March 2026', not 'Mar 2026'/);
    assert.match(text, /USD 20 million/);
    assert.match(text, /---METHODOLOGY---/);
    assert.match(text, /COMMENTARY ONLY/);
    assert.doesNotMatch(text, /\{TRANSACTION_DATE\}/);
  });

  test("buildBasePrompt places PG scaffold after output-type guidance", () => {
    const { basePromptText } = buildBasePrompt({
      outputType: "reporting_commentary",
      visibility: "complete",
      eventType: PG_WRITING_EVENT.NEW_DIRECT_INVESTMENT,
      transactionDate: "Jun 2025",
      investment: "TestCo",
      specialInstructions: "",
      sources: [],
    });
    const outputIdx = basePromptText.indexOf("Output type:");
    const bindingIdx = basePromptText.indexOf("Binding constraints");
    assert.ok(outputIdx >= 0);
    assert.ok(bindingIdx > outputIdx);
  });

  test("buildBasePrompt uses PG scaffold for demo event types", () => {
    const { basePromptText } = buildBasePrompt({
      outputType: "reporting_commentary",
      visibility: "public",
      eventType: PG_WRITING_EVENT.NEW_FUND_COMMITMENT,
      transactionDate: "Jun 2025",
      investment: "Partners Group Next Generation Infrastructure",
      specialInstructions: "",
      sources: [],
    });
    assert.match(basePromptText, /committed to/);
    assert.match(basePromptText, /Partners Group Next Generation Infrastructure/);
    assert.match(basePromptText, /publicly available information/);
    assert.match(basePromptText, /exactly ONE paragraph/);
  });

  test("fund commitment complete binding uses fund in structure constraint", () => {
    const text = buildPgWritingScaffold(PG_WRITING_EVENT.NEW_FUND_COMMITMENT, VISIBILITY.COMPLETE, {
      transactionDate: "Apr 2024",
      investment: "Fund X",
      sources: [],
    });
    assert.match(text, /Paragraph 1 describes the fund/);
    assert.match(text, /committed to' \/ 'completed a commitment to/);
    assert.match(text, /Never write 'lead commitment'/);
    assert.match(text, /Do NOT state fund mechanics/);
    assert.match(text, /GP commitment %/);
    assert.match(text, /Never 'GP' or 'general partner'/);
    assert.match(text, /State prior track record qualitatively only/);
    assert.match(text, /never present exit\/realised returns as a reason for this commitment/);
    assert.match(text, /sector strategy \/ sector focus/);
    assert.match(text, /thesis-led narrative, not a data dump/);
    assert.doesNotMatch(text, /Narrative calibration:[\s\S]*Never write 'lead commitment'/);
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
});
