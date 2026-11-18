import { asNamedDbError } from "./client.mjs";

export const WRITING_FOR_MAX = 120;

async function exec(sql, text, params = []) {
  try {
    return await sql.query(text, params);
  } catch (err) {
    throw asNamedDbError(err);
  }
}

export function activityIsStale(lastActiveAt, now, hourMs) {
  if (lastActiveAt == null || lastActiveAt === "") return true;
  const ms = new Date(lastActiveAt).getTime();
  if (!Number.isFinite(ms)) return true;
  return now - ms >= hourMs;
}

/** First 60 characters, cut back to a word when the cut lands inside one. */
export function draftTitle(draft) {
  const text = typeof draft === "string" ? draft.trim() : "";
  if (!text) return "Untitled text";
  if (text.length <= 60) return text;
  const head = text.slice(0, 60);
  const next = text.charAt(60);
  if (/\s/.test(next)) return head.trim() || "Untitled text";
  const space = head.lastIndexOf(" ");
  if (space <= 0) return head.trim() || "Untitled text";
  return head.slice(0, space).trim() || "Untitled text";
}

export function normaliseWritingFor(value) {
  if (value == null) return null;
  if (typeof value !== "string") {
    const err = new Error("writing for must be text");
    err.code = "invalid_writing_for";
    throw err;
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, WRITING_FOR_MAX);
}

export async function findAccount(sql, id) {
  const rows = await exec(
    sql,
    "select id, email, name, writing_for, monthly_allowance_usd, created_at, last_active_at from accounts where id = $1",
    [id]
  );
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

/**
 * First sight stores the email and name from Clerk.
 * A later sight updates last_active_at at most once an hour and does not refetch.
 */
export async function rememberSeenAccount(sql, { id, email, name, now, hourMs }) {
  const existing = await findAccount(sql, id);
  if (!existing) {
    const rows = await exec(
      sql,
      `insert into accounts (id, email, name, last_active_at)
       values ($1, $2, $3, now())
       returning id, email, name, writing_for, created_at, last_active_at`,
      [id, email ?? null, name ?? null]
    );
    return rows[0];
  }
  if (!activityIsStale(existing.last_active_at, now, hourMs)) return existing;
  const rows = await exec(
    sql,
    `update accounts set last_active_at = now() where id = $1
     returning id, email, name, writing_for, created_at, last_active_at`,
    [id]
  );
  return rows[0] || existing;
}

export async function updateWritingFor(sql, { id, writingFor }) {
  const rows = await exec(
    sql,
    `update accounts set writing_for = $2 where id = $1
     returning id, email, name, writing_for`,
    [id, writingFor]
  );
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

export const LIST_REVIEWS_SQL = `
select review_id,
       left(btrim(coalesce(state->>'draftText', '')), 61) as draft_head,
       case
         when length(btrim(coalesce(state->>'draftText', ''))) = 0 then 0
         else cardinality(regexp_split_to_array(btrim(state->>'draftText'), E'\\s+'))
       end as word_count,
       coalesce(state->>'scenario', '') as text_type,
       updated_at
  from review_state
 where account_id = $1
 order by updated_at desc
`.trim();

/** The saved scenario. A blank value was not saved, so the list shows no type. */
export function listedTextType(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export async function listAccountReviews(sql, accountId) {
  const rows = await exec(sql, LIST_REVIEWS_SQL, [accountId]);
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    reviewId: row.review_id,
    title: draftTitle(row.draft_head),
    textType: listedTextType(row.text_type),
    wordCount: Number(row.word_count) || 0,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at ?? null,
  }));
}

export async function listAccountsForAdmin(sql, monthStart) {
  const rows = await exec(
    sql,
    `select a.id, a.name, a.email, a.created_at, a.last_active_at, a.monthly_allowance_usd,
            (select count(*)::int from review_state r where r.account_id = a.id) as text_count,
            (select coalesce(sum(s.cost_usd), 0) from spend_events s
              where s.account_id = a.id and s.created_at >= $1) as spent_this_month
       from accounts a
      order by a.created_at desc`,
    [monthStart]
  );
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    accountId: row.id,
    name: row.name ?? null,
    email: row.email ?? null,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at ?? null,
    lastActiveAt: row.last_active_at instanceof Date ? row.last_active_at.toISOString() : row.last_active_at ?? null,
    textCount: Number(row.text_count) || 0,
    spentThisMonthUsd: Number(row.spent_this_month) || 0,
    allowanceUsd: row.monthly_allowance_usd == null || row.monthly_allowance_usd === ""
      ? null
      : Number(row.monthly_allowance_usd),
  }));
}

export function normaliseAllowance(value) {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) {
    const err = new Error("allowance must be a number");
    err.code = "invalid_allowance";
    throw err;
  }
  return Math.round(n * 100) / 100;
}

export async function setMonthlyAllowance(sql, { id, monthlyAllowanceUsd }) {
  const rows = await exec(
    sql,
    `update accounts set monthly_allowance_usd = $2 where id = $1
     returning id, email, name, writing_for, monthly_allowance_usd, created_at, last_active_at`,
    [id, monthlyAllowanceUsd]
  );
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

export async function claimOwnerRows(sql, { accountId, ownerKey }) {
  const reviews = await exec(
    sql,
    `update review_state set account_id = $1
      where owner_key = $2 and account_id is null
      returning review_id`,
    [accountId, ownerKey]
  );
  const decisions = await exec(
    sql,
    `update reviewer_decisions set account_id = $1
      where owner_key = $2 and account_id is null
      returning id`,
    [accountId, ownerKey]
  );
  return {
    reviewState: Array.isArray(reviews) ? reviews.length : 0,
    reviewerDecisions: Array.isArray(decisions) ? decisions.length : 0,
  };
}
