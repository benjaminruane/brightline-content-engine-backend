/**
 * A migration file the health check does not know about fails the ship.
 * When the database answers, a missing column is a warning. This machine's
 * stored production credential may be refused. Production health is the
 * live report, and it applies an additive gap there.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrationIds } from "../../lib/db/expected-schema.mjs";
import { isAdditiveMigration } from "../../lib/db/sql-statements.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MIGRATIONS_DIR = path.join(ROOT, "db/migrations");

const files = readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith(".sql")).sort();
const known = new Set(migrationIds());
let failed = false;
for (const name of files) {
  const id = name.slice(0, 3);
  if (!known.has(id)) {
    process.stdout.write(`SCHEMA WARNING  ${name} is not in the health check\n`);
    failed = true;
    continue;
  }
  const text = readFileSync(path.join(MIGRATIONS_DIR, name), "utf8");
  if (!isAdditiveMigration(text)) {
    process.stdout.write(`SCHEMA NOTE  ${name} is not additive, so health will report it and will not apply it\n`);
  }
}
if (failed) process.exit(1);

function databaseUrlFromLocalFile() {
  const filePath = path.join(ROOT, ".env.local");
  if (!existsSync(filePath)) return "";
  for (const line of readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    if (trimmed.slice(0, eq).trim() !== "DATABASE_URL") continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    return value;
  }
  return "";
}

/**
 * db:migrate loads .env.local with node --env-file-if-exists, which does not
 * override a DATABASE_URL already in the process. This check was reading only
 * the process value, so a corrected .env.local was ignored. The file wins.
 */
function databaseUrl() {
  const fromFile = databaseUrlFromLocalFile();
  if (fromFile) return { url: fromFile, source: ".env.local" };
  if (process.env.DATABASE_URL) return { url: process.env.DATABASE_URL, source: "the process environment" };
  return { url: "", source: "" };
}

async function warnIfLiveColumnsMissing() {
  const { url, source } = databaseUrl();
  if (!url) {
    process.stdout.write("SCHEMA WARNING  DATABASE_URL is unset, so this ship did not read production columns\n");
    return;
  }
  try {
    const { neon } = await import("@neondatabase/serverless");
    const { readSchemaStatus } = await import("../../lib/db/schema-status.mjs");
    const status = await readSchemaStatus(neon(url));
    if (status.state === "unchecked") {
      process.stdout.write("SCHEMA WARNING  production columns were not read from this machine\n");
      return;
    }
    if (status.state === "missing") {
      process.stdout.write(`SCHEMA WARNING  production is missing ${status.missing.join(", ")}\n`);
      return;
    }
    process.stdout.write(`SCHEMA OK  production has the columns the code reads (DATABASE_URL from ${source})\n`);
  } catch (err) {
    process.stdout.write(`SCHEMA WARNING  production columns were not read from this machine (${err?.code || "refused"})\n`);
  }
}

await warnIfLiveColumnsMissing();
process.exit(0);
