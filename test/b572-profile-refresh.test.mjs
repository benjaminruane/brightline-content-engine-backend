/**
 * B572. A signed-in request refreshes the account name and email from Clerk
 * when the last refresh was more than a day ago, or never. One call a day.
 * A failure is logged and the request still returns the stored account.
 * No model call.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, test, vi } from "vitest";
import { profileRefreshDue, PROFILE_REFRESH_MS, resetMissingAccountColumnsForTests } from "../lib/db/accounts.mjs";
import { setSqlOverrideForTests } from "../lib/db/client.mjs";
import { getAccount, setClerkProfileReaderForTests, setSessionReaderForTests } from "../lib/auth/require-account.mjs";

const DAY = PROFILE_REFRESH_MS;
const HOUR = 60 * 60 * 1000;

function accountSql(seed) {
  const rows = new Map(Object.entries(seed));
  const queries = [];
  return {
    queries,
    rows,
    async query(text, params = []) {
      const sql = String(text).replace(/\s+/g, " ").trim();
      queries.push(sql);
      if (sql.startsWith("select")) {
        const row = rows.get(params[0]);
        return row ? [row] : [];
      }
      if (sql.startsWith("update accounts set profile_refreshed_at")) {
        const row = rows.get(params[0]);
        if (!row) return [];
        const at = row.profile_refreshed_at ? new Date(row.profile_refreshed_at).getTime() : null;
        if (at != null && Date.now() - at <= DAY) return [];
        row.profile_refreshed_at = new Date().toISOString();
        return [{ id: row.id }];
      }
      if (sql.startsWith("update accounts set email")) {
        const row = rows.get(params[0]);
        if (!row) return [];
        if (params[1] != null) row.email = params[1];
        if (params[2] != null) row.name = params[2];
        return [{ id: row.id, email: row.email, name: row.name }];
      }
      if (sql.startsWith("update accounts set last_active_at")) {
        const row = rows.get(params[0]);
        if (row) row.last_active_at = new Date().toISOString();
        return row ? [row] : [];
      }
      throw new Error(sql);
    },
  };
}

function signIn(accountId) {
  setSessionReaderForTests(() => ({ accountId }));
}

afterEach(() => {
  setSessionReaderForTests(null);
  setClerkProfileReaderForTests(null);
  setSqlOverrideForTests(null);
  resetMissingAccountColumnsForTests();
  vi.restoreAllMocks();
});

test("a refresh is due only when the column was read and the last read is more than a day old", () => {
  const now = Date.now();
  assert.equal(profileRefreshDue(undefined, now, DAY), false);
  assert.equal(profileRefreshDue(null, now, DAY), true);
  assert.equal(profileRefreshDue("", now, DAY), true);
  assert.equal(profileRefreshDue("not-a-date", now, DAY), true);
  assert.equal(profileRefreshDue(new Date(now - 23 * HOUR).toISOString(), now, DAY), false);
  assert.equal(profileRefreshDue(new Date(now - DAY).toISOString(), now, DAY), false);
  assert.equal(profileRefreshDue(new Date(now - DAY - 1000).toISOString(), now, DAY), true);
});

test("a blank name is filled from Clerk, once a day, and a blank Clerk value does not wipe a stored one", async () => {
  const sql = accountSql({
    user_blank: {
      id: "user_blank",
      email: "old@example.com",
      name: "",
      last_active_at: new Date().toISOString(),
      profile_refreshed_at: null,
    },
    user_named: {
      id: "user_named",
      email: "ada@example.com",
      name: "Ada",
      last_active_at: new Date().toISOString(),
      profile_refreshed_at: null,
    },
  });
  setSqlOverrideForTests(sql);
  let calls = 0;
  setClerkProfileReaderForTests(async (id) => {
    calls += 1;
    if (id === "user_blank") return { email: "new@example.com", name: "Ada Lovelace" };
    return { email: "  ", name: "" };
  });

  signIn("user_blank");
  const filled = await getAccount({ headers: { authorization: "Bearer blank" } });
  assert.equal(filled.name, "Ada Lovelace");
  assert.equal(filled.email, "new@example.com");
  const again = await getAccount({ headers: { authorization: "Bearer blank" } });
  assert.equal(again.name, "Ada Lovelace");
  assert.equal(calls, 1);

  signIn("user_named");
  const kept = await getAccount({ headers: { authorization: "Bearer named" } });
  assert.equal(kept.name, "Ada");
  assert.equal(kept.email, "ada@example.com");
  assert.equal(calls, 2);
  const claim = sql.queries.find((text) => text.startsWith("update accounts set profile_refreshed_at"));
  assert.match(claim, /profile_refreshed_at is null or profile_refreshed_at < now\(\) - interval '24 hours'/);
});

test("a Clerk failure is logged, the request still returns the account, and the day is not retried", async () => {
  const sql = accountSql({
    user_1: {
      id: "user_1",
      email: "ada@example.com",
      name: "Ada",
      last_active_at: new Date().toISOString(),
      profile_refreshed_at: null,
    },
  });
  setSqlOverrideForTests(sql);
  signIn("user_1");
  let calls = 0;
  setClerkProfileReaderForTests(async () => {
    calls += 1;
    throw new Error("clerk down");
  });
  const errors = [];
  vi.spyOn(console, "error").mockImplementation((...args) => {
    errors.push(args.map(String).join(" "));
  });
  const first = await getAccount({ headers: { authorization: "Bearer ada" } });
  assert.equal(first.name, "Ada");
  assert.equal(first.email, "ada@example.com");
  const second = await getAccount({ headers: { authorization: "Bearer ada" } });
  assert.equal(second.name, "Ada");
  assert.equal(calls, 1);
  assert.equal(errors.some((line) => line.includes("[auth] profile refresh failed") && line.includes("clerk down")), true);
});

test("a refresh less than a day old does not call Clerk", async () => {
  const sql = accountSql({
    user_1: {
      id: "user_1",
      email: "ada@example.com",
      name: "Ada",
      last_active_at: new Date().toISOString(),
      profile_refreshed_at: new Date(Date.now() - 2 * HOUR).toISOString(),
    },
  });
  setSqlOverrideForTests(sql);
  signIn("user_1");
  let calls = 0;
  setClerkProfileReaderForTests(async () => {
    calls += 1;
    return { email: "other@example.com", name: "Other" };
  });
  const account = await getAccount({ headers: { authorization: "Bearer ada" } });
  assert.equal(account.name, "Ada");
  assert.equal(calls, 0);
  assert.equal(sql.queries.some((text) => text.startsWith("update accounts set profile_refreshed_at")), false);
});

test("a missing refresh column does not block the request and does not call Clerk", async () => {
  const row = {
    id: "user_1",
    email: "ada@example.com",
    name: "Ada",
    last_active_at: new Date().toISOString(),
  };
  setSqlOverrideForTests({
    async query(text, params = []) {
      if (String(text).includes("profile_refreshed_at")) {
        const err = new Error('column "profile_refreshed_at" of relation "accounts" does not exist');
        err.code = "42703";
        throw err;
      }
      if (String(text).trim().startsWith("select")) return params[0] === "user_1" ? [row] : [];
      if (String(text).includes("last_active_at")) return [row];
      throw new Error(text);
    },
  });
  signIn("user_1");
  let calls = 0;
  setClerkProfileReaderForTests(async () => {
    calls += 1;
    return { email: "new@example.com", name: "New" };
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
  const account = await getAccount({ headers: { authorization: "Bearer ada" } });
  assert.equal(account.name, "Ada");
  assert.equal(calls, 0);
});

test("preview and production share the Clerk read. The process secret is the only key", () => {
  const source = readFileSync(new URL("../lib/auth/require-account.mjs", import.meta.url), "utf8");
  const refresh = source.slice(source.indexOf("async function refreshProfileIfDue"), source.indexOf("export async function requireAccount"));
  assert.match(refresh, /readClerkProfile\(existing\.id\)/);
  assert.equal(refresh.includes("VERCEL_ENV"), false);
  assert.equal(refresh.includes("CLERK_SECRET_KEY"), false);
  const reader = source.slice(source.indexOf("async function readClerkProfile"), source.indexOf("async function profileFromClerk"));
  assert.match(reader, /profileFromClerk\(accountId, clerkSecret\(\)\)/);
});
