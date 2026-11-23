import { withCors } from "../lib/http/with-cors.mjs";
// api/health.js

import { applyCors } from "../lib/http/frontend-origins.mjs";
import { OUTPUT_TYPE_LENGTH } from "../lib/prompt-library/outputTypeGuidance.js";
import { getSql, isSqlOverrideActive, readDatabaseStatus } from "../lib/db/client.mjs";
import { applyMissingAdditive, readSchemaStatus } from "../lib/db/schema-status.mjs";
import { authMode } from "../lib/auth/require-account.mjs";
import { readBuildIdentity, readEnvironmentSummary, withDatabaseStatus } from "./_lib/env-flags.js";
import { readReleaseVersion } from "../lib/release-version.mjs";


function emptySchema() {
  return {
    state: "unchecked",
    missing: [],
    accountsColumnsBefore: [],
    accountsColumns: [],
    applied: [],
    skipped: [],
  };
}

async function readLiveSchema(database) {
  if (!database?.reachable) return emptySchema();
  try {
    const sql = getSql();
    const before = await readSchemaStatus(sql);
    let applied = [];
    let skipped = [];
    let after = before;
    const onProduction = process.env.VERCEL_ENV === "production" && !isSqlOverrideActive();
    if (onProduction && before.state === "missing" && before.missingMigrations.length > 0) {
      const result = await applyMissingAdditive(sql, before.missingMigrations);
      applied = result.applied;
      skipped = result.skipped;
      after = await readSchemaStatus(sql);
      console.error(
        "[schema] accounts columns before:",
        before.accountsColumns.join(", ") || "(none)",
        "after:",
        after.accountsColumns.join(", ") || "(none)"
      );
    }
    return {
      state: after.state,
      missing: after.missing,
      accountsColumnsBefore: before.accountsColumns,
      accountsColumns: after.accountsColumns,
      applied,
      skipped,
    };
  } catch (err) {
    console.error("[schema] the live columns were not read", err?.message || err);
    return emptySchema();
  }
}

function buildHouseWordLimits() {
  const houseWordLimits = {};
  for (const [outputType, range] of Object.entries(OUTPUT_TYPE_LENGTH)) {
    houseWordLimits[outputType] = { min: range.min, max: range.max };
  }
  return houseWordLimits;
}

async function handler(req, res) {
  if (applyCors(req, res, { methods: "GET,POST,OPTIONS" })) return;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  const database = await readDatabaseStatus();
  const schema = await readLiveSchema(database);
  const environment = withDatabaseStatus(readEnvironmentSummary(), database);
  const build = readBuildIdentity();
  return res.status(200).json({
    ok: true,
    service: "backend",
    ts: new Date().toISOString(),
    houseWordLimits: buildHouseWordLimits(),
    environment,
    database: { ...database, schema },
    build,
    version: readReleaseVersion(),
    authMode: authMode(),
  });
}

export default withCors(handler, {});
