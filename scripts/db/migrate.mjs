import { existsSync, readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { splitSqlStatements } from "../../lib/db/sql-statements.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MIGRATIONS_DIR = path.join(ROOT, "db/migrations");

/** .env.local wins over the process. node --env-file does not override a value already set. */
export function envValue(text, key) {
  const wanted = String(key || "");
  for (const line of String(text || "").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    if (trimmed.slice(0, eq).trim() !== wanted) continue;
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

export function readEnvFile(filePath) {
  if (!filePath || !existsSync(filePath)) return "";
  return readFileSync(filePath, "utf8");
}

export function migrationUrls({ fileText = "", processEnv = process.env } = {}) {
  const production = envValue(fileText, "DATABASE_URL_UNPOOLED") || processEnv.DATABASE_URL_UNPOOLED || "";
  const preview = envValue(fileText, "PREVIEW_DATABASE_URL_UNPOOLED") || processEnv.PREVIEW_DATABASE_URL_UNPOOLED || "";
  return { production, preview };
}

export const PREVIEW_URL_MISSING = "PREVIEW_DATABASE_URL_UNPOOLED is unset, so the preview branch was not migrated";

async function migrationFiles() {
  const names = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith(".sql")).sort();
  if (names.length === 0) throw new Error(`No .sql files in ${MIGRATIONS_DIR}`);
  return names;
}

async function applySql(sql, statement) {
  if (typeof sql.query === "function") {
    await sql.query(statement);
    return;
  }
  await sql(statement);
}

export async function applyMigrations(sql, { label, log = console.log, files = migrationFiles, dir = MIGRATIONS_DIR } = {}) {
  const names = await files();
  let statementsRun = 0;
  for (const name of names) {
    log(`${label} running ${name}`);
    const text = await readFile(path.join(dir, name), "utf8");
    for (const statement of splitSqlStatements(text)) {
      await applySql(sql, statement);
      statementsRun += 1;
    }
  }
  const line = `${label} migrate ok: ${names.length} file(s), ${statementsRun} statement(s)`;
  log(line);
  return { files: names.length, statements: statementsRun, line };
}

/**
 * Production first. A missing preview URL is one warning and exit 0.
 * A preview failure is reported after production has already been applied.
 */
export async function runMigrations({ productionUrl, previewUrl, connect, log = console.log, warn = console.error, apply = applyMigrations }) {
  if (!productionUrl) {
    warn("DATABASE_URL_UNPOOLED is unset");
    return { exitCode: 1, previewSkipped: true };
  }
  await apply(connect(productionUrl), { label: "production", log });
  if (!previewUrl) {
    warn(PREVIEW_URL_MISSING);
    return { exitCode: 0, previewSkipped: true };
  }
  try {
    await apply(connect(previewUrl), { label: "preview", log });
  } catch (err) {
    warn(err?.message || "preview migrate failed");
    return { exitCode: 1, previewSkipped: false };
  }
  return { exitCode: 0, previewSkipped: false };
}

async function main() {
  const fileText = readEnvFile(path.join(ROOT, ".env.local"));
  const { production, preview } = migrationUrls({ fileText });
  const result = await runMigrations({
    productionUrl: production,
    previewUrl: preview,
    connect: (url) => neon(url),
  });
  process.exit(result.exitCode);
}

const entry = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (entry === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err?.message || "migrate failed");
    process.exit(1);
  });
}
