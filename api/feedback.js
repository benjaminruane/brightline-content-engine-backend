import { withCors } from "../lib/http/with-cors.mjs";
import { applyCors } from "../lib/http/frontend-origins.mjs";
import { emailIsAdmin, rememberAccount, requireAccount } from "../lib/auth/require-account.mjs";
import { dismissFeedbackBanner, findAccount } from "../lib/db/accounts.mjs";
import { getSql, respondIfDbFailure } from "../lib/db/client.mjs";
import { prepareDiagnostics } from "../lib/feedback-diagnostics.mjs";
import { sendFeedbackEmail } from "../lib/feedback-email.mjs";

const COMMENT_MAX = 5000;
const DRAFT_MAX = 20000;

function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

function present(row) {
  return {
    id: row.id,
    accountId: row.account_id,
    comment: row.comment,
    meta: row.meta ?? null,
    draftSnapshot: row.draft_snapshot ?? null,
    diagnostics: row.diagnostics ?? null,
    createdAt: row.created_at,
    readAt: row.read_at ?? null,
    senderName: row.sender_name ?? null,
    senderEmail: row.sender_email ?? null,
  };
}

async function handler(req, res) {
  if (applyCors(req, res, { methods: "GET,POST,PUT,OPTIONS" })) return;
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  const account = await requireAccount(req, res);
  if (!account) return;
  rememberAccount(account);
  if (req.method !== "GET" && req.method !== "POST" && req.method !== "PUT") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (req.method !== "POST" && !emailIsAdmin(account.email)) {
    return res.status(404).json({ error: "not_found" });
  }
  if (!account.accountId) return res.status(401).json({ error: "sign_in_required" });

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
      const comment = typeof body.comment === "string" ? body.comment.trim() : "";
      if (!comment) return res.status(400).json({ error: "comment_required" });
      if (comment.length > COMMENT_MAX) return res.status(400).json({ error: "comment_too_long" });
      const draft = typeof body.draftSnapshot === "string" ? body.draftSnapshot : "";
      if (draft.length > DRAFT_MAX) return res.status(400).json({ error: "draft_too_long" });
      const meta = body.meta && typeof body.meta === "object" ? body.meta : null;
      const diagnostics = prepareDiagnostics(body.diagnostics);
      const rows = await sql.query(
        `insert into feedback (account_id, comment, meta, draft_snapshot, diagnostics)
         values ($1, $2, $3, $4, $5)
         returning id, account_id, comment, meta, draft_snapshot, diagnostics, created_at, read_at`,
        [account.accountId, comment, meta, draft || null, diagnostics]
      );
      const saved = rows[0];
      try {
        const sender = await findAccount(sql, account.accountId);
        await sendFeedbackEmail({
          senderName: sender?.name || account.name || "",
          senderEmail: sender?.email || account.email || "",
          comment,
          detailsLine: typeof meta?.detailsLine === "string" ? meta.detailsLine : "",
        });
      } catch (err) {
        console.warn("[feedback] email not sent:", err?.message || err);
      }
      return res.status(200).json({ ok: true, feedback: present(saved) });
    }

    if (req.method === "PUT") {
      const body = readJsonBody(req);
      if (body.dismissBanner === true) {
        await dismissFeedbackBanner(sql, account.accountId);
        return res.status(200).json({ ok: true });
      }
      if (body.readAll === true) {
        const rows = await sql.query(
          `update feedback set read_at = now() where read_at is null returning id`
        );
        return res.status(200).json({ ok: true, marked: Array.isArray(rows) ? rows.length : 0 });
      }
      const id = body.id;
      if (id == null || body.read !== true) return res.status(400).json({ error: "invalid_feedback" });
      const rows = await sql.query(
        `update feedback set read_at = now() where id = $1
         returning id, read_at`,
        [id]
      );
      if (!rows[0]) return res.status(404).json({ error: "not_found" });
      return res.status(200).json({ ok: true, id: rows[0].id, readAt: rows[0].read_at });
    }

    const rows = await sql.query(
      `select f.id, f.account_id, f.comment, f.meta, f.draft_snapshot, f.diagnostics, f.created_at, f.read_at,
              a.name as sender_name, a.email as sender_email
       from feedback f
       left join accounts a on a.id = f.account_id
       order by f.created_at desc`
    );
    return res.status(200).json({ feedback: (Array.isArray(rows) ? rows : []).map(present) });
  } catch (err) {
    if (respondIfDbFailure(res, err)) return;
    console.error("[feedback]", err?.message || err);
    return res.status(500).json({ error: "feedback_failed" });
  }
}

export default withCors(handler, {});
