/**
 * B449. The LinkedIn credit-line exception is deterministic.
 * The reviewer note already reaches the model. The model ignored it.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import editorialRules from "../lib/rulebook/editorialRules.js";
import { OUTPUT_TYPE, getOutputTypeLabel } from "../lib/output-intent.js";
import { buildEditorialStyleSystemPrompt } from "../lib/qc/editorial-compliance-reviewer.mjs";
import { resolveStyleGuide } from "../lib/qc/style-guide.mjs";
import {
  isLinkedInCreditLine,
  suppressLinkedInCreditLines,
} from "../lib/qc/linkedin-credit-line.mjs";

const MAGNUS = "Magnus Karlsson, who took on the international expansion challenge with grace and decisiveness.";
const INVESTOR = "The Company's discretionary positioning means demand sensitivity to macroeconomic conditions.";

function concern(text) {
  return {
    concernCode: "structural_integrity",
    text: `${text} is a sentence fragment.`,
    quote: "",
    span: [{ startChar: 0, endChar: text.length }],
  };
}

describe("B449 LinkedIn credit line", () => {
  test("the reviewer note is in the LinkedIn prompt", () => {
    const prompt = buildEditorialStyleSystemPrompt({
      outputTypeLabel: getOutputTypeLabel(OUTPUT_TYPE.LINKEDIN_POST),
      editorialRules,
      structuredStyleRules: resolveStyleGuide({
        outputType: OUTPUT_TYPE.LINKEDIN_POST,
        promptHouseName: "Meridian Capital",
      }),
      outputSlug: "linkedin_post",
      outputType: OUTPUT_TYPE.LINKEDIN_POST,
      houseName: "Meridian Capital",
    });
    assert.match(prompt, /reviewerNote: On linkedin_post: name-plus-relative-clause fragments/);
    assert.match(prompt, /Name-plus-relative-clause fragments and short list-style lines are acceptable structure/);
  });

  test("a name plus a relative clause, and a short credit line, are the exception", () => {
    assert.equal(isLinkedInCreditLine(MAGNUS), true);
    assert.equal(isLinkedInCreditLine("Magnus Karlsson."), true);
    assert.equal(isLinkedInCreditLine("CEO Magnus Karlsson."), true);
    assert.equal(isLinkedInCreditLine("Having closed the round, the valuation was set."), false);
    assert.equal(isLinkedInCreditLine("Revenue rose costs fell in the same quarter."), false);
    assert.equal(isLinkedInCreditLine("The figures is ahead of the plan."), false);
    assert.equal(isLinkedInCreditLine(INVESTOR), false);
  });

  test("the concern drops only on a LinkedIn post", () => {
    const magnus = concern(MAGNUS);
    const investor = concern(INVESTOR);
    assert.equal(suppressLinkedInCreditLines([magnus], MAGNUS, "linkedin_post").length, 0);
    assert.equal(suppressLinkedInCreditLines([investor], INVESTOR, "linkedin_post").length, 1);
    assert.equal(suppressLinkedInCreditLines([magnus], MAGNUS, "investor_letter").length, 1);
  });

  test("a missing output type or statement is refused", () => {
    assert.throws(() => suppressLinkedInCreditLines([], "x", ""), /output type is missing/);
    assert.throws(() => suppressLinkedInCreditLines([], undefined, "linkedin_post"), /statement is missing/);
    assert.throws(() => isLinkedInCreditLine(undefined), /text is missing/);
  });
});
