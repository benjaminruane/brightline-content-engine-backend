/**
 * B569. A new account records the environment that created it.
 * A later visit does not change that, and old rows are not backfilled.
 * No model call.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { accountEnvironment, rememberSeenAccount } from "../lib/db/accounts.mjs";

function memorySql() {
  const rows = new Map();
  const queries = [];
  return {
    queries,
    async query(text, params) {
      queries.push(String(text));
      if (String(text).startsWith("select")) {
        const row = rows.get(params[0]);
        return row ? [row] : [];
      }
      if (String(text).includes("insert into accounts")) {
        const row = {
          id: params[0],
          email: params[1],
          name: params[2],
          created_environment: params[3] || null,
          last_active_at: new Date(0).toISOString(),
        };
        rows.set(row.id, row);
        return [row];
      }
      if (String(text).includes("update accounts")) {
        const row = rows.get(params[0]);
        if (row) row.last_active_at = new Date().toISOString();
        return row ? [row] : [];
      }
      return [];
    },
  };
}

test("preview and production are recorded, and anything else is not", () => {
  assert.equal(accountEnvironment("preview"), "preview");
  assert.equal(accountEnvironment("production"), "production");
  assert.equal(accountEnvironment("development"), null);
  assert.equal(accountEnvironment(""), null);
});

test("the creating environment is stored once and is not filled in later", async () => {
  const sql = memorySql();
  const created = await rememberSeenAccount(sql, {
    id: "user_preview",
    email: "ada@example.com",
    name: "Ada",
    now: Date.now(),
    hourMs: 60 * 60 * 1000,
    createdEnvironment: "preview",
  });
  assert.equal(created.created_environment, "preview");
  const insert = sql.queries.find((text) => text.includes("insert into accounts"));
  assert.match(insert, /created_environment/);
  await rememberSeenAccount(sql, {
    id: "user_preview",
    email: "ada@example.com",
    name: "Ada",
    now: Date.now() + 2 * 60 * 60 * 1000,
    hourMs: 60 * 60 * 1000,
    createdEnvironment: "production",
  });
  const updates = sql.queries.filter((text) => text.includes("update accounts"));
  assert.equal(updates.length, 1);
  assert.match(updates[0], /set last_active_at/);
  assert.equal(/set created_environment/i.test(updates[0]), false);
  assert.equal(sql.queries.filter((text) => text.includes("insert into accounts")).length, 1);
});
