import { applyCors } from "../lib/http/frontend-origins.mjs";
import { emailIsAdmin, rememberAccount, requireAccount } from "../lib/auth/require-account.mjs";
import { getSql, respondIfDbFailure } from "../lib/db/client.mjs";
import { presentProblem, reportRouteFailure } from "../lib/problem-events.mjs";

function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

export default async function handler(req, res) {
  if (applyCors(req, res, { methods: "GET,POST,OPTIONS" })) return;
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  const account = await requireAccount(req, res);
  if (!account) return;
  rememberAccount(account);
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!account.accountId) return res.status(401).json({ error: "sign_in_required" });
  if (req.method === "GET" && !emailIsAdmin(account.email)) {
    return res.status(404).json({ error: "not_found" });
  }

  let sql;
  try {
    sql = getSql();
  } catch (err) {
    if (respondIfDbFailure(res, err)) return;
    throw err;
  }

  try {
    if (req.method === "POST") {
      const body = readJsonBody(req);
      const message = typeof body.message === "string" && body.message.trim()
        ? body.message.trim()
        : "frontend crash";
      const result = await reportRouteFailure({
        account,
        route: "frontend",
        req,
        status: Number.isFinite(Number(body.status)) ? Number(body.status) : 0,
        error: message,
        requestId: typeof body.requestId === "string" ? body.requestId : "",
        startedAt: Number.isFinite(Number(body.startedAt)) ? Number(body.startedAt) : null,
        componentStack: typeof body.componentStack === "string" ? body.componentStack : "",
        sql,
      });
      if (!result.recorded) return res.status(500).json({ error: "problem_not_recorded" });
      return res.status(200).json({ ok: true, id: result.id });
    }

    const rows = await sql.query(
      `select p.id, p.account_id, p.route, p.message, p.request_id, p.status, p.duration_ms,
              p.build, p.version, p.source_count, p.source_sizes, p.component_stack,
              p.emailed_at, p.created_at, a.name as sender_name, a.email as sender_email
         from problem_events p
         left join accounts a on a.id = p.account_id
        order by p.created_at desc`
    );
    return res.status(200).json({
      problems: (Array.isArray(rows) ? rows : []).map(presentProblem),
    });
  } catch (err) {
    if (respondIfDbFailure(res, err)) return;
    console.error("[problem]", err?.message || err);
    return res.status(500).json({ error: "problem_failed" });
  }
}
