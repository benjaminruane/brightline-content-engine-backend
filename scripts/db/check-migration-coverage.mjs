/**
 * A migration file the health check does not know about fails the ship.
 * When a database answers, a missing production column is a warning, same as before.
 * A preview branch that is behind is a warning and does not block.
 * This machine's stored credential may be refused. Production health is the
 * live report, and it applies an additive gap on production only.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrationIds } from "../../lib/db/expected-schema.mjs";
import { isAdditiveMigration } from "../../lib/db/sql-statements.mjs";
import { envValue } from "./migrate.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MIGRATIONS_DIR = path.join(ROOT, "db/migrations");

export function productionSchemaLine(status, urlPresent) {
  if (!urlPresent) return "SCHEMA WARNING  DATABASE_URL is unset, so this ship did not read production columns";
  if (!status || status.state === "unchecked") return "SCHEMA WARNING  production columns were not read from this machine";
  if (status.state === "missing") return `SCHEMA WARNING  production is missing ${status.missing.join(", ")}`;
  return "SCHEMA OK production";
}

export function previewSchemaLine(status, urlPresent) {
  if (!urlPresent) return "SCHEMA WARNING  PREVIEW_DATABASE_URL_UNPOOLED is unset, so this ship did not read preview columns";
  if (!status || status.state === "unchecked") return "SCHEMA WARNING  preview columns were not read from this machine";
  if (status.state === "missing") return `SCHEMA PREVIEW BEHIND ${status.missing.join(", ")}`;
  return "SCHEMA OK preview";
}

/** A preview warning does not change the exit. An unknown migration file still fails. */
export function schemaCheckExitCode({ unknownMigration = false } = {}) {
  return unknownMigration ? 1 : 0;
}

function databaseUrlFromLocalFile(key) {
  const filePath = path.join(ROOT, ".env.local");
  if (!existsSync(filePath)) return "";
  const text = readFileSync(filePath, "utf8");
  return envValue(text, key);
}

/**
 * db:migrate loads .env.local with node --env-file-if-exists, which does not
 * override a DATABASE_URL already in the process. This check was reading only
 * the process value, so a corrected .env.local was ignored. The file wins.
 */
function urlFor(key, processName) {
  const fromFile = databaseUrlFromLocalFile(key);
  if (fromFile) return fromFile;
  const fromProcess = process.env[processName];
  return typeof fromProcess === "string" ? fromProcess : "";
}

async function statusFor(url) {
  if (!url) return null;
  const { neon } = await import("@neondatabase/serverless");
  const { readSchemaStatus } = await import("../../lib/db/schema-status.mjs");
  try {
    return await readSchemaStatus(neon(url));
  } catch (err) {
    return { state: "unread", code: err?.code || "refused" };
  }
}

function lineFor(kind, status, urlPresent) {
  if (status?.state === "unread") {
    const where = kind === "production" ? "production" : "preview";
    return `SCHEMA WARNING  ${where} columns were not read from this machine (${status.code})`;
  }
  if (kind === "production") return productionSchemaLine(status, urlPresent);
  return previewSchemaLine(status, urlPresent);
}

async function main() {
  const files = readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith(".sql")).sort();
  const known = new Set(migrationIds());
  let unknownMigration = false;
  for (const name of files) {
    const id = name.slice(0, 3);
    if (!known.has(id)) {
      process.stdout.write(`SCHEMA WARNING  ${name} is not in the health check\n`);
      unknownMigration = true;
      continue;
    }
    const text = readFileSync(path.join(MIGRATIONS_DIR, name), "utf8");
    if (!isAdditiveMigration(text)) {
      process.stdout.write(`SCHEMA NOTE  ${name} is not additive, so health will report it and will not apply it\n`);
    }
  }
  if (unknownMigration) process.exit(schemaCheckExitCode({ unknownMigration: true }));

  const productionUrl = urlFor("DATABASE_URL", "DATABASE_URL");
  const previewUrl = urlFor("PREVIEW_DATABASE_URL_UNPOOLED", "PREVIEW_DATABASE_URL_UNPOOLED");
  const productionStatus = await statusFor(productionUrl);
  const previewStatus = await statusFor(previewUrl);
  process.stdout.write(`${lineFor("production", productionStatus, Boolean(productionUrl))}\n`);
  process.stdout.write(`${lineFor("preview", previewStatus, Boolean(previewUrl))}\n`);
  process.exit(schemaCheckExitCode({ unknownMigration: false }));
}

const entry = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entry === fileURLToPath(import.meta.url)) {
  await main();
}
