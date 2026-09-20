/**
 * B278. A refused call waits until it can fit, inside the remaining Function
 * time minus the TPM-floor of remaining work. Hitting the bound is not_reviewed.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";
import {
  RATE_LIMIT_MAX_ATTEMPTS,
  isRateLimitError,
  isReviewDidNotStartError,
  parseRetryAfterMs,
  rateLimitDelayMs,
  withRateLimitRetry,
} from "../lib/observability.js";
import {
  NO_BUDGET_FALLBACK_BOUND_MS,
  RATE_LIMIT_MIN_WAIT_MS,
  RateLimitBoundError,
  beginRequestBudget,
  computeWaitBoundMs,
  computeWaitMarginMs,
  isRateLimitBoundError,
  recordLlmSuccess,
  recordWaitedMs,
  runWithFallbackBudget,
  runWithoutRequestBudget,
  setRemainingWorkTokens,
} from "../lib/qc/request-budget.mjs";

function rateLimitError(message, headers = {}) {
  const err = new Error(message);
  err.status = 429;
  err.headers = headers;
  return err;
}

describe("B278 wait until a refused call fits", () => {
  test("the 2s delay cap is gone; attempt ceiling is a backstop only", () => {
    const observabilitySrc = readFileSync(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../lib/observability.js"),
      "utf8"
    );
    assert.equal(observabilitySrc.includes("RATE_LIMIT_MAX_DELAY_MS"), false);
    assert.equal(observabilitySrc.includes("RATE_LIMIT_MAX_ATTEMPTS"), true);
    assert.equal(observabilitySrc.includes("while (true)"), false);
  });

  test("a 429 with try-again-in-42ms is a rate limit whose delay is at least one second", () => {
    const err = rateLimitError(
      "Rate limit reached for gpt-4o. Limit 2000000, Used 2000000, Requested 1428. Please try again in 42ms."
    );
    assert.equal(isRateLimitError(err), true);
    assert.equal(parseRetryAfterMs(err), 42);
    const delay = rateLimitDelayMs(err, 1);
    assert.equal(delay >= RATE_LIMIT_MIN_WAIT_MS, true);
    assert.equal(delay > 42, true);
  });

  test("a 17k refused call waits for the TPM floor, not the server 77ms", () => {
    const err = rateLimitError(
      "Rate limit reached for gpt-4o. Limit 2000000, Used 2000000, Requested 17288. Please try again in 77ms."
    );
    const delay = rateLimitDelayMs(err, 1);
    assert.equal(delay >= RATE_LIMIT_MIN_WAIT_MS, true);
    assert.equal(delay > 77, true);
  });

  test("a 429 is retried then succeeds", async () => {
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
      { sleep }
    );
    assert.equal(out, "ok");
    assert.equal(hits, 3);
    assert.equal(sleeps.length, 2);
    assert.equal(sleeps[0] >= RATE_LIMIT_MIN_WAIT_MS, true);
  });

  test("when the wait exceeds the remaining bound, the error is RateLimitBoundError", async () => {
    let hits = 0;
    await beginRequestBudget({ startedAt: Date.now(), maxDurationMs: 400 }, async () => {
      recordLlmSuccess();
      await assert.rejects(
        () =>
          withRateLimitRetry(
            async () => {
              hits += 1;
              throw rateLimitError("Please try again in 42ms.");
            },
            { sleep: async () => {}, now: () => Date.now() }
          ),
        (err) => isRateLimitBoundError(err) && err instanceof RateLimitBoundError
      );
    });
    assert.equal(hits, 1);
  });

  test("the margin is the TPM floor of remaining work, not a guessed constant", () => {
    beginRequestBudget({ startedAt: Date.now(), maxDurationMs: 300_000, tpmLimit: 2_000_000 });
    setRemainingWorkTokens(2_000_000);
    const margin = computeWaitMarginMs();
    const bound = computeWaitBoundMs();
    assert.equal(margin, 60_000);
    assert.equal(bound <= 240_000, true);
  });
});

describe("B285 no-budget fallback and a bound that cannot re-base", () => {
  test("NO_BUDGET_FALLBACK_BOUND_MS is 6 seconds, matching the pre-B278 3x2s cap", () => {
    assert.equal(NO_BUDGET_FALLBACK_BOUND_MS, 6_000);
  });

  test("attempt ceiling is 1000, above a 1s retry filling a 300s review", () => {
    assert.equal(RATE_LIMIT_MAX_ATTEMPTS, 1000);
  });

  test("without a budget, the bound is the fallback and the log fires once", async () => {
    const lines = [];
    const orig = console.warn;
    console.warn = (...args) => {
      lines.push(args.map(String).join(" "));
    };
    try {
      await runWithFallbackBudget(async () => {
        const frozen = 1_700_000_000_000;
        const first = computeWaitBoundMs(frozen);
        const second = computeWaitBoundMs(frozen);
        assert.equal(first, NO_BUDGET_FALLBACK_BOUND_MS);
        assert.equal(second, NO_BUDGET_FALLBACK_BOUND_MS);
      }, 1_700_000_000_000);
      const fallbackLines = lines.filter((line) =>
        line.includes(
          `[REQUEST_BUDGET] no budget context; falling back to ${NO_BUDGET_FALLBACK_BOUND_MS}ms total wait`
        )
      );
      assert.equal(fallbackLines.length, 1);
    } finally {
      console.warn = orig;
    }
  });

  test("a second attempt cannot get a later deadline than the first", async () => {
    await runWithFallbackBudget(async () => {
      const frozen = 1_700_000_000_000;
      const first = computeWaitBoundMs(frozen);
      recordWaitedMs(2_000);
      const second = computeWaitBoundMs(frozen);
      assert.equal(first, NO_BUDGET_FALLBACK_BOUND_MS);
      assert.equal(second, NO_BUDGET_FALLBACK_BOUND_MS - 2_000);
      assert.equal(second < first, true);
    }, 1_700_000_000_000);
  });

  test("without a budget, a refused loop dies in a few attempts instead of hanging", async () => {
    await runWithoutRequestBudget(async () => {
      const frozen = 1_700_000_000_000;
      let hits = 0;
      await assert.rejects(
        () =>
          withRateLimitRetry(
            async () => {
              hits += 1;
              throw rateLimitError("Please try again in 42ms.");
            },
            { sleep: async () => {}, now: () => frozen }
          ),
        (err) => isReviewDidNotStartError(err)
      );
      assert.equal(hits <= 8, true);
      assert.equal(hits >= 2, true);
    });
  });
});
