import { asNamedDbError } from "./client.mjs";

export const WRITING_FOR_MAX = 120;

const OPTIONAL_ACCOUNT_COLUMNS = ["spelling", "thousands", "feedback_banner_closed_at", "style_choices"];
const missingOptionalColumns = new Set();

export function resetMissingAccountColumnsForTests() {
  missingOptionalColumns.clear();
}

function rememberOptionalColumn(err) {
  const code = String(err?.code || err?.cause?.code || "");
  const message = `${err?.message || ""} ${err?.cause?.message || ""}`;
  const columnError = code === "42703" || /column .* does not exist/i.test(message);
  if (!columnError) return false;
  const named = OPTIONAL_ACCOUNT_COLUMNS.filter((name) => message.includes(`"${name}"`));
  if (named.length === 0) return false;
  let added = false;
  for (const name of named) {
    if (!missingOptionalColumns.has(name)) {
      missingOptionalColumns.add(name);
      added = true;
    }
  }
  if (added) console.error("[accounts] optional column missing", [...missingOptionalColumns].join(", "));
  return true;
}

function columnsPresent(names) {
  return names.filter((name) => !missingOptionalColumns.has(name)).join(", ");
}

function withOptionalColumns(row) {
  if (!row || typeof row !== "object") return row;
  const next = { ...row };
  for (const name of OPTIONAL_ACCOUNT_COLUMNS) {
    if (!Object.prototype.hasOwnProperty.call(next, name)) next[name] = null;
  }
  return next;
}

async function exec(sql, text, params = []) {
  try {
    return await sql.query(text, params);
  } catch (err) {
    throw asNamedDbError(err);
  }
}

async function queryAccount(sql, build) {
  for (let attempt = 0; attempt <= OPTIONAL_ACCOUNT_COLUMNS.length; attempt += 1) {
    const { text, params } = build();
    try {
      return await exec(sql, text, params);
    } catch (err) {
      if (!rememberOptionalColumn(err) || attempt === OPTIONAL_ACCOUNT_COLUMNS.length) throw err;
    }
  }
  return [];
}

const FIND_COLUMNS = ["id", "email", "name", "writing_for", "spelling", "thousands", "feedback_banner_closed_at", "style_choices", "monthly_allowance_usd", "created_at", "last_active_at"];
const RETURN_COLUMNS = ["id", "email", "name", "writing_for", "spelling", "thousands", "feedback_banner_closed_at", "style_choices", "created_at", "last_active_at"];
const SHORT_COLUMNS = ["id", "email", "name", "writing_for", "spelling", "thousands", "feedback_banner_closed_at", "style_choices"];

export function activityIsStale(lastActiveAt, now, hourMs) {
  if (lastActiveAt == null || lastActiveAt === "") return true;
  const ms = new Date(lastActiveAt).getTime();
  if (!Number.isFinite(ms)) return true;
  return now - ms >= hourMs;
}

/** First 160 characters of the draft, cut back to a word, with "..." when cut. */
export const EXCERPT_LIMIT = 160;

export function draftExcerpt(draft) {
  const text = typeof draft === "string" ? draft.trim() : "";
  if (!text) return null;
  if (text.length <= EXCERPT_LIMIT) return text;
  const head = text.slice(0, EXCERPT_LIMIT);
  const next = text.charAt(EXCERPT_LIMIT);
  let cut = head;
  if (!/\s/.test(next)) {
    const space = head.lastIndexOf(" ");
    if (space > 0) cut = head.slice(0, space);
  }
  return `${cut.trimEnd()}...`;
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
  const rows = await queryAccount(sql, () => ({
    text: `select ${columnsPresent(FIND_COLUMNS)} from accounts where id = $1`,
    params: [id],
  }));
  return Array.isArray(rows) && rows[0] ? withOptionalColumns(rows[0]) : null;
}

/**
 * First sight stores the email and name from Clerk.
 * A later sight updates last_active_at at most once an hour and does not refetch.
 */
export async function rememberSeenAccount(sql, { id, email, name, now, hourMs }) {
  const existing = await findAccount(sql, id);
  if (!existing) {
    const rows = await queryAccount(sql, () => {
      const names = ["id", "email", "name", "last_active_at"];
      const values = ["$1", "$2", "$3", "now()"];
      if (!missingOptionalColumns.has("spelling")) {
        names.push("spelling");
        values.push("'US'");
      }
      if (!missingOptionalColumns.has("thousands")) {
        names.push("thousands");
        values.push("'comma'");
      }
      return {
        text: `insert into accounts (${names.join(", ")})
       values (${values.join(", ")})
       returning ${columnsPresent(RETURN_COLUMNS)}`,
        params: [id, email ?? null, name ?? null],
      };
    });
    return withOptionalColumns(rows[0]);
  }
  if (!activityIsStale(existing.last_active_at, now, hourMs)) return existing;
  const rows = await queryAccount(sql, () => ({
    text: `update accounts set last_active_at = now() where id = $1
     returning ${columnsPresent(RETURN_COLUMNS)}`,
    params: [id],
  }));
  return withOptionalColumns(rows[0]) || existing;
}

export async function updateWritingFor(sql, { id, writingFor }) {
  const rows = await queryAccount(sql, () => ({
    text: `update accounts set writing_for = $2 where id = $1
     returning ${columnsPresent(SHORT_COLUMNS)}`,
    params: [id, writingFor],
  }));
  return Array.isArray(rows) && rows[0] ? withOptionalColumns(rows[0]) : null;
}

export async function updateStyleChoices(sql, { id, styleChoices }) {
  try {
    const rows = await exec(
      sql,
      `update accounts set style_choices = $2::jsonb where id = $1
       returning ${SHORT_COLUMNS.join(", ")}`,
      [id, JSON.stringify(styleChoices ?? {})]
    );
    return Array.isArray(rows) && rows[0] ? withOptionalColumns(rows[0]) : null;
  } catch (err) {
    if (rememberOptionalColumn(err)) {
      console.error("[accounts] style_choices column is missing; the house style choices were not saved");
    }
    throw err;
  }
}

export async function updateHouseStyle(sql, { id, spelling, thousands }) {
  const rows = await exec(
    sql,
    `update accounts set spelling = $2, thousands = $3 where id = $1
     returning id, email, name, writing_for, spelling, thousands, feedback_banner_closed_at`,
    [id, spelling, thousands]
  );
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

export async function dismissFeedbackBanner(sql, id) {
  const rows = await exec(
    sql,
    `update accounts set feedback_banner_closed_at = now() where id = $1
     returning id, email, name, writing_for, spelling, thousands, feedback_banner_closed_at`,
    [id]
  );
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

/** Feedback created after the admin last closed the banner or opened the inbox. */
export async function feedbackNotice(sql, closedAt) {
  const rows = await exec(
    sql,
    `select f.created_at, a.name, a.email
       from feedback f
       join accounts a on a.id = f.account_id
      where ($1::timestamptz is null or f.created_at > $1)
        and f.read_at is null
      order by f.created_at desc`,
    [closedAt ?? null]
  );
  const list = Array.isArray(rows) ? rows : [];
  return {
    count: list.length,
    fromName: (typeof list[0]?.name === "string" && list[0].name.trim())
      ? list[0].name.trim()
      : (typeof list[0]?.email === "string" ? list[0].email.trim() : ""),
  };
}

export const LIST_REVIEWS_SQL = `
select review_id,
       left(btrim(coalesce(state->>'draftText', '')), 61) as draft_head,
       case
         when length(btrim(coalesce(state->>'draftText', ''))) = 0 then null
         when char_length(btrim(state->>'draftText')) <= 160 then btrim(state->>'draftText')
         else rtrim(
           case
             when substring(btrim(state->>'draftText') from 161 for 1) ~ '[[:space:]]'
               then left(btrim(state->>'draftText'), 160)
             when position(' ' in left(btrim(state->>'draftText'), 160)) = 0
               then left(btrim(state->>'draftText'), 160)
             else regexp_replace(left(btrim(state->>'draftText'), 160), '[[:space:]]+[^[:space:]]*$', '')
           end
         ) || '...'
       end as excerpt,
       case
         when length(btrim(coalesce(state->>'draftText', ''))) = 0 then 0
         else cardinality(regexp_split_to_array(btrim(state->>'draftText'), '[[:space:]]+'))
       end as word_count,
       coalesce(state->>'scenario', '') as text_type,
       coalesce(state->'selectedTypes'->>0, '') as output_type,
       case
         when jsonb_typeof(state->'sources') = 'array' then jsonb_array_length(state->'sources')
         else null
       end as source_count,
       nullif(btrim(coalesce(state->>'lastAnalysedAt', '')), '') as last_reviewed_at,
       coalesce((
         select jsonb_agg(name)
           from (
             select btrim(coalesce(s->>'name', s->>'title', s->>'fileName', '')) as name
               from jsonb_array_elements(
                 case when jsonb_typeof(state->'sources') = 'array' then state->'sources' else '[]'::jsonb end
               ) s
           ) named
          where name <> ''
       ), '[]'::jsonb) as source_names,
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

function listedCount(value) {
  if (value == null || value === "") return null;
  const count = Number(value);
  return Number.isFinite(count) ? count : null;
}

function listedInstant(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  const text = String(value).trim();
  return text || null;
}

function listedExcerpt(value) {
  if (value == null) return null;
  const text = String(value);
  return text.trim() ? text : null;
}

function listedNames(value) {
  const list = Array.isArray(value)
    ? value
    : (typeof value === "string" && value.trim() ? JSON.parse(value) : []);
  if (!Array.isArray(list)) return [];
  return list.map((name) => String(name || "").trim()).filter(Boolean);
}

export async function listAccountReviews(sql, accountId) {
  const rows = await exec(sql, LIST_REVIEWS_SQL, [accountId]);
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    reviewId: row.review_id,
    title: draftTitle(row.draft_head),
    excerpt: listedExcerpt(row.excerpt),
    outputType: listedTextType(row.output_type),
    textType: listedTextType(row.text_type),
    wordCount: Number(row.word_count) || 0,
    sourceCount: listedCount(row.source_count),
    lastReviewedAt: listedInstant(row.last_reviewed_at),
    sourceFileNames: listedNames(row.source_names),
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
