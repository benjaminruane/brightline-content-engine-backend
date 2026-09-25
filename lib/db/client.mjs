import { neon } from "@neondatabase/serverless";

export const DB_CODES = Object.freeze({
  NOT_CONFIGURED: "DB_NOT_CONFIGURED",
  UNREACHABLE: "DB_UNREACHABLE",
});

export const DATABASE_STATES = Object.freeze({
  NOT_CONFIGURED: "not_configured",
  REACHABLE: "reachable",
  UNREACHABLE: "unreachable",
});

let cachedSql = null;
let sqlOverride = null;

/** Test seam. Pass a fake sql. Pass null to restore the real client. */
export function setSqlOverrideForTests(sql) {
  sqlOverride = sql;
  cachedSql = null;
}

export function resetSqlCache() {
  cachedSql = null;
}

export function isDbNotConfiguredError(err) {
  return err?.code === DB_CODES.NOT_CONFIGURED;
}

export function isDbUnreachableError(err) {
  return err?.code === DB_CODES.UNREACHABLE;
}

function isRefusedConnection(err) {
  if (!err || typeof err !== "object") return false;
  if (isDbUnreachableError(err)) return true;
  const code = String(err.code ?? "");
  if (code === "28P01" || code === "28000") return true;
  if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "ETIMEDOUT") return true;
  const msg = String(err.message ?? "").toLowerCase();
  if (msg.includes("password authentication failed")) return true;
  if (msg.includes("connection refused")) return true;
  if (msg.includes("could not connect")) return true;
  return false;
}

export function asNamedDbError(err) {
  if (isDbNotConfiguredError(err) || isDbUnreachableError(err)) return err;
  if (isRefusedConnection(err)) {
    const wrapped = new Error("database is configured and refusing connections");
    wrapped.name = "DbUnreachableError";
    wrapped.code = DB_CODES.UNREACHABLE;
    wrapped.cause = err;
    return wrapped;
  }
  return err;
}

export function respondIfDbFailure(res, err) {
  const named = asNamedDbError(err);
  if (isDbNotConfiguredError(named)) {
    res.status(503).json({ error: "db_not_configured" });
    return true;
  }
  if (isDbUnreachableError(named)) {
    res.status(503).json({ error: "db_unreachable" });
    return true;
  }
  return false;
}

export function getSql() {
  if (sqlOverride) return sqlOverride;
  const url = process.env.DATABASE_URL;
  if (!url) {
    const err = new Error("DATABASE_URL is unset");
    err.name = "DbNotConfiguredError";
    err.code = DB_CODES.NOT_CONFIGURED;
    throw err;
  }
  if (!cachedSql) {
    cachedSql = neon(url);
  }
  return cachedSql;
}

export async function probeDatabase(sql) {
  try {
    await sql.query("select 1", []);
  } catch (err) {
    throw asNamedDbError(err);
  }
}

export async function readDatabaseStatus() {
  try {
    const sql = getSql();
    await probeDatabase(sql);
    return {
      state: DATABASE_STATES.REACHABLE,
      configured: true,
      reachable: true,
    };
  } catch (err) {
    if (isDbNotConfiguredError(err)) {
      return {
        state: DATABASE_STATES.NOT_CONFIGURED,
        configured: false,
        reachable: false,
      };
    }
    return {
      state: DATABASE_STATES.UNREACHABLE,
      configured: true,
      reachable: false,
    };
  }
}
