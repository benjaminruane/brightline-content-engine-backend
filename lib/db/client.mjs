import { neon } from "@neondatabase/serverless";

let cachedSql = null;

export function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    const err = new Error("DATABASE_URL is unset");
    err.code = "DB_NOT_CONFIGURED";
    throw err;
  }
  if (!cachedSql) {
    cachedSql = neon(url);
  }
  return cachedSql;
}
