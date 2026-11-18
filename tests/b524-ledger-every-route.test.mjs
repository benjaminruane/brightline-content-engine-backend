/**
 * B524. Every model-calling route writes one spend row for its own account.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "vitest";
import { getLlmSpend, recordLlmSpend, runWithLlmSpend } from "../lib/observability.js";
import { MODEL_ROUTES, endBillableRequest } from "../lib/spend/ledger.mjs";

describe("B524 every model route writes one row", () => {
  test("each model-calling route closes the ledger once", () => {
    assert.ok(MODEL_ROUTES.length >= 15);
    for (const route of MODEL_ROUTES) {
      const source = readFileSync(new URL(`../api/${route}.js`, import.meta.url), "utf8");
      assert.match(source, /beginBillableRequest\(res, account\)/);
      assert.match(source, /enterRequestSpend\(\)/);
      assert.match(source, new RegExp(`endBillableRequest\\(\\{ account, route: "${route}"`));
    }
  });

  test("one request writes one row for its account and route", async () => {
    const rows = [];
    const sql = {
      async query(text, params) {
        rows.push({ text, params });
        return [];
      },
    };
    await runWithLlmSpend(async () => {
      recordLlmSpend("openai", "gpt-4o-2024-08-06", { inputTokens: 1_000_000, outputTokens: 0 });
      await endBillableRequest({
        sql,
        account: { accountId: "acc_ada" },
        route: "generate",
        req: { body: { reviewId: "review_ada" } },
        authOn: true,
      });
      assert.equal(rows.length, 1);
      assert.equal(rows[0].params[0], "acc_ada");
      assert.equal(rows[0].params[1], "generate");
      assert.equal(rows[0].params[2], "review_ada");
      assert.equal(Number(rows[0].params[3]), getLlmSpend().costUsd);
    });
  });
});
