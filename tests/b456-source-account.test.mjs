import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "vitest";
import { quoteIsVerbatim } from "../lib/qc/evidence-line.mjs";
import {
  assertsAgreement,
  productSentences,
  renderDifference,
  sentenceIsTemplate,
  sentenceSaysPassageDoesNot,
  sentenceSaysPassageSays,
} from "../lib/qc/source-account.mjs";

const SOURCE = "The user demographic is unusual. Engagement is high.";
const STATEMENT = "The Company's user base is unusual in two respects.";

describe("B456 source account", () => {
  test("a partial difference is a template whose span is in the sentence and not in the passage", () => {
    const rendered = renderDifference(
      "partial",
      { claims: ["two respects", "The user demographic is unusual"] },
      STATEMENT,
      "The user demographic is unusual.",
    );
    assert.equal(rendered.ok, true);
    assert.equal(rendered.text, sentenceSaysPassageDoesNot("two respects"));
    assert.equal(sentenceIsTemplate(rendered.text), true);
    assert.equal(assertsAgreement(rendered.text), false);
    assert.equal(productSentences("").length, 0);
  });

  test("a conflict difference quotes both sides and does not say they agree", () => {
    const rendered = renderDifference(
      "conflict",
      { sentence: "17%", passage: "17.1%" },
      "The CAGR is 17%.",
      "The CAGR is 17.1%.",
    );
    assert.equal(rendered.text, sentenceSaysPassageSays("17%", "17.1%"));
    assert.equal(assertsAgreement(rendered.text), false);
  });

  test("a span that is not in the sentence is refused", () => {
    const rendered = renderDifference(
      "partial",
      { claims: ["a claim the sentence does not make"] },
      STATEMENT,
      SOURCE,
    );
    assert.equal(rendered.ok, false);
  });

  test("the live quote check still requires the words to be in the source", () => {
    assert.equal(quoteIsVerbatim("The user demographic is unusual.", [{ text: SOURCE }]), true);
    assert.equal(quoteIsVerbatim("This sentence was not in the source.", [{ text: SOURCE }]), false);
  });

  test("the retired writer is not on this module", () => {
    const source = readFileSync(new URL("../lib/qc/source-account.mjs", import.meta.url), "utf8");
    assert.equal(source.includes("buildSourceAccount"), false);
    assert.equal(source.includes("callLLM"), false);
    assert.equal(source.includes("displayVerdict ="), false);
    assert.equal(source.includes("applyOmissionConflictInvariant"), false);
    assert.equal(source.includes("detectFramingFidelity"), false);
    assert.throws(() => readFileSync(new URL("../lib/qc/pipeline-v4/prompts/source-difference.md", import.meta.url)));
  });

  test("a fixed sentence the checks already write is still recognised as a template", () => {
    const role = "The statement attributes this to AGIC; the source credits GIC.";
    assert.equal(sentenceIsTemplate(role), true);
    const scale = "The source names a valuation uplift in TCR, not gains across essentially all of its investments.";
    assert.equal(sentenceIsTemplate(scale), true);
    assert.equal(assertsAgreement(scale), false);
  });

  test("a certifying sentence is counted, and a quoted source word is not", () => {
    assert.equal(assertsAgreement("The source confirms the statement."), true);
    assert.equal(assertsAgreement("This matches the statement."), true);
    assert.equal(assertsAgreement('The source says "confirmed". The passage does not.'), false);
  });
});
