import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "vitest";
import {
  UNCOVERED_LINE,
  accountKind,
  assertsAgreement,
  buildSourceAccount,
  productSentences,
  quoteIsVerbatim,
  renderDifference,
  sentenceIsTemplate,
  sentenceSaysPassageDoesNot,
  sentenceSaysPassageSays,
} from "../lib/qc/source-account.mjs";

const SOURCE = "The user demographic is unusual. Engagement is high.";
const STATEMENT = "The Company's user base is unusual in two respects.";

describe("B456 source account", () => {
  test("a fully backed card is the quote and no difference", async () => {
    const account = await buildSourceAccount({
      statement: STATEMENT,
      passage: "The user demographic is unusual.",
      sources: [{ text: SOURCE }],
      displayVerdict: "supported_full",
      supportState: "supported",
      commentaryNotReviewed: false,
      statementIndex: 0,
    });
    assert.equal(account.sourceAccount, true);
    assert.equal(account.sourceQuote, "The user demographic is unusual.");
    assert.equal(account.sourceDifference, "");
    assert.equal(productSentences(account.sourceDifference).length, 0);
  });

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

  test("a quote that is not in the source is not shown", async () => {
    const account = await buildSourceAccount({
      statement: STATEMENT,
      passage: "This sentence was not in the source.",
      sources: [{ text: SOURCE }],
      displayVerdict: "supported_full",
      supportState: "supported",
      statementIndex: 1,
    });
    assert.equal(account.sourceQuote, "");
    assert.equal(account.quoteRejected, true);
    assert.equal(quoteIsVerbatim("The user demographic is unusual.", [{ text: SOURCE }]), true);
  });

  test("an uncovered card has the fixed line and no quote", async () => {
    const account = await buildSourceAccount({
      statement: STATEMENT,
      passage: "",
      sources: [{ text: SOURCE }],
      displayVerdict: "not_supported",
      supportState: "not_supported",
      statementIndex: 2,
    });
    assert.equal(account.sourceDifference, UNCOVERED_LINE);
    assert.equal(account.sourceQuote, "");
    assert.equal(assertsAgreement(UNCOVERED_LINE), false);
  });

  test("the account module does not decide a verdict", () => {
    const source = readFileSync(new URL("../lib/qc/source-account.mjs", import.meta.url), "utf8");
    assert.equal(source.includes("displayVerdict ="), false);
    assert.equal(source.includes("applyOmissionConflictInvariant"), false);
    assert.equal(source.includes("detectFramingFidelity"), false);
    assert.equal(accountKind({ displayVerdict: "supported_full", supportState: "supported" }), "full");
  });

  test("a check that already wrote a fixed sentence keeps it, and the model is not asked", async () => {
    const role = "The statement attributes this to AGIC; the source credits GIC.";
    const kept = await buildSourceAccount({
      statement: "An earlier purchase from AGIC raised the stake.",
      passage: "3i acquired equity from GIC.",
      sources: [{ text: "3i acquired equity from GIC." }],
      displayVerdict: "conflict",
      supportState: "conflicting",
      displayVerdictReason: "role_party_mismatch",
      evidenceSummary: `${role} The source does not mention the earlier terms.`,
      statementIndex: 3,
    });
    assert.equal(kept.sourceDifference, role);
    const scale = "The source names a valuation uplift in TCR, not gains across essentially all of its investments.";
    const scaled = await buildSourceAccount({
      statement: "Gains were broad.",
      passage: "TCR was revalued.",
      sources: [{ text: "TCR was revalued." }],
      displayVerdict: "conflict",
      supportState: "conflicting",
      displayVerdictReason: "scale_set_one_holding",
      evidenceSummary: scale,
      statementIndex: 4,
    });
    assert.equal(scaled.sourceDifference, scale);
    assert.equal(assertsAgreement(scale), false);
  });

  test("a certifying sentence is counted, and a quoted source word is not", () => {
    assert.equal(assertsAgreement('The source confirms the statement.'), true);
    assert.equal(assertsAgreement('This matches the statement.'), true);
    assert.equal(assertsAgreement('The source says "confirmed". The passage does not.'), false);
  });
});
