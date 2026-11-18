import { applyCors } from "../lib/http/frontend-origins.mjs";
import { emailIsAdmin, rememberAccount, requireAccount } from "../lib/auth/require-account.mjs";
import { getSql, respondIfDbFailure } from "../lib/db/client.mjs";

const DELETE_SQL = `
with doomed as (
  select review_id from review_state where account_id = $1
),
gone_decisions as (
  delete from reviewer_decisions
  where review_id in (select review_id from doomed)
  returning review_id
),
gone_reviews as (
  delete from review_state where account_id = $1
  returning review_id
),
gone_feedback as (
  delete from feedback where account_id = $1
  returning id
),
nulled_spend as (
  update spend_events set account_id = null where account_id = $1
  returning id
)
delete from accounts where id = $1
returning id
`;

let deleteClerkUser = deleteClerkUserByApi;

/** Test seam. Pass null to restore the Clerk Backend API call. */
export function setClerkUserDeleterForTests(fn) {
  deleteClerkUser = typeof fn === "function" ? fn : deleteClerkUserByApi;
}

/**
 * Clerk Backend API, current docs: DELETE /v1/users/{user_id}
 * with Authorization: Bearer the secret key.
 * https://clerk.com/docs/reference/backend/user/delete-user
 */
export async function deleteClerkUserByApi(userId) {
  const secret = typeof process.env.CLERK_SECRET_KEY === "string" ? process.env.CLERK_SECRET_KEY.trim() : "";
  if (!secret) throw new Error("CLERK_SECRET_KEY is missing");
  if (!userId) throw new Error("clerk user id is missing");
  const res = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`clerk delete failed (${res.status}) ${detail.slice(0, 180)}`);
  }
}

export default async function handler(req, res) {
  if (applyCors(req, res, { methods: "POST,OPTIONS" })) return;
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const account = await requireAccount(req, res);
  if (!account) return;
  rememberAccount(account);
  if (!account.accountId) return res.status(401).json({ error: "sign_in_required" });
  if (emailIsAdmin(account.email)) return res.status(403).json({ error: "admin_cannot_delete" });

  let sql;
  try {
    sql = getSql();
  } catch (err) {
    if (respondIfDbFailure(res, err)) return;
    throw err;
  }

  try {
    await sql.query(DELETE_SQL, [account.accountId]);
  } catch (err) {
    if (respondIfDbFailure(res, err)) return;
    console.error("[account-delete] database delete failed", err?.message || err);
    return res.status(500).json({ error: "account_delete_failed" });
  }

  try {
    await deleteClerkUser(account.accountId);
  } catch (err) {
    console.error("[account-delete] Clerk user was not deleted", account.accountId, err?.message || err);
  }
  return res.status(200).json({ ok: true });
}
