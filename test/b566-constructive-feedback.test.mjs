/**
 * B566. Constructive feedback builds from the saved ClearPoint review.
 * A failure returns the plain retry sentence. This test does not call a model.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "vitest";
import { beginRequestBudget } from "../lib/qc/request-budget.mjs";
import { assertReviewCanStartCall } from "../lib/qc/review-deadline.mjs";
import {
  CONSTRUCTIVE_FEEDBACK_FAILED,
  buildConstructiveFeedbackV2,
  constructiveFeedbackFailure,
  constructiveFeedbackSystemPrompt,
  normalizeConstructiveFeedbackPlainText,
  prependReadiness,
} from "../lib/qc/constructive-feedback-v2.mjs";

const REVIEW = JSON.parse(readFileSync("/Users/benjaminruane/ce-diagnostics/b565/clearpoint-pdf-review.json", "utf8"));

function screenBody(review) {
  const draftText = (review.statements || []).map((row) => row.text || row.qcCard?.statement || "").join("\n\n");
  return {
    draftText,
    outputType: "reporting_commentary",
    outputTypeLabel: "Reporting commentary",
    eventType: "OTHER_UPDATE",
    visibility: "complete",
    reviewOptions: review.meta?.reviewOptions,
    statements: (review.statements || []).map((row) => ({
      text: row.text || "",
      qcCard: row.qcCard,
    })),
  };
}

test("the saved review builds a prompt and a model reply becomes author-facing notes", () => {
  assert.throws(() => buildConstructiveFeedbackV2(REVIEW), /draft text is missing/);
  const built = buildConstructiveFeedbackV2(screenBody(REVIEW));
  assert.equal(built.readiness, "Needs significant work");
  assert.ok(built.payload.findings.length > 0);
  const prompt = constructiveFeedbackSystemPrompt();
  assert.match(prompt, /To fix/);
  assert.match(prompt, /For next time/);
  const notes = prependReadiness(
    built.readiness,
    normalizeConstructiveFeedbackPlainText("**To fix**\n\n- The date is wrong.")
  );
  assert.match(notes, /^Needs significant work\./);
  assert.match(notes, /To fix/);
  assert.equal(notes.includes("**"), false);
});

test("a feedback budget with no review deadline still allows the call", () => {
  beginRequestBudget({ startedAt: Date.now(), maxDurationMs: 300_000, model: "claude-opus-4-7" });
  assert.doesNotThrow(() => assertReviewCanStartCall());
});

test("a failed route returns the plain retry sentence", () => {
  const failed = constructiveFeedbackFailure(false);
  assert.equal(failed.ok, false);
  assert.equal(failed.feedbackText, "");
  assert.equal(failed.message, CONSTRUCTIVE_FEEDBACK_FAILED);
  assert.equal(failed.message, "Couldn't write the feedback this time. Please try again.");
  const route = readFileSync(new URL("../api/constructive-feedback.js", import.meta.url), "utf8");
  assert.equal(route.includes("constructiveFeedbackFailure"), true);
  assert.equal(route.includes("Constructive feedback unavailable"), false);
});
