import assert from "node:assert/strict";
import { afterEach, describe, test, vi } from "vitest";
import handler from "../api/account-claim.js";
import { setSqlOverrideForTests } from "../lib/db/client.mjs";
import { setSessionReaderForTests } from "../lib/auth/require-account.mjs";

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    setHeader() { return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; },
  };
}

describe("B521 claim", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    setSessionReaderForTests(null);
    setSqlOverrideForTests(null);
  });

  test("claim moves only unowned rows for that key, and a second call moves nothing", async () => {
    vi.stubEnv("AUTH_MODE", "on");
    const reviews = [
      { review_id: "review_old1", owner_key: "owner_key_old", account_id: null },
      { review_id: "review_old2", owner_key: "owner_key_old", account_id: null },
      { review_id: "review_else", owner_key: "owner_key_zzz", account_id: null },
      { review_id: "review_held", owner_key: "owner_key_old", account_id: "acc_other" },
    ];
    const decisions = [
      { id: 1, owner_key: "owner_key_old", account_id: null },
      { id: 2, owner_key: "owner_key_zzz", account_id: null },
    ];
    const accounts = new Map();
    setSqlOverrideForTests({
      async query(text, params) {
        const sql = text.replace(/\s+/g, " ").trim().toLowerCase();
        if (sql.startsWith("select id, email")) {
          const row = accounts.get(params[0]);
          return row ? [row] : [];
        }
        if (sql.startsWith("insert into accounts")) {
          const row = { id: params[0], email: params[1], name: params[2], writing_for: null, last_active_at: new Date() };
          accounts.set(row.id, row);
          return [row];
        }
        if (sql.startsWith("update accounts")) return [accounts.get(params[0])];
        if (sql.startsWith("update review_state")) {
          const moved = [];
          for (const row of reviews) {
            if (row.owner_key === params[1] && row.account_id == null) {
              row.account_id = params[0];
              moved.push({ review_id: row.review_id });
            }
          }
          return moved;
        }
        if (sql.startsWith("update reviewer_decisions")) {
          const moved = [];
          for (const row of decisions) {
            if (row.owner_key === params[1] && row.account_id == null) {
              row.account_id = params[0];
              moved.push({ id: row.id });
            }
          }
          return moved;
        }
        throw new Error(sql);
      },
    });
    setSessionReaderForTests(() => ({ accountId: "acc_a", email: "a@example.com", name: "Ada" }));
    const first = mockRes();
    await handler({
      method: "POST",
      headers: { authorization: "Bearer ada" },
      body: { ownerKey: "owner_key_old" },
    }, first);
    assert.equal(first.statusCode, 200);
    assert.deepEqual(first.body, { reviewState: 2, reviewerDecisions: 1 });
    assert.equal(reviews.find((row) => row.review_id === "review_else").account_id, null);
    assert.equal(reviews.find((row) => row.review_id === "review_held").account_id, "acc_other");

    const second = mockRes();
    await handler({
      method: "POST",
      headers: { authorization: "Bearer ada" },
      body: { ownerKey: "owner_key_old" },
    }, second);
    assert.deepEqual(second.body, { reviewState: 0, reviewerDecisions: 0 });
  });
});
