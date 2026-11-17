import { applyCors } from "../lib/http/frontend-origins.mjs";
import { rememberAccount, requireAccount } from "../lib/auth/require-account.mjs";
import { listAccountReviews } from "../lib/db/accounts.mjs";
import { getSql, respondIfDbFailure } from "../lib/db/client.mjs";


export default async function handler(req, res) {
  if (applyCors(req, res, { methods: "GET,OPTIONS" })) return;
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  const account = await requireAccount(req, res);
  if (!account) return;
  rememberAccount(account);
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!account.accountId) return res.status(200).json({ reviews: [] });

  let sql;
  try {
    sql = getSql();
  } catch (err) {
    if (respondIfDbFailure(res, err)) return;
    throw err;
  }
  try {
    const reviews = await listAccountReviews(sql, account.accountId);
    return res.status(200).json({ reviews });
  } catch (err) {
    if (respondIfDbFailure(res, err)) return;
    throw err;
  }
}
