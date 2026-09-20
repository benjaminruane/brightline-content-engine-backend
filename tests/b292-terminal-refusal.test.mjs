/**
 * B292. A terminal refusal is not retried. A review that has not started
 * does not wait out the Function bound.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import {
  NOTHING_REVIEWED_RETRY_BOUND_MS,
  REVIEW_DID_NOT_RUN,
  isRateLimitError,
  isReviewDidNotStartError,
  isTerminalProviderRefusal,
  withRateLimitRetry,
} from "../lib/observability.js";
import {
  RateLimitBoundError,
  beginRequestBudget,
  isRateLimitBoundError,
  recordLlmSuccess,
} from "../lib/qc/request-budget.mjs";

function quotaError() {
  const err = new Error("429 You have no credits remaining.");
  err.status = 429;
  err.code = "credit_balance_exhausted";
  err.type = "insufficient_quota";
  err.headers = {};
  return err;
}

function tpmError() {
  const err = new Error(
    "Rate limit reached for gpt-4o. Limit 2000000, Used 2000000, Requested 1428. Please try again in 42ms."
  );
  err.status = 429;
  err.code = "rate_limit_exceeded";
  err.headers = { "retry-after-ms": "42" };
  return err;
}

function messageOnly429() {
  const err = new Error("something about a rate limit and 429");
  return err;
}

describe("B292 terminal versus transient refusal", () => {
  test("NOTHING_REVIEWED_RETRY_BOUND_MS is eight seconds", () => {
    assert.equal(NOTHING_REVIEWED_RETRY_BOUND_MS, 8_000);
  });

  test("credit_balance_exhausted is terminal and is not a rate-limit retry", () => {
    const err = quotaError();
    assert.equal(isTerminalProviderRefusal(err), true);
    assert.equal(isRateLimitError(err), false);
  });

  test("a TPM 429 with rate_limit_exceeded is transient", () => {
    const err = tpmError();
    assert.equal(isTerminalProviderRefusal(err), false);
    assert.equal(isRateLimitError(err), true);
  });

  test("message text alone is not a rate-limit retry", () => {
    assert.equal(isRateLimitError(messageOnly429()), false);
    assert.equal(isTerminalProviderRefusal(messageOnly429()), false);
  });

  test("a terminal refusal fails immediately with the honest copy", async () => {
    const sleeps = [];
    let hits = 0;
    await beginRequestBudget({ startedAt: Date.now(), maxDurationMs: 300_000 }, async () => {
      await assert.rejects(
        () =>
          withRateLimitRetry(
            async () => {
              hits += 1;
              throw quotaError();
            },
            {
              sleep: async (ms) => {
                sleeps.push(ms);
              },
            }
          ),
        (err) => isReviewDidNotStartError(err) && err.message === REVIEW_DID_NOT_RUN
      );
    });
    assert.equal(hits, 1);
    assert.equal(sleeps.length, 0);
  });

  test("a first-call TPM refusal does not wait past the short ceiling", async () => {
    const sleeps = [];
    await beginRequestBudget({ startedAt: Date.now(), maxDurationMs: 300_000 }, async () => {
      await assert.rejects(
        () =>
          withRateLimitRetry(
            async () => {
              throw tpmError();
            },
            {
              sleep: async (ms) => {
                sleeps.push(ms);
              },
            }
          ),
        (err) => isReviewDidNotStartError(err)
      );
    });
    const waited = sleeps.reduce((sum, ms) => sum + ms, 0);
    assert.equal(waited < NOTHING_REVIEWED_RETRY_BOUND_MS, true);
    assert.equal(waited + 1000 > NOTHING_REVIEWED_RETRY_BOUND_MS || sleeps.length >= 1, true);
  });

  test("after a successful call, a TPM bound is still RateLimitBoundError", async () => {
    await beginRequestBudget({ startedAt: Date.now(), maxDurationMs: 400 }, async () => {
      recordLlmSuccess();
      await assert.rejects(
        () =>
          withRateLimitRetry(async () => {
            throw tpmError();
          }, { sleep: async () => {} }),
        (err) => isRateLimitBoundError(err) && err instanceof RateLimitBoundError
      );
    });
  });
});
