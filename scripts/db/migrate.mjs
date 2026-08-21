import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../db/migrations"
);

function splitStatements(sqlText) {
  return sqlText
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED;
  if (!url) {
    console.error("DATABASE_URL_UNPOOLED is unset");
    process.exit(1);
  }

  const sql = neon(url);
  const names = (await readdir(MIGRATIONS_DIR))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  if (names.length === 0) {
    console.error(`No .sql files in ${MIGRATIONS_DIR}`);
    process.exit(1);
  }

  let statementsRun = 0;
  for (const name of names) {
    console.log(`running ${name}`);
    const text = await readFile(path.join(MIGRATIONS_DIR, name), "utf8");
    const statements = splitStatements(text);
    for (const statement of statements) {
      if (typeof sql.query === "function") {
        await sql.query(statement);
      } else {
        await sql(statement);
      }
      statementsRun += 1;
    }
  }

  console.log(`migrate ok: ${names.length} file(s), ${statementsRun} statement(s)`);
}

main().catch((err) => {
  console.error(err?.message || "migrate failed");
  process.exit(1);
});
