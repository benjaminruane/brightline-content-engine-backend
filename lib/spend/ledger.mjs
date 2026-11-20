import { authMode, emailIsAdmin } from "../auth/require-account.mjs";
import { getSql } from "../db/client.mjs";
import { findAccount } from "../db/accounts.mjs";
import { enterRequestSpend, getLlmSpend, hasRequestSpend } from "../observability.js";

export { enterRequestSpend };
import { allowanceBlocks, money, monthStart, resetsOnIso, resolveAllowanceUsd } from "./allowance.mjs";

/** Local runs with sign-in off. This id is never a real account and never counts against an allowance. */
export const LOCAL_DEVELOPMENT_ACCOUNT_ID = "local-development";

export const MODEL_ROUTES = [
  "adapt",
  "analyse-statements",
  "constructive-feedback",
  "generate",
  "query",
  "query-sources",
  "recheck-statements",
  "revise-actions",
  "rewrite",
  "suggest-revision",
  "suggest-roles",
  "summarize-rewrite-label",
  "summarize-source",
  "summarize-source-usage",
  "synthesize-review",
];

function readReviewId(req) {
  const body = req?.body && typeof req.body === "object" ? req.body : {};
  const raw = body.reviewId || req?.query?.reviewId;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

export async function spentThisMonthUsd(sql, accountId, now = new Date()) {
  if (!accountId) return 0;
  const rows = await sql.query(
    `select coalesce(sum(cost_usd), 0) as spent
       from spend_events
      where account_id = $1 and created_at >= $2`,
    [accountId, monthStart(now)]
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  return money(row?.spent);
}

/**
 * Check the month before any model call.
 * Returns false after writing the 429. A check that cannot be read is logged
 * and the request is allowed, so a ledger outage does not stop the product.
 */
export async function beginBillableRequest(res, account) {
  if (account?.accountId === LOCAL_DEVELOPMENT_ACCOUNT_ID) return true;
  const on = authMode() === "on";
  const admin = emailIsAdmin(account?.email);
  if (on && !admin && account?.accountId) {
    try {
      const sql = getSql();
      const row = await findAccount(sql, account.accountId);
      const allowance = resolveAllowanceUsd(row?.monthly_allowance_usd, process.env.ALLOWANCE_USD_PER_MONTH);
      const spent = await spentThisMonthUsd(sql, account.accountId);
      if (allowanceBlocks({ spent, allowance, isAdmin: false, authOn: true })) {
        res.status(429).json({ error: "allowance_reached", resetsOn: resetsOnIso(new Date()) });
        return false;
      }
    } catch (err) {
      console.error("[spend] allowance was not checked", err?.message || err);
    }
  }
  return true;
}

/** One row for this request. A write failure is logged and does not fail the request. */
export async function endBillableRequest({ sql, account, route, req, authOn, spend } = {}) {
  const recorded = spend && typeof spend === "object"
    ? spend
    : hasRequestSpend()
      ? getLlmSpend()
      : null;
  if (!recorded) return;
  if (!(Number(recorded.calls) > 0) && !hasRequestSpend()) return;
  const on = typeof authOn === "boolean" ? authOn : authMode() === "on";
  const accountId = on && account?.accountId ? account.accountId : !on ? LOCAL_DEVELOPMENT_ACCOUNT_ID : null;
  const reviewId = readReviewId(req);
  const models = Object.keys(recorded.byModel || {}).sort().join(",");
  try {
    const db = sql || getSql();
    if (accountId === LOCAL_DEVELOPMENT_ACCOUNT_ID) {
      await db.query(
        `insert into accounts (id, email, name)
         values ($1, $2, $3)
         on conflict (id) do nothing`,
        [LOCAL_DEVELOPMENT_ACCOUNT_ID, "local-development@localhost", "Local development"]
      );
    }
    await db.query(
      `insert into spend_events (account_id, route, review_id, cost_usd, models)
       values ($1, $2, $3, $4, $5)`,
      [accountId, route, reviewId, money(recorded.costUsd), models || null]
    );
  } catch (err) {
    console.error("[spend] the row was not written", route, err?.message || err);
  }
}
