import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EXPECTED_COLUMNS } from "./expected-schema.mjs";
import { isAdditiveMigration, splitSqlStatements } from "./sql-statements.mjs";

const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../db/migrations"
);

const COLUMN_SQL = `
select table_name, column_name
  from information_schema.columns
 where table_schema = 'public'
`.trim();

function looksLikeColumnRows(rows) {
  return Array.isArray(rows) && rows.every((row) => row && typeof row.table_name === "string" && typeof row.column_name === "string");
}

export function statusFromColumnRows(rows) {
  const have = new Set(rows.map((row) => `${row.table_name}.${row.column_name}`));
  const missing = [];
  const missingMigrations = [];
  for (const item of EXPECTED_COLUMNS) {
    let migrationMissing = false;
    for (const column of item.columns) {
      const key = `${item.table}.${column}`;
      if (!have.has(key)) {
        missing.push(`${item.migration} ${key}`);
        migrationMissing = true;
      }
    }
    if (migrationMissing && !missingMigrations.includes(item.migration)) missingMigrations.push(item.migration);
  }
  const accountsColumns = rows
    .filter((row) => row.table_name === "accounts")
    .map((row) => row.column_name)
    .sort();
  return {
    state: missing.length ? "missing" : "present",
    missing,
    missingMigrations,
    accountsColumns,
  };
}

export async function readSchemaStatus(sql) {
  let rows;
  try {
    rows = await sql.query(COLUMN_SQL, []);
  } catch (err) {
    console.error("[schema] the live columns were not read", err?.message || err);
    return { state: "unchecked", missing: [], missingMigrations: [], accountsColumns: [] };
  }
  if (!looksLikeColumnRows(rows)) {
    return { state: "unchecked", missing: [], missingMigrations: [], accountsColumns: [] };
  }
  return statusFromColumnRows(rows);
}

async function migrationFile(id) {
  const names = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith(".sql")).sort();
  const name = names.find((entry) => entry.startsWith(`${id}_`));
  if (!name) return null;
  const text = await readFile(path.join(MIGRATIONS_DIR, name), "utf8");
  return { name, text };
}

async function runStatement(sql, statement) {
  if (typeof sql.query === "function") {
    await sql.query(statement);
    return;
  }
  await sql(statement);
}

/**
 * Apply missing migrations whose statements only add objects.
 * A file that updates, deletes, or drops is skipped and named.
 */
export async function applyMissingAdditive(sql, migrationIds) {
  const applied = [];
  const skipped = [];
  for (const id of migrationIds) {
    const file = await migrationFile(id);
    if (!file) {
      skipped.push(id);
      console.error("[schema] migration file is missing", id);
      continue;
    }
    if (!isAdditiveMigration(file.text)) {
      skipped.push(file.name);
      console.error("[schema] migration is not additive, left unapplied", file.name);
      continue;
    }
    for (const statement of splitSqlStatements(file.text)) {
      await runStatement(sql, statement);
    }
    applied.push(file.name);
    console.error("[schema] applied additive migration", file.name);
  }
  return { applied, skipped };
}
