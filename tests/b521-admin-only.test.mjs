import assert from "node:assert/strict";
import { afterEach, describe, test, vi } from "vitest";
import handler from "../api/admin-accounts.js";
import accountHandler from "../api/account.js";
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

function storeFor(email) {
  const accounts = new Map();
  return {
    async query(text, params) {
      const sql = text.replace(/\s+/g, " ").trim().toLowerCase();
      if (sql.startsWith("select id, email")) {
        const row = accounts.get(params[0]);
        return row ? [row] : [];
      }
      if (sql.startsWith("insert into accounts")) {
        const row = {
          id: params[0],
          email: params[1],
          name: params[2],
          writing_for: null,
          created_at: "2026-11-17T00:00:00.000Z",
          last_active_at: "2026-11-17T01:00:00.000Z",
        };
        accounts.set(row.id, row);
        return [row];
      }
      if (sql.startsWith("update accounts set last_active_at")) return [accounts.get(params[0])];
      if (sql.startsWith("update accounts set writing_for")) {
        const row = accounts.get(params[0]);
        row.writing_for = params[1];
        return [row];
      }
      if (sql.includes("from accounts a")) {
        return [...accounts.values()].map((row) => ({ ...row, text_count: 2, spent_this_month: 0 }));
      }
      if (sql.includes("from spend_events")) return [{ spent: 0 }];
      throw new Error(sql);
    },
  };
}

describe("B521 admin only", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    setSessionReaderForTests(null);
    setSqlOverrideForTests(null);
  });

  test("a non-admin gets 404 and an admin gets the people list", async () => {
    vi.stubEnv("AUTH_MODE", "on");
    vi.stubEnv("ADMIN_EMAILS", "Admin@Example.com");
    setSqlOverrideForTests(storeFor());
    setSessionReaderForTests((token) => (
      token === "admin"
        ? { accountId: "acc_admin", email: "admin@example.com", name: "Ada Admin" }
        : { accountId: "acc_user", email: "writer@example.com", name: "Bea Writer" }
    ));

    const denied = mockRes();
    await handler({ method: "GET", headers: { authorization: "Bearer writer" } }, denied);
    assert.equal(denied.statusCode, 404);
    assert.equal(denied.body.error, "not_found");

    const allowed = mockRes();
    await handler({ method: "GET", headers: { authorization: "Bearer admin" } }, allowed);
    assert.equal(allowed.statusCode, 200);
    const adminRow = allowed.body.accounts.find((row) => row.email === "admin@example.com");
    assert.ok(adminRow);
    assert.equal(adminRow.textCount, 2);

    const account = mockRes();
    await accountHandler({
      method: "PUT",
      headers: { authorization: "Bearer writer" },
      body: { writingFor: "  Northwind Capital  " },
    }, account);
    assert.equal(account.statusCode, 200);
    assert.equal(account.body.writingFor, "Northwind Capital");
    assert.equal(account.body.isAdmin, false);
  });
});
