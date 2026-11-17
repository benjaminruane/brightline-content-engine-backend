import { asNamedDbError } from "./client.mjs";

export const MAX_STATE_BYTES = 4 * 1024 * 1024;

const REVIEW_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const OWNER_KEY_RE = /^[A-Za-z0-9_-]{8,128}$/;

export function validateReviewId(id) {
  return typeof id === "string" && REVIEW_ID_RE.test(id);
}

export function validateOwnerKey(key) {
  return typeof key === "string" && OWNER_KEY_RE.test(key);
}

function rowOwner(row) {
  return row?.owner_key ?? row?.ownerKey ?? null;
}

function rowState(row) {
  return row?.state;
}

function rowUpdatedAt(row) {
  return row?.updated_at ?? row?.updatedAt ?? null;
}

async function exec(sql, text, params = []) {
  try {
    return await sql.query(text, params);
  } catch (err) {
    throw asNamedDbError(err);
  }
}

function rowAccount(row) {
  return row?.account_id ?? row?.accountId ?? null;
}

async function fetchRow(sql, reviewId) {
  const rows = await exec(
    sql,
    "select review_id, owner_key, state, updated_at, account_id from review_state where review_id = $1",
    [reviewId]
  );
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows[0];
}

function accountCanUse(row, accountId, ownerKey) {
  const stored = rowAccount(row);
  if (stored && stored === accountId) return "ok";
  if (stored && stored !== accountId) return "not_found";
  if (rowOwner(row) === ownerKey) return "adopt";
  return "not_found";
}

export async function loadReviewState(sql, { reviewId, ownerKey, accountId = null }) {
  const row = await fetchRow(sql, reviewId);
  if (!row) return null;
  if (accountId) {
    const access = accountCanUse(row, accountId, ownerKey);
    if (access === "not_found") return { ok: false, reason: "not_found" };
    return {
      ok: true,
      reviewId,
      state: rowState(row),
      updatedAt: rowUpdatedAt(row),
    };
  }
  if (rowOwner(row) !== ownerKey) {
    return { ok: false, reason: "owner_mismatch" };
  }
  return {
    ok: true,
    reviewId,
    state: rowState(row),
    updatedAt: rowUpdatedAt(row),
  };
}

export async function saveReviewState(sql, { reviewId, ownerKey, state, accountId = null }) {
  const bytes = Buffer.byteLength(JSON.stringify(state), "utf8");
  if (bytes > MAX_STATE_BYTES) {
    return { ok: false, reason: "too_large", bytes };
  }

  const existing = await fetchRow(sql, reviewId);
  if (accountId) {
    if (existing && accountCanUse(existing, accountId, ownerKey) === "not_found") {
      return { ok: false, reason: "not_found" };
    }
    const rows = await exec(
      sql,
      `insert into review_state (review_id, owner_key, state, account_id)
       values ($1, $2, $3::jsonb, $4)
       on conflict (review_id) do update
         set state = excluded.state,
             updated_at = now(),
             account_id = excluded.account_id
         where review_state.account_id = excluded.account_id
            or review_state.account_id is null
       returning review_id, updated_at`,
      [reviewId, ownerKey, JSON.stringify(state), accountId]
    );
    const saved = Array.isArray(rows) && rows[0] ? rows[0] : null;
    if (!saved) return { ok: false, reason: "not_found" };
    return {
      ok: true,
      reviewId,
      updatedAt: rowUpdatedAt(saved),
    };
  }
  if (existing && rowOwner(existing) !== ownerKey) {
    return { ok: false, reason: "owner_mismatch" };
  }

  const rows = await exec(
    sql,
    `insert into review_state (review_id, owner_key, state)
     values ($1, $2, $3::jsonb)
     on conflict (review_id) do update
       set state = excluded.state, updated_at = now()
     returning review_id, updated_at`,
    [reviewId, ownerKey, JSON.stringify(state)]
  );
  const saved = Array.isArray(rows) && rows[0] ? rows[0] : null;
  return {
    ok: true,
    reviewId,
    updatedAt: saved ? rowUpdatedAt(saved) : null,
  };
}

export async function deleteReviewState(sql, { reviewId, ownerKey, accountId = null }) {
  const existing = await fetchRow(sql, reviewId);
  if (!existing) return { ok: true };
  if (accountId) {
    if (accountCanUse(existing, accountId, ownerKey) === "not_found") {
      return { ok: false, reason: "not_found" };
    }
    await exec(sql, "delete from review_state where review_id = $1 and (account_id = $2 or account_id is null)", [reviewId, accountId]);
    return { ok: true };
  }
  if (rowOwner(existing) !== ownerKey) {
    return { ok: false, reason: "owner_mismatch" };
  }
  await exec(sql, "delete from review_state where review_id = $1", [reviewId]);
  return { ok: true };
}
