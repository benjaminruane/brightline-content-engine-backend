/**
 * B536. An empty word limit uses the output type's range. A typed number replaces it.
 * A draft within the limit plus 10% is not over.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { writingBrief } from "../lib/prompt-library/compose.mjs";
import { buildBasePrompt } from "../lib/prompt-library/index.js";
import { exceedsLengthAllowance } from "../lib/prompt-library/outputTypeGuidance.js";
import { lengthNote, shownWordCountLine } from "../lib/qc/constructive-feedback-v2.mjs";

function words(count) {
  return Array.from({ length: count }, () => "word").join(" ");
}

function review(wordLimit, count) {
  return {
    brief: writingBrief({
      eventType: "NEW_DIRECT_INVESTMENT",
      outputType: "REPORTING_COMMENTARY",
      visibility: "complete",
      maxWords: wordLimit,
    }),
    line: shownWordCountLine({
      draftText: words(count),
      outputType: "REPORTING_COMMENTARY",
      outputTypeLabel: "Reporting commentary",
      wordLimit,
    }),
    note: lengthNote({
      draftText: words(count),
      outputType: "REPORTING_COMMENTARY",
      outputTypeLabel: "Reporting commentary",
      wordLimit,
    }),
  };
}

describe("B536 word limit", () => {
  test("an empty field gives the commentary range in the draft and in review", () => {
    const { basePromptText } = buildBasePrompt({
      eventType: "NEW_DIRECT_INVESTMENT",
      outputType: "reporting_commentary",
      visibility: "complete",
    });
    assert.equal((basePromptText.match(/Length:/g) || []).length, 1);
    assert.equal(basePromptText.includes("Length: no more than 150 words."), true);
    assert.equal(
      shownWordCountLine({
        draftText: words(120),
        outputType: "REPORTING_COMMENTARY",
        outputTypeLabel: "Reporting commentary",
        wordLimit: null,
      }),
      "120 words, within the 100 to 150 word range for reporting commentary"
    );
    const built = review(null, 120);
    assert.equal(built.brief.includes("Length: no more than 150 words."), true);
    assert.equal(built.note, null);
  });

  test("a typed 250 replaces the range in the prompt and in both review lines", () => {
    const { basePromptText } = buildBasePrompt({
      eventType: "NEW_DIRECT_INVESTMENT",
      outputType: "reporting_commentary",
      visibility: "complete",
      maxWords: 250,
    });
    assert.equal((basePromptText.match(/Length:/g) || []).length, 1);
    assert.equal(basePromptText.includes("Length: no more than 250 words."), true);
    assert.equal(basePromptText.includes("100 to 150"), false);
    const line = shownWordCountLine({
      draftText: words(200),
      outputType: "REPORTING_COMMENTARY",
      outputTypeLabel: "Reporting commentary",
      wordLimit: 250,
    });
    assert.equal(line, "200 words, within your 250 word limit");
    assert.equal(line.includes("100 to 150"), false);
    const built = review(250, 200);
    assert.equal(built.brief.includes("Length: no more than 250 words."), true);
    assert.equal(built.brief.includes("100 to 150"), false);
    assert.equal(built.note, null);
  });

  test("260 words against a 250 limit is within the allowance, and 280 is over", () => {
    assert.equal(exceedsLengthAllowance(260, 250), false);
    assert.equal(exceedsLengthAllowance(275, 250), false);
    assert.equal(exceedsLengthAllowance(280, 250), true);
    const within = review(250, 260);
    assert.equal(within.note, null);
    assert.equal(within.line, "260 words, within your 250 word limit");
    const over = review(250, 280);
    assert.match(over.note, /^280 words, above your 250 word limit/);
    assert.equal(over.line, "280 words, above your 250 word limit");
  });
});
