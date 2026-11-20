/**
 * B546. A missing house-style column must not take down the account.
 * The row still loads, the house style falls back, and the miss is logged.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, test, vi } from "vitest";
import { findAccount, rememberSeenAccount, resetMissingAccountColumnsForTests } from "../lib/db/accounts.mjs";
import { setSqlOverrideForTests } from "../lib/db/client.mjs";
import { houseStyleForRow, NEW_ACCOUNT_HOUSE_STYLE } from "../lib/house-style-choice.mjs";
import { statusFromColumnRows } from "../lib/db/schema-status.mjs";
import { isAdditiveMigration, splitSqlStatements } from "../lib/db/sql-statements.mjs";
import healthHandler from "../api/health.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OPTIONAL = ["spelling", "thousands", "feedback_banner_closed_at"];

function missingColumnError(name) {
  const err = new Error(`column "${name}" of relation "accounts" does not exist`);
  err.code = "42703";
  return err;
}

function rowWithoutChoice() {
  return {
    id: "user_1",
    email: "ada@example.com",
    name: "Ada",
    writing_for: null,
    monthly_allowance_usd: 25,
    created_at: "2026-11-20T00:00:00.000Z",
    last_active_at: "2026-11-20T00:00:00.000Z",
  };
}

afterEach(() => {
  resetMissingAccountColumnsForTests();
  setSqlOverrideForTests(null);
  vi.restoreAllMocks();
});

describe("B546 account reads degrade", () => {
  test("a missing optional column still returns the account and logs the miss", async () => {
    const seen = [];
    const sql = {
      async query(text, params = []) {
        seen.push(text.replace(/\s+/g, " ").trim());
        for (const name of OPTIONAL) {
          if (text.includes(name)) throw missingColumnError(name);
        }
        if (text.startsWith("select")) return params[0] === "user_1" ? [rowWithoutChoice()] : [];
        if (text.startsWith("insert")) {
          return [{ ...rowWithoutChoice(), id: params[0], email: params[1], name: params[2] }];
        }
        return [];
      },
    };
    const errors = [];
    vi.spyOn(console, "error").mockImplementation((...args) => {
      errors.push(args.map(String).join(" "));
    });

    const loaded = await findAccount(sql, "user_1");
    assert.equal(loaded.id, "user_1");
    assert.equal(loaded.email, "ada@example.com");
    assert.equal(loaded.spelling, null);
    assert.equal(loaded.thousands, null);
    assert.equal(loaded.feedback_banner_closed_at, null);
    assert.deepEqual(houseStyleForRow(loaded, false), NEW_ACCOUNT_HOUSE_STYLE);
    assert.equal(errors.some((line) => line.includes("optional column missing") && line.includes("spelling")), true);
    assert.equal(seen.some((text) => text.startsWith("select id, email, name, writing_for, monthly_allowance_usd")), true);

    resetMissingAccountColumnsForTests();
    const created = await rememberSeenAccount(sql, {
      id: "user_2",
      email: "new@example.com",
      name: "New",
      now: Date.now(),
      hourMs: 60 * 60 * 1000,
    });
    assert.equal(created.id, "user_2");
    assert.equal(created.spelling, null);
    assert.deepEqual(houseStyleForRow(created, false), NEW_ACCOUNT_HOUSE_STYLE);
    const inserts = seen.filter((text) => text.startsWith("insert into accounts"));
    assert.equal(inserts.length, 1);
    assert.equal(inserts[0].includes("spelling"), false);
    assert.equal(inserts[0].includes("thousands"), false);
    assert.equal(inserts[0].includes("feedback_banner_closed_at"), false);
  });
});

describe("B546 schema check", () => {
  test("migrations 001 to 007 are additive and a missing 007 column is reported", () => {
    const dir = path.join(ROOT, "db/migrations");
    const files = readdirSync(dir).filter((name) => name.endsWith(".sql")).sort();
    assert.deepEqual(files.map((name) => name.slice(0, 3)), ["001", "002", "003", "004", "005", "006", "007"]);
    for (const name of files) {
      const text = readFileSync(path.join(dir, name), "utf8");
      assert.equal(isAdditiveMigration(text), true, name);
      assert.equal(splitSqlStatements(text).length > 0, true, name);
    }
    const present = [
      ["accounts", "id"],
      ["accounts", "email"],
      ["accounts", "name"],
      ["accounts", "writing_for"],
      ["accounts", "created_at"],
      ["accounts", "last_active_at"],
      ["accounts", "monthly_allowance_usd"],
      ["review_state", "review_id"],
      ["review_state", "owner_key"],
      ["review_state", "state"],
      ["review_state", "created_at"],
      ["review_state", "updated_at"],
      ["review_state", "account_id"],
      ["reviewer_decisions", "id"],
      ["reviewer_decisions", "owner_key"],
      ["reviewer_decisions", "review_id"],
      ["reviewer_decisions", "decided_at"],
      ["reviewer_decisions", "kind"],
      ["reviewer_decisions", "draft_hash"],
      ["reviewer_decisions", "statement"],
      ["reviewer_decisions", "payload"],
      ["reviewer_decisions", "account_id"],
      ["model_fingerprint_log", "id"],
      ["model_fingerprint_log", "stage"],
      ["model_fingerprint_log", "model"],
      ["model_fingerprint_log", "fingerprints"],
      ["model_fingerprint_log", "first_seen"],
      ["spend_events", "id"],
      ["spend_events", "account_id"],
      ["spend_events", "route"],
      ["spend_events", "review_id"],
      ["spend_events", "cost_usd"],
      ["spend_events", "models"],
      ["spend_events", "created_at"],
      ["feedback", "id"],
      ["feedback", "account_id"],
      ["feedback", "comment"],
      ["feedback", "meta"],
      ["feedback", "draft_snapshot"],
      ["feedback", "created_at"],
      ["feedback", "read_at"],
    ].map(([table_name, column_name]) => ({ table_name, column_name }));
    const status = statusFromColumnRows(present);
    assert.equal(status.state, "missing");
    assert.deepEqual(status.missingMigrations, ["007"]);
    assert.equal(status.missing.includes("007 accounts.spelling"), true);
    assert.equal(status.missing.includes("007 accounts.thousands"), true);
    assert.equal(status.missing.includes("007 accounts.feedback_banner_closed_at"), true);
  });

  test("health reports a schema gap and does not apply it through the test database", async () => {
    const statements = [];
    setSqlOverrideForTests({
      async query(text) {
        statements.push(text);
        if (text.includes("information_schema.columns")) {
          return [{ table_name: "accounts", column_name: "id" }];
        }
        return [{ "?column?": 1 }];
      },
    });
    vi.stubEnv("DATABASE_URL", "postgresql://neondb_owner:x@localhost/neondb");
    vi.stubEnv("VERCEL_ENV", "production");
    const res = {
      statusCode: 200,
      body: undefined,
      headers: {},
      setHeader() {},
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        return this;
      },
      end() {
        return this;
      },
    };
    await healthHandler({ method: "GET", headers: {} }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.database.state, "reachable");
    assert.equal(res.body.database.schema.state, "missing");
    assert.equal(res.body.database.schema.applied.length, 0);
    assert.equal(statements.some((text) => /alter table|create table|do \$\$/i.test(text)), false);
    vi.unstubAllEnvs();
  });
});
