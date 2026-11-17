import { emailIsAdmin, rememberAccount, requireAccount } from "../lib/auth/require-account.mjs";
import { listAccountsForAdmin } from "../lib/db/accounts.mjs";
import { getSql, respondIfDbFailure } from "../lib/db/client.mjs";
import { resolveReviewStateCorsOrigin } from "./review-state.js";

function setCorsHeaders(req, res) {
  res.setHeader("Access-Control-Allow-Origin", resolveReviewStateCorsOrigin(req.headers?.origin));
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-owner-key");
  res.setHeader("Access-Control-Max-Age", "86400");
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  const account = await requireAccount(req, res);
  if (!account) return;
  rememberAccount(account);
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!emailIsAdmin(account.email)) return res.status(404).json({ error: "not_found" });

  let sql;
  try {
    sql = getSql();
  } catch (err) {
    if (respondIfDbFailure(res, err)) return;
    throw err;
  }
  try {
    const accounts = await listAccountsForAdmin(sql);
    return res.status(200).json({ accounts });
  } catch (err) {
    if (respondIfDbFailure(res, err)) return;
    throw err;
  }
}
