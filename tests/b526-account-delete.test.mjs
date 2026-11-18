/**
 * B526. Delete my account removes that account's rows in one step.
 * Spend rows stay, with a null account. Admins are refused.
 * A database failure leaves every row and does not call Clerk.
 */
import assert from "node:assert/strict";
import { afterEach, describe, test } from "vitest";
import { setSqlOverrideForTests } from "../lib/db/client.mjs";
import { setSessionReaderForTests } from "../lib/auth/require-account.mjs";
import handler, { setClerkUserDeleterForTests } from "../api/account-delete.js";

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

function seed() {
  return {
    fail: false,
    accounts: [
      { id: "user_b", email: "b@example.com", name: "Bea", writing_for: null, monthly_allowance_usd: null, created_at: "2026-11-01T00:00:00.000Z", last_active_at: new Date().toISOString() },
      { id: "user_a", email: "admin@example.com", name: "Ada", writing_for: null, monthly_allowance_usd: null, created_at: "2026-11-01T00:00:00.000Z", last_active_at: new Date().toISOString() },
      { id: "user_c", email: "c@example.com", name: "Cleo", writing_for: null, monthly_allowance_usd: null, created_at: "2026-11-01T00:00:00.000Z", last_active_at: new Date().toISOString() },
    ],
    review_state: [
      { review_id: "rev_b", account_id: "user_b", state: {} },
      { review_id: "rev_c", account_id: "user_c", state: {} },
    ],
    reviewer_decisions: [
      { id: 1, review_id: "rev_b" },
      { id: 2, review_id: "rev_c" },
    ],
    feedback: [
      { id: 1, account_id: "user_b", comment: "hello" },
      { id: 2, account_id: "user_c", comment: "other" },
    ],
    spend_events: [
      { id: 1, account_id: "user_b", cost_usd: 1 },
      { id: 2, account_id: "user_c", cost_usd: 2 },
    ],
  };
}

function memorySql(store) {
  return {
    async query(text, params) {
      const sql = text.replace(/\s+/g, " ").trim().toLowerCase();
      if (sql.startsWith("select id, email")) {
        return store.accounts.filter((row) => row.id === params[0]);
      }
      if (sql.startsWith("update accounts set last_active_at")) {
        return store.accounts.filter((row) => row.id === params[0]);
      }
      if (sql.includes("delete from accounts")) {
        if (store.fail) throw new Error("database failed");
        const id = params[0];
        const reviewIds = new Set(store.review_state.filter((row) => row.account_id === id).map((row) => row.review_id));
        store.reviewer_decisions = store.reviewer_decisions.filter((row) => !reviewIds.has(row.review_id));
        store.review_state = store.review_state.filter((row) => row.account_id !== id);
        store.feedback = store.feedback.filter((row) => row.account_id !== id);
        for (const row of store.spend_events) {
          if (row.account_id === id) row.account_id = null;
        }
        store.accounts = store.accounts.filter((row) => row.id !== id);
        return [{ id }];
      }
      throw new Error(sql);
    },
  };
}

describe("B526 delete my account", () => {
  const previousAuth = process.env.AUTH_MODE;
  const previousAdmins = process.env.ADMIN_EMAILS;

  afterEach(() => {
    setSqlOverrideForTests(null);
    setSessionReaderForTests(null);
    setClerkUserDeleterForTests(null);
    if (previousAuth == null) delete process.env.AUTH_MODE;
    else process.env.AUTH_MODE = previousAuth;
    if (previousAdmins == null) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = previousAdmins;
  });

  test("deletes that account only, nulls spend, then deletes the Clerk user", async () => {
    process.env.AUTH_MODE = "on";
    process.env.ADMIN_EMAILS = "admin@example.com";
    const store = seed();
    setSqlOverrideForTests(memorySql(store));
    const deleted = [];
    setClerkUserDeleterForTests(async (userId) => { deleted.push(userId); });
    setSessionReaderForTests(() => ({ accountId: "user_b", email: "b@example.com", name: "Bea" }));
    const res = mockRes();
    await handler({ method: "POST", headers: { authorization: "Bearer t" }, body: {} }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    assert.deepEqual(deleted, ["user_b"]);
    assert.equal(store.review_state.some((row) => row.account_id === "user_b"), false);
    assert.equal(store.reviewer_decisions.some((row) => row.review_id === "rev_b"), false);
    assert.equal(store.feedback.some((row) => row.account_id === "user_b"), false);
    assert.equal(store.accounts.some((row) => row.id === "user_b"), false);
    assert.equal(store.spend_events.find((row) => row.id === 1).account_id, null);
    assert.equal(store.review_state.find((row) => row.review_id === "rev_c").account_id, "user_c");
    assert.equal(store.reviewer_decisions.some((row) => row.review_id === "rev_c"), true);
    assert.equal(store.feedback.find((row) => row.id === 2).account_id, "user_c");
    assert.equal(store.accounts.some((row) => row.id === "user_c"), true);
    assert.equal(store.spend_events.find((row) => row.id === 2).account_id, "user_c");
  });

  test("an admin is refused and nothing is deleted", async () => {
    process.env.AUTH_MODE = "on";
    process.env.ADMIN_EMAILS = "admin@example.com";
    const store = seed();
    setSqlOverrideForTests(memorySql(store));
    const deleted = [];
    setClerkUserDeleterForTests(async (userId) => { deleted.push(userId); });
    setSessionReaderForTests(() => ({ accountId: "user_a", email: "admin@example.com", name: "Ada" }));
    const res = mockRes();
    await handler({ method: "POST", headers: { authorization: "Bearer t" }, body: {} }, res);
    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { error: "admin_cannot_delete" });
    assert.deepEqual(deleted, []);
    assert.equal(store.accounts.length, 3);
  });

  test("a database failure leaves every row and does not call Clerk", async () => {
    process.env.AUTH_MODE = "on";
    process.env.ADMIN_EMAILS = "admin@example.com";
    const store = seed();
    store.fail = true;
    setSqlOverrideForTests(memorySql(store));
    const deleted = [];
    setClerkUserDeleterForTests(async (userId) => { deleted.push(userId); });
    setSessionReaderForTests(() => ({ accountId: "user_b", email: "b@example.com", name: "Bea" }));
    const res = mockRes();
    await handler({ method: "POST", headers: { authorization: "Bearer t" }, body: {} }, res);
    assert.equal(res.statusCode, 500);
    assert.deepEqual(deleted, []);
    assert.equal(store.accounts.length, 3);
    assert.equal(store.review_state.length, 2);
    assert.equal(store.feedback.length, 2);
    assert.equal(store.spend_events[0].account_id, "user_b");
  });

  test("a Clerk failure after the database commit still returns success", async () => {
    process.env.AUTH_MODE = "on";
    process.env.ADMIN_EMAILS = "admin@example.com";
    const store = seed();
    setSqlOverrideForTests(memorySql(store));
    setClerkUserDeleterForTests(async () => { throw new Error("clerk down"); });
    setSessionReaderForTests(() => ({ accountId: "user_b", email: "b@example.com", name: "Bea" }));
    const res = mockRes();
    await handler({ method: "POST", headers: { authorization: "Bearer t" }, body: {} }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    assert.equal(store.accounts.some((row) => row.id === "user_b"), false);
  });
});
