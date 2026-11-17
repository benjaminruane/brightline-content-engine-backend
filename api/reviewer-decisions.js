import { applyCors } from "../lib/http/frontend-origins.mjs";
import { authMode, rememberAccount, requireAccount } from "../lib/auth/require-account.mjs";
import { getSql, respondIfDbFailure } from "../lib/db/client.mjs";
import { loadReviewState, validateOwnerKey, validateReviewId } from "../lib/db/review-state.mjs";
import {
  insertReviewerDecision,
  isDecisionKind,
  listReviewerDecisions,
} from "../lib/db/reviewer-decisions.mjs";


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

function readQueryValue(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function toIso(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return null;
}

function headerOwnerKey(req) {
  const raw = req.headers?.["x-owner-key"];
  if (Array.isArray(raw)) return raw[0];
  return typeof raw === "string" ? raw : "";
}

function isPlainPayload(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toPublicRow(row) {
  return {
    id: row.id,
    reviewId: row.review_id ?? row.reviewId,
    decidedAt: toIso(row.decided_at ?? row.decidedAt),
    kind: row.kind,
    draftHash: row.draft_hash ?? row.draftHash ?? null,
    statement: row.statement ?? null,
    payload: row.payload,
  };
}

export default async function handler(req, res) {
  if (applyCors(req, res, { methods: "GET,POST,OPTIONS", headers: ["x-brightline-diag"] })) return;
  res.setHeader("Cache-Control", "private, no-store");
  console.log(
    `[reviewer-decisions] ${req.method} db=${process.env.DATABASE_URL ? "configured" : "UNSET"}`
  );

  if (req.method === "OPTIONS") return res.status(204).end();
  const account = await requireAccount(req, res);
  if (!account) return;
  rememberAccount(account);
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const scopedAccountId = authMode() === "on" ? account.accountId : null;

  const ownerKey = headerOwnerKey(req);
  if (!validateOwnerKey(ownerKey)) {
    return res.status(400).json({ error: "invalid_owner_key" });
  }

  const body = req.method === "POST" ? readJsonBody(req) : {};
  const reviewId =
    req.method === "POST" ? body.reviewId : readQueryValue(req.query?.reviewId);

  if (!validateReviewId(reviewId)) {
    return res.status(400).json({ error: "invalid_review_id" });
  }

  if (req.method === "POST") {
    if (!isDecisionKind(body.kind)) {
      return res.status(400).json({ error: "invalid_kind" });
    }
    if (!isPlainPayload(body.payload)) {
      return res.status(400).json({ error: "invalid_payload" });
    }
  }

  let sql;
  try {
    sql = getSql();
  } catch (err) {
    if (respondIfDbFailure(res, err)) return;
    throw err;
  }

  try {
    if (scopedAccountId) {
      const visible = await loadReviewState(sql, { reviewId, ownerKey, accountId: scopedAccountId });
      if (visible && visible.ok === false) return res.status(404).json({ error: "not_found" });
    }
    if (req.method === "GET") {
      const rows = await listReviewerDecisions(sql, { reviewId, ownerKey, accountId: scopedAccountId });
      return res.status(200).json({ rows: rows.map(toPublicRow) });
    }

    const result = await insertReviewerDecision(sql, {
      ownerKey,
      reviewId,
      kind: body.kind,
      draftHash: body.draftHash,
      statement: body.statement,
      payload: body.payload,
      accountId: scopedAccountId,
    });
    return res.status(200).json({ ok: true, id: result.id });
  } catch (err) {
    if (respondIfDbFailure(res, err)) return;
    throw err;
  }
}
