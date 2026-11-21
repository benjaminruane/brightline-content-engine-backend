/**
 * B555. A cached result for one house style is not reused for another.
 * Decision 11.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { applyGuideAutoFix } from "../lib/style-guide/auto-fix.mjs";
import { renderDraftStyleSection, resolveStyleChoices, styleFingerprint } from "../lib/style-guide/render.mjs";
import { buildCacheKey, currentStyleFingerprint, enterStyleFingerprint, getLlmCache, putLlmCache } from "../lib/qc/llm-cache.mjs";
import { getPromptGuidance } from "../lib/output-intent.js";

const A = resolveStyleChoices({
  spelling: "US",
  thousands: "comma",
  quotes: "single",
  magnitude: "billions",
  legalIdentifiers: "omit",
  bannedWords: ["synergy"],
});
const B = resolveStyleChoices({
  spelling: "UK",
  thousands: "apostrophe",
  quotes: "double",
  magnitude: "millions",
  legalIdentifiers: "keep",
  bannedWords: ["leverage"],
});

describe("B555 account isolation", () => {
  test("Generate, Rewrite, Adapt, and Review instructions follow that account only", () => {
    const draftA = renderDraftStyleSection(A);
    const draftB = renderDraftStyleSection(B);
    assert.match(draftA, /US English/);
    assert.match(draftA, /comma/);
    assert.match(draftA, /single quotation/);
    assert.match(draftA, /billions/);
    assert.match(draftA, /Omit a legal identifier/);
    assert.match(draftA, /synergy/);
    assert.equal(draftA.includes("leverage"), false);
    assert.match(draftB, /UK English/);
    assert.match(draftB, /apostrophe/);
    assert.match(draftB, /double quotation/);
    assert.match(draftB, /millions/);
    assert.match(draftB, /Keep a legal identifier/);
    assert.match(draftB, /leverage/);
    assert.equal(draftB.includes("synergy"), false);
    const tidyA = applyGuideAutoFix('Fjordline Software AS said "growth". GBP 5,049 million.', { styleChoices: A, outputType: "reporting_commentary" }).text;
    const tidyB = applyGuideAutoFix('Fjordline Software AS said "growth". GBP 5,049 million.', { styleChoices: B, outputType: "reporting_commentary" }).text;
    assert.equal(tidyA.includes("AS"), false);
    assert.match(tidyA, /'growth'/);
    assert.match(tidyA, /5\.0 billion/);
    assert.match(tidyB, /AS/);
    assert.match(tidyB, /"growth"/);
    assert.match(tidyB, /million/);
    assert.equal(getPromptGuidance("LINKEDIN_POST", "public").includes("we"), true);
  });

  test("a cached Review result for account A is not reused for account B", async () => {
    const fingerprintA = styleFingerprint(A);
    const fingerprintB = styleFingerprint(B);
    assert.notEqual(fingerprintA, fingerprintB);
    enterStyleFingerprint(fingerprintA);
    assert.equal(currentStyleFingerprint(), fingerprintA);
    const parts = {
      stage: "stage2",
      inputText: "The firm committed.",
      parentSentence: null,
      sourceText: "The firm committed.",
      promptHash: "b555-isolation",
      modelId: "gpt-4o-2024-08-06",
      temperature: 0,
      seed: 1,
    };
    const keyA = buildCacheKey({ ...parts, styleFingerprint: fingerprintA });
    const keyB = buildCacheKey({ ...parts, styleFingerprint: fingerprintB });
    assert.notEqual(keyA, keyB);
    await putLlmCache({ ...parts, styleFingerprint: fingerprintA }, { from: "A" });
    const hitA = await getLlmCache({ ...parts, styleFingerprint: fingerprintA });
    const hitB = await getLlmCache({ ...parts, styleFingerprint: fingerprintB });
    assert.equal(hitA.hit, true);
    assert.equal(hitA.payload.from, "A");
    assert.equal(hitB.hit, false);
  });
});
