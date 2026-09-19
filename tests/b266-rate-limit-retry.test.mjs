/**
 * B266: 429 retries use the server delay plus jitter, with a cap and a bound.
 * Spec named this file b264; B264 is already the wrong-excerpt filing, so this is B266.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import {
  RATE_LIMIT_MAX_ATTEMPTS,
  RATE_LIMIT_MAX_DELAY_MS,
  isRateLimitError,
  parseRetryAfterMs,
  rateLimitDelayMs,
  withRateLimitRetry,
} from "../lib/observability.js";

function rateLimitError(message, headers = {}) {
  const err = new Error(message);
  err.status = 429;
  err.headers = headers;
  return err;
}

describe("B266 retry on 429", () => {
  test("the bound and cap are finite", () => {
    assert.equal(RATE_LIMIT_MAX_ATTEMPTS, 4);
    assert.equal(RATE_LIMIT_MAX_DELAY_MS, 2000);
  });

  test("a 429 with try-again-in-42ms is a rate limit whose delay is 42ms", () => {
    const err = rateLimitError(
      "Rate limit reached for gpt-4o. Limit 2000000, Used 2000000, Requested 1428. Please try again in 42ms."
    );
    assert.equal(isRateLimitError(err), true);
    assert.equal(parseRetryAfterMs(err), 42);
  });

  test("retry-after-ms header wins over the message", () => {
    const err = rateLimitError("Please try again in 99ms.", { "retry-after-ms": "80" });
    assert.equal(parseRetryAfterMs(err), 80);
  });

  test("delay is server delay plus jitter and never above the cap", () => {
    const err = rateLimitError("Please try again in 42ms.");
    const delay = rateLimitDelayMs(err, () => 1);
    assert.equal(delay >= 42, true);
    assert.equal(delay <= RATE_LIMIT_MAX_DELAY_MS, true);
    const huge = rateLimitError("Please try again in 99999ms.");
    assert.equal(rateLimitDelayMs(huge, () => 0) <= RATE_LIMIT_MAX_DELAY_MS, true);
  });

  test("a 429 is retried then succeeds, and a persistent 429 stops at the bound", async () => {
    const sleeps = [];
    const sleep = async (ms) => {
      sleeps.push(ms);
    };
    let hits = 0;
    const out = await withRateLimitRetry(
      async () => {
        hits += 1;
        if (hits < 3) throw rateLimitError("Please try again in 42ms.");
        return "ok";
      },
      { sleep, random: () => 0 }
    );
    assert.equal(out, "ok");
    assert.equal(hits, 3);
    assert.deepEqual(sleeps, [42, 42]);

    let persistentHits = 0;
    await assert.rejects(
      () =>
        withRateLimitRetry(
          async () => {
            persistentHits += 1;
            throw rateLimitError("Please try again in 42ms.");
          },
          { sleep: async () => {}, random: () => 0 }
        ),
      (err) => err.status === 429
    );
    assert.equal(persistentHits, RATE_LIMIT_MAX_ATTEMPTS);
  });

  test("a non-429 is not retried", async () => {
    let hits = 0;
    await assert.rejects(
      () =>
        withRateLimitRetry(async () => {
          hits += 1;
          throw new Error("schema boom");
        }),
      /schema boom/
    );
    assert.equal(hits, 1);
  });
});
