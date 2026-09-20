/**
 * B291. A refusal we cannot explain is a missing input. Record the
 * provider's own status, code, type, message, and rate-limit headers
 * once per request.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";
import {
  describeProviderRefusal,
  withRateLimitRetry,
} from "../lib/observability.js";
import {
  beginRequestBudget,
  providerRefusalSnapshot,
} from "../lib/qc/request-budget.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function quotaError() {
  const err = new Error(
    "429 You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/."
  );
  err.status = 429;
  err.code = "credit_balance_exhausted";
  err.type = "insufficient_quota";
  err.headers = {
    "x-request-id": "req_test",
    "content-type": "application/json",
  };
  err.error = {
    message: "You have no credits remaining.",
    type: "insufficient_quota",
    param: null,
    code: "credit_balance_exhausted",
  };
  return err;
}

function tpmError() {
  const err = new Error(
    "Rate limit reached for gpt-4o. Limit 2000000, Used 2000000, Requested 1428. Please try again in 42ms."
  );
  err.status = 429;
  err.code = "rate_limit_exceeded";
  err.type = "tokens";
  err.headers = {
    "x-ratelimit-limit-tokens": "2000000",
    "x-ratelimit-remaining-tokens": "0",
    "retry-after-ms": "42",
  };
  return err;
}

describe("B291 record the provider refusal", () => {
  test("describeProviderRefusal quotes code, type, message, and names absent headers", () => {
    const info = describeProviderRefusal(quotaError());
    assert.equal(info.status, 429);
    assert.equal(info.code, "credit_balance_exhausted");
    assert.equal(info.type, "insufficient_quota");
    assert.equal(/no credits remaining/.test(info.message), true);
    assert.equal(info.headers["x-ratelimit-limit-tokens"], undefined);
    assert.equal(info.missingHeaders.includes("x-ratelimit-limit-tokens"), true);
    assert.equal(info.missingHeaders.includes("retry-after"), true);
  });

  test("a TPM 429 keeps the rate-limit headers", () => {
    const info = describeProviderRefusal(tpmError());
    assert.equal(info.headers["x-ratelimit-limit-tokens"], "2000000");
    assert.equal(info.headers["retry-after-ms"], "42");
    assert.equal(info.missingHeaders.includes("x-ratelimit-limit-tokens"), false);
  });

  test("the refusal is logged once per request, not once per attempt", async () => {
    const lines = [];
    const orig = console.warn;
    console.warn = (...args) => {
      lines.push(args.map(String).join(" "));
    };
    try {
      await beginRequestBudget({ startedAt: Date.now(), maxDurationMs: 300_000 }, async () => {
        let hits = 0;
        await withRateLimitRetry(
          async () => {
            hits += 1;
            if (hits < 3) throw tpmError();
            return "ok";
          },
          { sleep: async () => {} }
        );
      });
    } finally {
      console.warn = orig;
    }
    const refusalLines = lines.filter((line) => line.startsWith("[PROVIDER_REFUSAL]"));
    assert.equal(refusalLines.length, 1);
    assert.equal(/code=rate_limit_exceeded/.test(refusalLines[0]), true);
    assert.equal(/x-ratelimit-limit-tokens=2000000/.test(refusalLines[0]), true);
  });

  test("analyse-statements stamps providerRefusal on meta", () => {
    const src = readFileSync(path.join(ROOT, "api/analyse-statements.js"), "utf8");
    assert.equal(src.includes("providerRefusal: providerRefusalSnapshot()"), true);
    assert.equal(src.includes("error: REVIEW_DID_NOT_RUN"), true);
  });

  test("the snapshot is stored on the request budget", async () => {
    await beginRequestBudget({ startedAt: Date.now(), maxDurationMs: 300_000 }, async () => {
      await withRateLimitRetry(
        async () => {
          throw tpmError();
        },
        { sleep: async () => {} }
      ).catch(() => {});
      const snap = providerRefusalSnapshot();
      assert.equal(snap?.code, "rate_limit_exceeded");
      assert.equal(snap?.headers?.["retry-after-ms"], "42");
    });
  });
});
