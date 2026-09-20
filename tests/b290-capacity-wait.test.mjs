/**
 * B290. Capacity wait is counted on meta. The 6s fallback cannot leak
 * onto a later invocation.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";
import { withRateLimitRetry } from "../lib/observability.js";
import {
  NO_BUDGET_FALLBACK_BOUND_MS,
  beginRequestBudget,
  capacityWaitSnapshot,
  computeWaitBoundMs,
  getRequestBudget,
  recordWaitedMs,
  runWithFallbackBudget,
  runWithoutRequestBudget,
  waitUntilTokensFit,
} from "../lib/qc/request-budget.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function rateLimitError(message) {
  const err = new Error(message);
  err.status = 429;
  err.headers = {};
  return err;
}

describe("B290 capacity wait on meta", () => {
  test("analyse-statements stamps capacityWait beside rateLimitBoundHits", () => {
    const src = readFileSync(path.join(ROOT, "api/analyse-statements.js"), "utf8");
    assert.equal(src.includes("capacityWait: capacityWaitSnapshot()"), true);
    const successAt = src.indexOf("rateLimitBoundHits,");
    const capacityAt = src.indexOf("capacityWait: capacityWaitSnapshot()", successAt);
    assert.equal(capacityAt > successAt, true);
  });

  test("a prelaunch hold increments prelaunchCount and waitMs", async () => {
    const frozen = 1_700_000_000_000;
    await beginRequestBudget(
      { startedAt: frozen, maxDurationMs: 300_000, tpmLimit: 2_000_000 },
      async () => {
        const store = getRequestBudget();
        store.remainingTokens = 10;
        const sleeps = [];
        await waitUntilTokensFit(1_000, {
          sleep: async (ms) => {
            sleeps.push(ms);
          },
          now: () => frozen,
        });
        const snap = capacityWaitSnapshot();
        assert.equal(sleeps.length, 1);
        assert.equal(snap.prelaunchCount, 1);
        assert.equal(snap.waitMs, sleeps[0]);
        assert.equal(snap.waitMs >= 1_000, true);
      }
    );
  });

  test("a 429 retry wait is counted on waitMs and is not a prelaunch", async () => {
    const frozen = 1_700_000_000_000;
    await beginRequestBudget({ startedAt: frozen, maxDurationMs: 300_000 }, async () => {
      let hits = 0;
      const sleeps = [];
      await withRateLimitRetry(
        async () => {
          hits += 1;
          if (hits < 2) throw rateLimitError("Please try again in 42ms.");
          return "ok";
        },
        {
          sleep: async (ms) => {
            sleeps.push(ms);
          },
          now: () => frozen,
        }
      );
      const snap = capacityWaitSnapshot();
      assert.equal(sleeps.length, 1);
      assert.equal(snap.prelaunchCount, 0);
      assert.equal(snap.waitMs, sleeps[0]);
      assert.equal(snap.waitMs >= 1_000, true);
    });
  });
});

describe("B290 fallback store cannot leak between invocations", () => {
  test("requireStore does not enterWith", () => {
    const src = readFileSync(path.join(ROOT, "lib/qc/request-budget.mjs"), "utf8");
    const start = src.indexOf("function requireStore");
    const end = src.indexOf("export function runWithFallbackBudget");
    assert.equal(start >= 0, true);
    assert.equal(end > start, true);
    const block = src.slice(start, end);
    assert.equal(block.includes("enterWith"), false);
    assert.equal(src.includes("export function runWithFallbackBudget"), true);
  });

  test("a throwaway fallback does not remain on the current execution", () => {
    const prior = getRequestBudget();
    computeWaitBoundMs(1_700_000_000_000);
    assert.equal(getRequestBudget(), prior);
  });

  test("without a shared store the bound cannot rebase across calls", async () => {
    await runWithoutRequestBudget(async () => {
      const frozen = 1_700_000_000_000;
      const first = computeWaitBoundMs(frozen);
      recordWaitedMs(2_000);
      const second = computeWaitBoundMs(frozen);
      assert.equal(first, NO_BUDGET_FALLBACK_BOUND_MS);
      assert.equal(second, NO_BUDGET_FALLBACK_BOUND_MS);
      assert.equal(getRequestBudget(), null);
    });
  });

  test("runWithFallbackBudget restores the outer store when the call ends", async () => {
    const frozen = 1_700_000_000_000;
    await runWithFallbackBudget(() => {
      recordWaitedMs(2_000);
      assert.equal(getRequestBudget()?.noBudgetFallback, true);
      assert.equal(computeWaitBoundMs(frozen), NO_BUDGET_FALLBACK_BOUND_MS - 2_000);
    }, frozen);
    const after = getRequestBudget();
    assert.equal(after?.noBudgetFallback === true, false);
  });

  test("a later 300s review does not inherit a 6s fallback from a previous call", async () => {
    const frozen = 1_700_000_000_000;
    await runWithoutRequestBudget(async () => {
      await withRateLimitRetry(async () => "ok", { sleep: async () => {}, now: () => frozen });
    });
    await beginRequestBudget({ startedAt: frozen, maxDurationMs: 300_000 }, async () => {
      const store = getRequestBudget();
      assert.equal(store.noBudgetFallback, false);
      assert.equal(store.maxDurationMs, 300_000);
      assert.equal(computeWaitBoundMs(frozen), 300_000);
    });
  });

  test("withRateLimitRetry scopes a no-budget call inside runWithFallbackBudget", () => {
    const src = readFileSync(path.join(ROOT, "lib/observability.js"), "utf8");
    assert.equal(src.includes("if (!getRequestBudget())"), true);
    assert.equal(src.includes("return runWithFallbackBudget(() => withRateLimitRetry(fn, { sleep, now }), at);"), true);
  });
});
