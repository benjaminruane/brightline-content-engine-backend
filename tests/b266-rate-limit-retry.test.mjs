/**
 * B266 was the 4-attempt / 2s cap. B278 removed both. This file now asserts
 * the old constants are gone and the wait path is unbounded until the bound.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";
import {
  isRateLimitError,
  parseRetryAfterMs,
  withRateLimitRetry,
} from "../lib/observability.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = readFileSync(path.join(ROOT, "lib/observability.js"), "utf8");

function rateLimitError(message, headers = {}) {
  const err = new Error(message);
  err.status = 429;
  err.headers = headers;
  return err;
}

describe("B266 retry on 429 (superseded by B278)", () => {
  test("the old attempt and delay caps are gone", () => {
    assert.equal(SRC.includes("RATE_LIMIT_MAX_ATTEMPTS"), false);
    assert.equal(SRC.includes("RATE_LIMIT_MAX_DELAY_MS"), false);
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
