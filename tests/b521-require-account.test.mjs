import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, test, vi } from "vitest";
import healthHandler from "../api/health.js";
import {
  activityIsStale,
} from "../lib/db/accounts.mjs";
import { setSqlOverrideForTests } from "../lib/db/client.mjs";
import {
  getAccount,
  requireAccount,
  setSessionReaderForTests,
} from "../lib/auth/require-account.mjs";

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader() { return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; },
  };
}

describe("B521 require account", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    setSessionReaderForTests(null);
    setSqlOverrideForTests(null);
  });

  test("auth on and no token is 401 on every route except health and cron", async () => {
    vi.stubEnv("AUTH_MODE", "on");
    const res = mockRes();
    const account = await requireAccount({ method: "POST", headers: {} }, res);
    assert.equal(account, null);
    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { error: "sign_in_required" });

    const health = mockRes();
    await healthHandler({ method: "GET", headers: {} }, health);
    assert.equal(health.statusCode, 200);
    assert.equal(health.body.authMode, "on");

    const apiDir = path.resolve("api");
    const names = readdirSync(apiDir).filter((name) => name.endsWith(".js") && name !== "health.js");
    for (const name of names) {
      const mod = await import(`../api/${name.slice(0, -3)}.js`);
      const response = mockRes();
      await mod.default({ method: "POST", headers: {}, query: {}, body: {} }, response);
      assert.equal(response.statusCode, 401, name);
      assert.equal(response.body.error, "sign_in_required", name);
    }
  });

  test("a seen account is stored once and last active moves at most hourly", async () => {
    vi.stubEnv("AUTH_MODE", "on");
    const accounts = new Map();
    let inserts = 0;
    let touches = 0;
    setSqlOverrideForTests({
      async query(text, params) {
        const sql = text.replace(/\s+/g, " ").trim().toLowerCase();
        if (sql.startsWith("select id, email")) {
          const row = accounts.get(params[0]);
          return row ? [row] : [];
        }
        if (sql.startsWith("insert into accounts")) {
          inserts += 1;
          const row = {
            id: params[0],
            email: params[1],
            name: params[2],
            writing_for: null,
            created_at: new Date("2026-11-17T00:00:00.000Z"),
            last_active_at: new Date(),
          };
          accounts.set(row.id, row);
          return [row];
        }
        if (sql.startsWith("update accounts set last_active_at")) {
          touches += 1;
          const row = accounts.get(params[0]);
          row.last_active_at = new Date();
          return [row];
        }
        throw new Error(sql);
      },
    });
    setSessionReaderForTests(() => ({ accountId: "user_1", email: "ada@example.com", name: "Ada Lovelace" }));
    const first = await getAccount({ headers: { authorization: "Bearer ada" } });
    const second = await getAccount({ headers: { authorization: "Bearer ada" } });
    assert.equal(first.email, "ada@example.com");
    assert.equal(second.name, "Ada Lovelace");
    assert.equal(inserts, 1);
    assert.equal(touches, 0);
    assert.equal(activityIsStale(new Date(Date.now() - 10 * 60 * 1000).toISOString(), Date.now(), 60 * 60 * 1000), false);
    assert.equal(activityIsStale(new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), Date.now(), 60 * 60 * 1000), true);
  });

});
