import { withCors } from "../lib/http/with-cors.mjs";
import { applyCors } from "../lib/http/frontend-origins.mjs";
import { rememberAccount, requireAccount } from "../lib/auth/require-account.mjs";
import { claimOwnerRows } from "../lib/db/accounts.mjs";
import { getSql, respondIfDbFailure } from "../lib/db/client.mjs";
import { validateOwnerKey } from "../lib/db/review-state.mjs";


function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return {};
}

async function handler(req, res) {
  if (applyCors(req, res, { methods: "POST,OPTIONS" })) return;
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  const account = await requireAccount(req, res);
  if (!account) return;
  rememberAccount(account);
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const ownerKey = readJsonBody(req).ownerKey;
  if (!validateOwnerKey(ownerKey)) return res.status(400).json({ error: "invalid_owner_key" });
  if (!account.accountId) return res.status(200).json({ reviewState: 0, reviewerDecisions: 0 });

  let sql;
  try {
    sql = getSql();
  } catch (err) {
    if (respondIfDbFailure(res, err)) return;
    throw err;
  }
  try {
    const counts = await claimOwnerRows(sql, { accountId: account.accountId, ownerKey });
    return res.status(200).json(counts);
  } catch (err) {
    if (respondIfDbFailure(res, err)) return;
    throw err;
  }
}

export default withCors(handler, {});
