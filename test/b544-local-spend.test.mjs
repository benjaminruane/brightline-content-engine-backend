import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "vitest";
import { recordLlmSpend, runWithLlmSpend } from "../lib/observability.js";
import {
  LOCAL_DEVELOPMENT_ACCOUNT_ID,
  beginBillableRequest,
  endBillableRequest,
} from "../lib/spend/ledger.mjs";

describe("B544 local spend", () => {
  test("sign-in off writes the local development account and does not charge an allowance", async () => {
    assert.equal(LOCAL_DEVELOPMENT_ACCOUNT_ID, "local-development");
    const rows = [];
    const sql = {
      async query(text, params) {
        rows.push({ text, params });
        return [];
      },
    };
    await runWithLlmSpend(async () => {
      recordLlmSpend("openai", "gpt-4o-2024-08-06", { inputTokens: 1000, outputTokens: 10 });
      await endBillableRequest({
        sql,
        account: { accountId: null },
        route: "generate",
        authOn: false,
      });
    });
    assert.equal(rows.length, 2);
    assert.match(rows[0].text, /insert into accounts/i);
    assert.equal(rows[0].params[0], "local-development");
    assert.equal(rows[0].params[2], "Local development");
    assert.match(rows[1].text, /insert into spend_events/i);
    assert.equal(rows[1].params[0], "local-development");
    assert.equal(rows[1].params[1], "generate");
    const outside = [];
    await endBillableRequest({
      sql: {
        async query(text, params) {
          outside.push({ text, params });
          return [];
        },
      },
      account: { accountId: null },
      route: "analyse-statements",
      authOn: false,
      spend: { calls: 2, costUsd: 0.25, byModel: { "openai/gpt-4o-2024-08-06": { calls: 2 } } },
    });
    assert.equal(outside.length, 2);
    assert.equal(outside[1].params[0], "local-development");
    assert.equal(outside[1].params[1], "analyse-statements");
    assert.equal(Number(outside[1].params[3]), 0.25);
    const allowed = await beginBillableRequest(
      { status() { return this; }, json() { throw new Error("allowance was checked"); } },
      { accountId: LOCAL_DEVELOPMENT_ACCOUNT_ID }
    );
    assert.equal(allowed, true);
  });

  test("Generate and the proposals step return their cost", () => {
    const generate = readFileSync(new URL("../api/generate.js", import.meta.url), "utf8");
    const proposals = readFileSync(new URL("../api/revise-actions.js", import.meta.url), "utf8");
    assert.match(generate, /llmSpend: getLlmSpend\(\)/);
    assert.match(generate, /spend: getLlmSpend\(\)/);
    assert.match(proposals, /llmSpend: getLlmSpend\(\)/);
    assert.match(proposals, /spend: getLlmSpend\(\)/);
  });
});
