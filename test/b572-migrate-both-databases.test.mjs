/**
 * B572. Migrations go to production, then the preview branch.
 * A missing preview URL warns and does not fail production.
 * A preview that is behind is a ship warning and does not block.
 * No model call.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import {
  PREVIEW_URL_MISSING,
  envValue,
  migrationUrls,
  runMigrations,
} from "../scripts/db/migrate.mjs";
import {
  previewSchemaLine,
  productionSchemaLine,
  schemaCheckExitCode,
} from "../scripts/db/check-migration-coverage.mjs";

test("the env file wins, and a quoted value is unwrapped", () => {
  const text = [
    "DATABASE_URL_UNPOOLED=\"postgres://production\"",
    "PREVIEW_DATABASE_URL_UNPOOLED='postgres://preview'",
    "# DATABASE_URL_UNPOOLED=ignored",
  ].join("\n");
  assert.equal(envValue(text, "DATABASE_URL_UNPOOLED"), "postgres://production");
  assert.equal(envValue(text, "PREVIEW_DATABASE_URL_UNPOOLED"), "postgres://preview");
  assert.equal(envValue(text, "MISSING"), "");
  const urls = migrationUrls({
    fileText: text,
    processEnv: {
      DATABASE_URL_UNPOOLED: "postgres://from-process",
      PREVIEW_DATABASE_URL_UNPOOLED: "postgres://preview-process",
    },
  });
  assert.equal(urls.production, "postgres://production");
  assert.equal(urls.preview, "postgres://preview");
  const fallback = migrationUrls({
    fileText: "",
    processEnv: { DATABASE_URL_UNPOOLED: "postgres://from-process", PREVIEW_DATABASE_URL_UNPOOLED: "" },
  });
  assert.equal(fallback.production, "postgres://from-process");
  assert.equal(fallback.preview, "");
});

test("production is migrated first, and a missing preview URL does not fail it", async () => {
  const order = [];
  const warnings = [];
  const skipped = await runMigrations({
    productionUrl: "postgres://production",
    previewUrl: "",
    connect(url) {
      return { url };
    },
    log() {},
    warn(line) {
      warnings.push(line);
    },
    async apply(sql, { label }) {
      order.push(`${label}:${sql.url}`);
    },
  });
  assert.deepEqual(order, ["production:postgres://production"]);
  assert.deepEqual(warnings, [PREVIEW_URL_MISSING]);
  assert.equal(skipped.exitCode, 0);

  const missingProduction = await runMigrations({
    productionUrl: "",
    previewUrl: "postgres://preview",
    connect() {
      throw new Error("should not connect");
    },
    log() {},
    warn(line) {
      warnings.push(line);
    },
  });
  assert.equal(missingProduction.exitCode, 1);
  assert.equal(warnings.at(-1), "DATABASE_URL_UNPOOLED is unset");
});

test("a preview failure is reported after production has been applied", async () => {
  const order = [];
  const warnings = [];
  const result = await runMigrations({
    productionUrl: "postgres://production",
    previewUrl: "postgres://preview",
    connect(url) {
      return { url };
    },
    log() {},
    warn(line) {
      warnings.push(line);
    },
    async apply(sql, { label }) {
      order.push(label);
      if (sql.url.includes("preview")) throw new Error("preview refused");
    },
  });
  assert.deepEqual(order, ["production", "preview"]);
  assert.equal(result.exitCode, 1);
  assert.deepEqual(warnings, ["preview refused"]);
});

test("schema lines name both databases, and a behind preview does not block", () => {
  assert.equal(productionSchemaLine({ state: "present" }, true), "SCHEMA OK production");
  assert.equal(previewSchemaLine({ state: "present" }, true), "SCHEMA OK preview");
  const behind = previewSchemaLine({
    state: "missing",
    missing: ["009 accounts.created_environment", "010 accounts.profile_refreshed_at"],
  }, true);
  assert.equal(behind, "SCHEMA PREVIEW BEHIND 009 accounts.created_environment, 010 accounts.profile_refreshed_at");
  assert.equal(productionSchemaLine({ state: "missing", missing: ["010 accounts.profile_refreshed_at"] }, true), "SCHEMA WARNING  production is missing 010 accounts.profile_refreshed_at");
  assert.equal(previewSchemaLine(null, false), "SCHEMA WARNING  PREVIEW_DATABASE_URL_UNPOOLED is unset, so this ship did not read preview columns");
  assert.equal(schemaCheckExitCode({ unknownMigration: false }), 0);
  assert.equal(schemaCheckExitCode({ unknownMigration: true }), 1);
});
