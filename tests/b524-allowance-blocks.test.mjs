/**
 * B524. At the limit the route returns 429 and does not call a model.
 * Admins are not blocked. An account override beats the env default.
 */
import assert from "node:assert/strict";
import { afterEach, describe, test, vi } from "vitest";
import { setSqlOverrideForTests } from "../lib/db/client.mjs";
import { setSessionReaderForTests } from "../lib/auth/require-account.mjs";
import { beginBillableRequest } from "../lib/spend/ledger.mjs";
import handler from "../api/summarize-rewrite-label.js";

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

function sqlWith({ spent, allowance }) {
  return {
    async query(text, params) {
      const sql = text.replace(/\s+/g, " ").trim().toLowerCase();
      if (sql.startsWith("select id, email")) {
        return [{
          id: params[0],
          email: params[0] === "acc_admin" ? "admin@example.com" : "writer@example.com",
          name: "Ada",
          writing_for: null,
          monthly_allowance_usd: allowance,
          created_at: "2026-11-18T00:00:00.000Z",
          last_active_at: "2026-11-18T00:00:00.000Z",
        }];
      }
      if (sql.includes("from spend_events")) return [{ spent }];
      if (sql.startsWith("insert into accounts")) return [{ id: params[0], email: "writer@example.com", name: "Ada" }];
      if (sql.startsWith("update accounts set last_active_at")) {
        return [{ id: params[0], email: "writer@example.com", monthly_allowance_usd: allowance }];
      }
      if (sql.startsWith("insert into spend_events")) return [];
      throw new Error(sql);
    },
  };
}

describe("B524 allowance blocks the model", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    setSqlOverrideForTests(null);
    setSessionReaderForTests(null);
  });

  test("spent at the allowance returns 429 and the model is not called", async () => {
    vi.stubEnv("AUTH_MODE", "on");
    vi.stubEnv("ALLOWANCE_USD_PER_MONTH", "50");
    setSqlOverrideForTests(sqlWith({ spent: 50, allowance: null }));
    let called = false;
    const res = mockRes();
    const allowed = await beginBillableRequest(res, {
      accountId: "acc_writer",
      email: "writer@example.com",
    }, {
      callModel() { called = true; },
    });
    assert.equal(allowed, false);
    assert.equal(called, false);
    assert.equal(res.statusCode, 429);
    assert.equal(res.body.error, "allowance_reached");
    assert.match(res.body.resetsOn, /^\d{4}-\d{2}-01$/);
  });

  test("an admin is not blocked and an account override beats the env default", async () => {
    vi.stubEnv("AUTH_MODE", "on");
    vi.stubEnv("ADMIN_EMAILS", "admin@example.com");
    vi.stubEnv("ALLOWANCE_USD_PER_MONTH", "50");
    setSqlOverrideForTests(sqlWith({ spent: 80, allowance: null }));
    const admin = mockRes();
    const adminAllowed = await beginBillableRequest(admin, {
      accountId: "acc_admin",
      email: "admin@example.com",
    });
    assert.equal(adminAllowed, true);
    assert.equal(admin.statusCode, 200);

    setSqlOverrideForTests(sqlWith({ spent: 12, allowance: 10 }));
    const writer = mockRes();
    const writerAllowed = await beginBillableRequest(writer, {
      accountId: "acc_writer",
      email: "writer@example.com",
    });
    assert.equal(writerAllowed, false);
    assert.equal(writer.statusCode, 429);
  });

  test("the rewrite-label route returns 429 before the model", async () => {
    vi.stubEnv("AUTH_MODE", "on");
    vi.stubEnv("ALLOWANCE_USD_PER_MONTH", "50");
    setSqlOverrideForTests(sqlWith({ spent: 50, allowance: null }));
    setSessionReaderForTests(() => ({
      accountId: "acc_writer",
      email: "writer@example.com",
      name: "Ada",
    }));
    const observability = await import("../lib/observability.js");
    const spy = vi.spyOn(observability, "callLLM").mockResolvedValue({ text: "should not run", usage: {} });
    const res = mockRes();
    await handler({
      method: "POST",
      headers: { authorization: "Bearer writer" },
      body: { instruction: "Make it shorter" },
    }, res);
    assert.equal(res.statusCode, 429);
    assert.equal(res.body.error, "allowance_reached");
    assert.equal(spy.mock.calls.length, 0);
  });
});
