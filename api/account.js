import { applyCors } from "../lib/http/frontend-origins.mjs";
import { emailIsAdmin, rememberAccount, requireAccount } from "../lib/auth/require-account.mjs";
import { findAccount, normaliseWritingFor, updateWritingFor } from "../lib/db/accounts.mjs";
import { getSql, respondIfDbFailure } from "../lib/db/client.mjs";
import { resetsOnIso, resolveAllowanceUsd, usedFraction } from "../lib/spend/allowance.mjs";
import { spentThisMonthUsd } from "../lib/spend/ledger.mjs";


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

async function publicAccount(sql, row, fallback) {
  const email = row?.email ?? fallback?.email ?? null;
  const name = row?.name ?? fallback?.name ?? null;
  const admin = emailIsAdmin(email);
  const spent = fallback?.accountId ? await spentThisMonthUsd(sql, fallback.accountId) : 0;
  const allowance = admin ? null : resolveAllowanceUsd(row?.monthly_allowance_usd, process.env.ALLOWANCE_USD_PER_MONTH);
  return {
    name,
    email,
    writingFor: row?.writing_for ?? null,
    isAdmin: admin,
    allowanceUsd: allowance,
    spentThisMonthUsd: spent,
    usedFraction: admin ? null : usedFraction(spent, allowance),
    resetsOn: resetsOnIso(new Date()),
  };
}

export default async function handler(req, res) {
  if (applyCors(req, res, { methods: "GET,PUT,OPTIONS" })) return;
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  const account = await requireAccount(req, res);
  if (!account) return;
  rememberAccount(account);
  if (req.method !== "GET" && req.method !== "PUT") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!account.accountId) return res.status(200).json(await publicAccount(null, null, account));

  let sql;
  try {
    sql = getSql();
  } catch (err) {
    if (respondIfDbFailure(res, err)) return;
    throw err;
  }

  try {
    if (req.method === "PUT") {
      let writingFor;
      try {
        writingFor = normaliseWritingFor(readJsonBody(req).writingFor);
      } catch (err) {
        if (err?.code === "invalid_writing_for") return res.status(400).json({ error: "invalid_writing_for" });
        throw err;
      }
      const saved = await updateWritingFor(sql, { id: account.accountId, writingFor });
      if (!saved) return res.status(404).json({ error: "not_found" });
      return res.status(200).json(await publicAccount(sql, saved, account));
    }
    const row = await findAccount(sql, account.accountId);
    return res.status(200).json(await publicAccount(sql, row, account));
  } catch (err) {
    if (respondIfDbFailure(res, err)) return;
    throw err;
  }
}
