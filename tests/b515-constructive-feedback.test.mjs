import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "vitest";
// This file builds the payload and strips markdown. It does not call a model.
import { leaveOutItems } from "../lib/prompt-library/compose.mjs";
import { READING_MODEL } from "../lib/qc/reading-review.mjs";
import { STAGE_MODELS } from "../lib/qc/model-config.mjs";
import { readerEvidenceSentence } from "../lib/qc/reader-reason.mjs";
import { shownLabel } from "../lib/qc/shown-verdict.mjs";
import { summariseReview } from "../lib/qc/review-summary.mjs";
import {
  buildConstructiveFeedbackV2,
  normalizeConstructiveFeedbackPlainText,
  shownWordCountLine,
} from "../lib/qc/constructive-feedback-v2.mjs";

const REVIEW_ON = {
  evidenceEnabled: true,
  editorialEnabled: true,
  complianceEnabled: true,
};

const conflict = {
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
  editorialConcerns: [{ note: "Use the source figure.", suggestedDirection: "Write 9 percent." }],
  complianceConcerns: [{ note: "Do not imply a guarantee.", suggestedDirection: "Drop the guarantee." }],
};

const clean = {
  statement: "The firm is based in Zurich.",
  statementVerdict: { state: "nothing_raised" },
  displayVerdict: "supported_full",
  readingNote: { bucket: "none", text: "Supported.", refused: false },
  editorialConcerns: [],
  complianceConcerns: [],
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
    statements: [
      { text: conflict.statement, qcCard: conflict },
      { text: clean.statement, qcCard: clean },
    ],
    ...extra,
  };
}

describe("B515 constructive feedback payload", () => {
  test("a finding matches the card label and the card reason, and a clean card is left out", () => {
    const built = buildConstructiveFeedbackV2(body());
    assert.equal(built.payload.findings.length, 1);
    const finding = built.payload.findings[0];
    assert.equal(finding.statement, conflict.statement);
    assert.equal(finding.label, shownLabel(conflict));
    assert.equal(finding.reason, readerEvidenceSentence(conflict) || "");
    assert.equal(finding.source.passage, "The margin was 9 percent.");
    assert.equal(finding.source.name, "Memo.pdf");
    assert.equal(finding.source.role, "facts");
    assert.deepEqual(finding.editorial, [{ note: "Use the source figure.", suggestedDirection: "Write 9 percent." }]);
    assert.deepEqual(finding.compliance, [{ note: "Do not imply a guarantee.", suggestedDirection: "Drop the guarantee." }]);
    assert.equal(built.payload.findings.some((row) => row.statement === clean.statement), false);
  });

  test("the exclude list is the text type list, and the chip is the readiness label", () => {
    const built = buildConstructiveFeedbackV2(body());
    assert.deepEqual(built.payload.excludeList, leaveOutItems("NEW_DIRECT_INVESTMENT"));
    const readiness = summariseReview([conflict, clean], REVIEW_ON).readiness;
    assert.equal(built.payload.assessmentChipLabel, readiness);
    assert.equal(built.readiness, readiness);
    assert.equal(built.payload.assessmentChips.includes("1 statement conflicts with the source"), true);
  });

  test("the word count line matches the Assessment line, with and without a typed limit", () => {
    const draftText = "One two three four five.";
    assert.equal(
      shownWordCountLine({
        draftText,
        outputType: "PRESS_RELEASE",
        outputTypeLabel: "Press release",
        wordLimit: null,
      }),
      "5 words, below the 200 to 300 word range for a press release"
    );
    assert.equal(
      shownWordCountLine({
        draftText,
        outputType: "INVESTOR_LETTER",
        outputTypeLabel: "Investor letter",
        wordLimit: 80,
      }),
      "5 words, within your 80 word limit"
    );
    const built = buildConstructiveFeedbackV2(body({ wordLimit: 80 }));
    assert.equal(Object.hasOwn(built.payload, "wordCountLine"), false);
    assert.equal(Object.hasOwn(built.payload, "lengthNote"), false);
  });

  test("the post-filter strips markdown and leaves the words", () => {
    const cleaned = normalizeConstructiveFeedbackPlainText("# Title\n\n**Fix** the *date*.\n\n- a bullet");
    assert.equal(cleaned.includes("#"), false);
    assert.equal(cleaned.includes("**"), false);
    assert.equal(cleaned.includes("*"), false);
    assert.equal(cleaned.includes("Fix"), true);
    assert.equal(cleaned.includes("date"), true);
    assert.equal(cleaned.includes("a bullet"), true);
  });

  test("the call uses the reading model, and this test does not call one", () => {
    assert.equal(STAGE_MODELS["constructive-feedback"].provider, "anthropic");
    assert.equal(STAGE_MODELS["constructive-feedback"].model, READING_MODEL);
    assert.equal(STAGE_MODELS["constructive-feedback-craft"], undefined);
    const route = readFileSync(new URL("../api/constructive-feedback.js", import.meta.url), "utf8");
    assert.equal(route.includes("buildConstructiveFeedbackV2"), true);
    assert.equal(route.includes("coverageRetry"), false);
    assert.equal(route.includes("runCraftPass"), false);
  });
});
