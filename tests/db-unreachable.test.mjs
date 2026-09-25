/**
 * B330. A refused database credential is a named failure, not a silent miss.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, test } from "vitest";
import { vi } from "vitest";

import healthHandler from "../api/health.js";
import reviewerDecisionsHandler from "../api/reviewer-decisions.js";
import {
  asNamedDbError,
  DB_CODES,
  DATABASE_STATES,
  getSql,
  probeDatabase,
  readDatabaseStatus,
  resetSqlCache,
  setSqlOverrideForTests,
} from "../lib/db/client.mjs";
import { insertReviewerDecision } from "../lib/db/reviewer-decisions.mjs";
import {
  MODEL_DRIFT_BLIND_PERIOD,
  reportModelDrift,
  resetInProcessDriftMemory,
} from "../lib/qc/model-drift-reporter.mjs";
import { withDatabaseStatus, readEnvironmentSummary } from "../api/_lib/env-flags.js";
import { AUTHORING_ORGANISATION_ENV } from "../lib/qc/first-person-actor.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function passwordRejectedError() {
  const err = new Error("password authentication failed for user 'neondb_owner'");
  err.code = "28P01";
  return err;
}

function refusingSql() {
  return {
    async query() {
      throw passwordRejectedError();
    },
  };
}

function reachableSql() {
  return {
    async query() {
      return [{ "?column?": 1 }];
    },
  };
}

function createRes() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
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
}

function invokeHealth() {
  const res = createRes();
  const req = { method: "GET", headers: {} };
  return healthHandler(req, res).then(() => res);
}

afterEach(() => {
  setSqlOverrideForTests(null);
  resetSqlCache();
  resetInProcessDriftMemory();
  vi.unstubAllEnvs();
});

describe("B330 three named database states", () => {
  test("not configured, reachable, and refusing are distinct codes, not message matching", async () => {
    vi.stubEnv("DATABASE_URL", "");
    setSqlOverrideForTests(null);
    resetSqlCache();
    let missing = null;
    try {
      getSql();
    } catch (err) {
      missing = err;
    }
    assert.equal(missing.code, DB_CODES.NOT_CONFIGURED);
    assert.notEqual(missing.code, DB_CODES.UNREACHABLE);

    vi.stubEnv("DATABASE_URL", "postgresql://neondb_owner:x@localhost/neondb");
    setSqlOverrideForTests(reachableSql());
    const sql = getSql();
    await probeDatabase(sql);
    const reachable = await readDatabaseStatus();
    assert.equal(reachable.state, DATABASE_STATES.REACHABLE);
    assert.equal(reachable.configured, true);
    assert.equal(reachable.reachable, true);

    setSqlOverrideForTests(refusingSql());
    let refused = null;
    try {
      await probeDatabase(getSql());
    } catch (err) {
      refused = err;
    }
    assert.equal(refused.code, DB_CODES.UNREACHABLE);
    assert.notEqual(refused.code, DB_CODES.NOT_CONFIGURED);
    assert.notEqual(missing.code, refused.code);

    const wrapped = asNamedDbError(passwordRejectedError());
    assert.equal(wrapped.code, DB_CODES.UNREACHABLE);
  });
});

describe("B330 drift degrades to in-process memory on a refused credential", () => {
  test("the drift check falls back to in-process memory and still detects a change", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://neondb_owner:x@localhost/neondb");
    setSqlOverrideForTests(refusingSql());
    resetInProcessDriftMemory();
    const log = vi.fn();
    const warn = vi.fn();
    const args = { stage: "stage2", model: "gpt-4o", log, warn };

    const first = await reportModelDrift({ ...args, fingerprints: ["fp_a"] });
    assert.equal(first.level, "info");
    assert.equal(first.changed, false);
    assert.equal(log.mock.calls.length, 1);

    const same = await reportModelDrift({ ...args, fingerprints: ["fp_a"] });
    assert.equal(same.level, "silent");

    const changed = await reportModelDrift({ ...args, fingerprints: ["fp_b"] });
    assert.equal(changed.changed, true);
    assert.equal(changed.level, "warn");
    assert.equal(String(warn.mock.calls[0][0]).includes("previous=fp_a current=fp_b"), true);
    assert.equal(MODEL_DRIFT_BLIND_PERIOD.from, "2026-09-21");
  });
});

describe("B330 a Review does not depend on the database", () => {
  test("a Review completes normally with the database refusing", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://neondb_owner:x@localhost/neondb");
    setSqlOverrideForTests(refusingSql());
    resetInProcessDriftMemory();
    const log = vi.fn();
    const warn = vi.fn();
    const out = await reportModelDrift({
      stage: "stage2",
      model: "gpt-4o",
      fingerprints: ["fp_a"],
      log,
      warn,
    });
    assert.equal(out.level, "info");
    const src = readFileSync(path.join(ROOT, "api/analyse-statements.js"), "utf8");
    assert.equal(src.includes("lib/db/client.mjs"), false);
    assert.equal(src.includes("getSql("), false);
  });
});

describe("B330 health reports database reachability", () => {
  test("health reports the database as unreachable when the credential is refused", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://neondb_owner:x@localhost/neondb");
    vi.stubEnv("QC_PIPELINE_V4", "1");
    vi.stubEnv(AUTHORING_ORGANISATION_ENV, "Brightline");
    vi.stubEnv("BRIGHTLINE_EDITORIAL_REVIEW", "1");
    setSqlOverrideForTests(refusingSql());
    const res = await invokeHealth();
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.database.state, DATABASE_STATES.UNREACHABLE);
    assert.equal(res.body.database.configured, true);
    assert.equal(res.body.database.reachable, false);
    assert.equal(res.body.environment.database, DATABASE_STATES.UNREACHABLE);
    assert.equal(res.body.environment.ok, false);
  });

  test("health reports not_configured and reachable as the other two states", async () => {
    vi.stubEnv("DATABASE_URL", "");
    setSqlOverrideForTests(null);
    resetSqlCache();
    const missing = await invokeHealth();
    assert.equal(missing.statusCode, 200);
    assert.equal(missing.body.database.state, DATABASE_STATES.NOT_CONFIGURED);
    assert.equal(missing.body.environment.database, DATABASE_STATES.NOT_CONFIGURED);

    vi.stubEnv("DATABASE_URL", "postgresql://neondb_owner:x@localhost/neondb");
    setSqlOverrideForTests(reachableSql());
    const up = await invokeHealth();
    assert.equal(up.statusCode, 200);
    assert.equal(up.body.database.state, DATABASE_STATES.REACHABLE);
    assert.equal(up.body.database.reachable, true);
  });
});

describe("B330 a decision that cannot be saved is an error", () => {
  test("a decision that cannot be saved surfaces an error rather than reading as saved", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://neondb_owner:x@localhost/neondb");
    setSqlOverrideForTests(refusingSql());
    const res = createRes();
    await reviewerDecisionsHandler(
      {
        method: "POST",
        headers: { "x-owner-key": "owner_key_aaa", origin: "http://localhost:5173" },
        query: {},
        body: {
          reviewId: "review_ab12",
          kind: "source_governance",
          payload: { chosenLabel: "Fact sheet" },
        },
      },
      res
    );
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.error, "db_unreachable");
    assert.notEqual(res.body.ok, true);
    assert.equal(res.body.id, undefined);

    await assert.rejects(
      () =>
        insertReviewerDecision(refusingSql(), {
          ownerKey: "owner_key_aaa",
          reviewId: "review_ab12",
          kind: "source_governance",
          payload: { chosenLabel: "Fact sheet" },
        }),
      (err) => err.code === DB_CODES.UNREACHABLE
    );
  });
});

describe("B330 environment.ok is false only for unreachable, not missing", () => {
  test("withDatabaseStatus keeps ok when the URL is unset and clears it when refusing", () => {
    const base = readEnvironmentSummary({
      QC_PIPELINE_V4: "1",
      [AUTHORING_ORGANISATION_ENV]: "Brightline",
      BRIGHTLINE_EDITORIAL_REVIEW: "1",
    });
    assert.equal(base.ok, true);
    const missing = withDatabaseStatus(base, { state: DATABASE_STATES.NOT_CONFIGURED });
    assert.equal(missing.ok, true);
    assert.equal(missing.database, DATABASE_STATES.NOT_CONFIGURED);
    const down = withDatabaseStatus(base, { state: DATABASE_STATES.UNREACHABLE });
    assert.equal(down.ok, false);
    assert.equal(down.database, DATABASE_STATES.UNREACHABLE);
  });
});
