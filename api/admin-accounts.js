import { withCors } from "../lib/http/with-cors.mjs";
import { applyCors } from "../lib/http/frontend-origins.mjs";
import { emailIsAdmin, rememberAccount, requireAccount } from "../lib/auth/require-account.mjs";
import { listAccountsForAdmin, normaliseAllowance, setMonthlyAllowance } from "../lib/db/accounts.mjs";
import { getSql, respondIfDbFailure } from "../lib/db/client.mjs";
import { monthStart, resolveAllowanceUsd } from "../lib/spend/allowance.mjs";


function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

function withResolvedAllowance(row) {
  if (emailIsAdmin(row.email)) return { ...row, allowanceUsd: null };
  return {
    ...row,
    allowanceUsd: resolveAllowanceUsd(row.allowanceUsd, process.env.ALLOWANCE_USD_PER_MONTH),
  };
}

async function handler(req, res) {
  if (applyCors(req, res, { methods: "GET,PUT,OPTIONS" })) return;
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  const account = await requireAccount(req, res);
  if (!account) return;
  rememberAccount(account);
  if (req.method !== "GET" && req.method !== "PUT") return res.status(405).json({ error: "Method not allowed" });
  if (!emailIsAdmin(account.email)) return res.status(404).json({ error: "not_found" });

  let sql;
  try {
    sql = getSql();
  } catch (err) {
    if (respondIfDbFailure(res, err)) return;
    throw err;
  }
  try {
    if (req.method === "PUT") {
      const body = readJsonBody(req);
      const accountId = typeof body.accountId === "string" ? body.accountId.trim() : "";
      if (!accountId) return res.status(400).json({ error: "invalid_allowance" });
      let monthlyAllowanceUsd;
      try {
        monthlyAllowanceUsd = normaliseAllowance(body.monthlyAllowanceUsd);
      } catch (err) {
        if (err?.code === "invalid_allowance") return res.status(400).json({ error: "invalid_allowance" });
        throw err;
      }
      const saved = await setMonthlyAllowance(sql, { id: accountId, monthlyAllowanceUsd });
      if (!saved) return res.status(404).json({ error: "not_found" });
      return res.status(200).json({ ok: true, accountId, monthlyAllowanceUsd });
    }
    const accounts = (await listAccountsForAdmin(sql, monthStart(new Date()))).map(withResolvedAllowance);
    return res.status(200).json({ accounts });
  } catch (err) {
    if (respondIfDbFailure(res, err)) return;
    throw err;
  }
}

export default withCors(handler, {});
