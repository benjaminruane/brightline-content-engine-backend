/**
 * B564. One slow match cannot sink a Review, and a timeout response still carries CORS.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { beginRequestBudget } from "../lib/qc/request-budget.mjs";
import { notCheckedReasonSentence, NOT_REVIEWED_REASONS } from "../lib/qc/not-reviewed-reason.mjs";
import { notReviewedReasonFromMatches } from "../lib/qc/worked-record.mjs";
import {
  assertReviewCanStartCall,
  CHECK_TOO_LONG_SENTENCE,
  MATCH_CALL_LIMIT_MS,
  REVIEW_RUN_DEADLINE_MS,
  REVIEW_STOPPED_MESSAGE,
  runMatchCall,
} from "../lib/qc/review-deadline.mjs";
import { sendReviewJson } from "../api/analyse-statements.js";
import { DEFAULT_FRONTEND_ORIGIN } from "../lib/http/frontend-origins.mjs";

test("a source match has a 45 second limit, and the run stops new calls at 240 seconds", () => {
  assert.equal(MATCH_CALL_LIMIT_MS, 45_000);
  assert.equal(REVIEW_RUN_DEADLINE_MS, 240_000);
  assert.equal(REVIEW_RUN_DEADLINE_MS < 300_000, true);
});

test("a match that exceeds its limit is abandoned, and the other match still returns", async () => {
  let finished = false;
  const slow = runMatchCall(() => new Promise(() => {}), 20);
  const fast = runMatchCall(async () => {
    finished = true;
    return { classification: "confirmed" };
  }, 20);
  const [slowResult, fastResult] = await Promise.allSettled([slow, fast]);
  assert.equal(slowResult.status, "rejected");
  assert.equal(slowResult.reason.code, "match_call_timeout");
  assert.equal(fastResult.status, "fulfilled");
  assert.equal(finished, true);
  assert.equal(fastResult.value.classification, "confirmed");
  const reason = notReviewedReasonFromMatches([{ checkTooLong: true, classification: "not_reviewed" }]);
  assert.equal(reason, NOT_REVIEWED_REASONS.CHECK_TOO_LONG);
  assert.equal(notCheckedReasonSentence(reason), CHECK_TOO_LONG_SENTENCE);
});

test("after the run deadline, a paid call does not start", () => {
  beginRequestBudget({
    startedAt: Date.now() - REVIEW_RUN_DEADLINE_MS,
    maxDurationMs: 300_000,
    reviewRunDeadlineMs: REVIEW_RUN_DEADLINE_MS,
  });
  assert.throws(() => assertReviewCanStartCall(), (err) => err.code === "review_run_deadline");
});

test("a timeout response carries CORS headers and the plain message", () => {
  const headers = {};
  const res = {
    statusCode: 0,
    body: null,
    setHeader(name, value) { headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  sendReviewJson(
    { headers: { origin: DEFAULT_FRONTEND_ORIGIN }, method: "POST" },
    res,
    200,
    { ok: false, error: REVIEW_STOPPED_MESSAGE, message: REVIEW_STOPPED_MESSAGE },
  );
  assert.equal(res.statusCode, 200);
  assert.equal(headers["Access-Control-Allow-Origin"], DEFAULT_FRONTEND_ORIGIN);
  assert.equal(res.body.message, "The review took too long and was stopped. Results so far are shown.");
});
