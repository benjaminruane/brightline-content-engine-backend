import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "vitest";
// This file checks the filter, the length field, and the prompt. It does not call a model.
import {
  CONSTRUCTIVE_FEEDBACK_V2_SYSTEM_PROMPT,
  HOUSE_SPELLING,
  buildConstructiveFeedbackV2,
  normalizeConstructiveFeedbackPlainText,
} from "../lib/qc/constructive-feedback-v2.mjs";

const EM = "\u2014";
const EN = "\u2013";

const REVIEW_ON = {
  evidenceEnabled: true,
  editorialEnabled: true,
  complianceEnabled: true,
};

function body(extra = {}) {
  return {
    draftText: "The margin is 11 percent. The firm is based in Zurich.",
    eventType: "NEW_DIRECT_INVESTMENT",
    outputType: "investor_letter",
    outputTypeLabel: "Investor letter",
    visibility: "complete",
    wordLimit: null,
    reviewOptions: REVIEW_ON,
    statements: [{
      text: "The margin is 11 percent.",
      qcCard: {
        statement: "The margin is 11 percent.",
        statementVerdict: { state: "conflicts", setBy: { branch: "statementVerdict" } },
        displayVerdict: "conflict",
        primaryExcerpt: "The margin was 9 percent.",
        primaryRefTitle: "Memo.pdf",
        matchExplanations: [{
          sourceLabel: "Memo.pdf",
          role: "facts",
          classification: "conflicting",
          explanation: "The source says 9 percent.",
        }],
        readingNote: { bucket: "conflicts", text: "The figures differ.", refused: false },
      },
    }],
    ...extra,
  };
}

function words(count) {
  return Array.from({ length: count }, () => "word").join(" ");
}

describe("B517 feedback polish", () => {
  test("the post-filter replaces an em dash and an en dash in each of the three cases", () => {
    for (const dash of [EM, EN]) {
      assert.equal(
        normalizeConstructiveFeedbackPlainText(`He said "done" ${dash} then left.`),
        `He said "done": then left.`
      );
      assert.equal(
        normalizeConstructiveFeedbackPlainText(`The draft is long ${dash} cut it.`),
        "The draft is long, cut it."
      );
      assert.equal(
        normalizeConstructiveFeedbackPlainText(`Use 12${dash}15 words.`),
        "Use 12 to 15 words."
      );
      assert.equal(
        normalizeConstructiveFeedbackPlainText(`Use 12 ${dash} 15 words.`),
        "Use 12 to 15 words."
      );
    }
  });

  test("the length note is not a finding, and it is passed only when the count is outside the limit or the range", () => {
    const withinLimit = buildConstructiveFeedbackV2(body({ wordLimit: 80 }));
    assert.equal(Object.hasOwn(withinLimit.payload, "lengthNote"), false);
    assert.equal(Object.hasOwn(withinLimit.payload, "wordCountLine"), false);

    const withinRange = buildConstructiveFeedbackV2(body({ draftText: words(220), wordLimit: null }));
    assert.equal(Object.hasOwn(withinRange.payload, "lengthNote"), false);

    const below = buildConstructiveFeedbackV2(body({ wordLimit: null }));
    assert.equal(Object.hasOwn(below.payload, "lengthNote"), false);
    const aboveLimit = buildConstructiveFeedbackV2(body({ wordLimit: 1 }));
    assert.equal(aboveLimit.payload.lengthNote, "11 words, above your 1 word limit");
    const withinAllowance = buildConstructiveFeedbackV2(body({ draftText: words(320), wordLimit: null }));
    assert.equal(Object.hasOwn(withinAllowance.payload, "lengthNote"), false);
    const aboveRange = buildConstructiveFeedbackV2(body({ draftText: words(340), wordLimit: null }));
    assert.match(aboveRange.payload.lengthNote, /^340 words, above the 200 to 300 word range/);

    for (const built of [withinLimit, withinRange, below, aboveLimit, withinAllowance, aboveRange]) {
      const packed = JSON.stringify(built.payload.findings);
      assert.equal(packed.includes("lengthNote"), false);
      assert.equal(packed.includes("wordCountLine"), false);
      if (built.payload.lengthNote) assert.equal(packed.includes(built.payload.lengthNote), false);
    }
  });

  test("the house spelling setting is the pop-up value and it is in the prompt", () => {
    const page = readFileSync(
      new URL("../../brightline-content-engine-frontend/src/modules/settings/HouseStylePage.jsx", import.meta.url),
      "utf8"
    );
    assert.equal(page.includes('spellingDisplay("US")') || page.includes("spellingDisplay('US')"), true);
    assert.equal(HOUSE_SPELLING, "US English (Merriam-Webster)");
    assert.equal(
      CONSTRUCTIVE_FEEDBACK_V2_SYSTEM_PROMPT.includes("Use US English spelling (Merriam-Webster) throughout."),
      true
    );
    assert.equal(CONSTRUCTIVE_FEEDBACK_V2_SYSTEM_PROMPT.includes(EM), false);
    assert.equal(CONSTRUCTIVE_FEEDBACK_V2_SYSTEM_PROMPT.includes(EN), false);
  });
});
