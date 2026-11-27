import { withCors } from "../lib/http/with-cors.mjs";
import { applyCors } from "../lib/http/frontend-origins.mjs";
import { maybeSendFirstReviewAlert } from "../lib/account-alerts.mjs";
import { authMode, rememberAccount, requireAccount } from "../lib/auth/require-account.mjs";
import { getSql, respondIfDbFailure } from "../lib/db/client.mjs";
import {
  MAX_STATE_BYTES,
  deleteReviewState,
  loadReviewState,
  saveReviewState,
  validateOwnerKey,
  validateReviewId,
} from "../lib/db/review-state.mjs";
import { stateWithStoredSourceText } from "../lib/persist-source-text.mjs";

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

async function handler(req, res) {
  if (applyCors(req, res, { methods: "GET,POST,DELETE,OPTIONS", headers: ["x-brightline-diag"] })) return;
  res.setHeader("Cache-Control", "private, no-store");
  console.log(
    `[review-state] ${req.method} db=${process.env.DATABASE_URL ? "configured" : "UNSET"}`
  );

  const account = await requireAccount(req, res);
  if (!account) return;
  rememberAccount(account);
  if (req.method !== "GET" && req.method !== "POST" && req.method !== "DELETE") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const scopedAccountId = authMode() === "on" ? account.accountId : null;

  const ownerKey = headerOwnerKey(req);
  if (!validateOwnerKey(ownerKey)) {
    return res.status(400).json({ error: "invalid_owner_key" });
  }

  const body = req.method === "POST" ? readJsonBody(req) : {};
  const reviewId =
    req.method === "POST"
      ? body.reviewId
      : readQueryValue(req.query?.reviewId);

  if (!validateReviewId(reviewId)) {
    return res.status(400).json({ error: "invalid_review_id" });
  }

  let sql;
  try {
    sql = getSql();
  } catch (err) {
    if (respondIfDbFailure(res, err)) return;
    throw err;
  }

  try {
    if (req.method === "GET") {
      const result = await loadReviewState(sql, { reviewId, ownerKey, accountId: scopedAccountId });
      if (!result) {
        return res.status(200).json({ reviewId, state: null, updatedAt: null });
      }
      if (result.ok === false && result.reason === "not_found") {
        return res.status(404).json({ error: "not_found" });
      }
      if (result.ok === false && result.reason === "owner_mismatch") {
        return res.status(403).json({ error: "owner_mismatch" });
      }
      return res.status(200).json({
        reviewId: result.reviewId,
        state: result.state,
        updatedAt: toIso(result.updatedAt),
      });
    }

    if (req.method === "POST") {
      const state = await stateWithStoredSourceText(body.state);
      const result = await saveReviewState(sql, {
        reviewId,
        ownerKey,
        state,
        accountId: scopedAccountId,
      });
      if (result.ok === false && result.reason === "too_large") {
        return res.status(413).json({
          error: "state_too_large",
          bytes: result.bytes,
          limit: MAX_STATE_BYTES,
        });
      }
      if (result.ok === false && result.reason === "not_found") {
        return res.status(404).json({ error: "not_found" });
      }
      if (result.ok === false && result.reason === "owner_mismatch") {
        return res.status(403).json({ error: "owner_mismatch" });
      }
      // B619. First completed review for this account emails Ben once.
      if (scopedAccountId && result.ok !== false) {
        try {
          await maybeSendFirstReviewAlert(sql, {
            id: scopedAccountId,
            email: account.email ?? null,
            name: account.name ?? null,
            state,
            reviewId,
          });
        } catch (err) {
          console.warn("[review-state] first review alert failed", err?.message || err);
        }
      }
      return res.status(200).json({
        reviewId: result.reviewId,
        updatedAt: toIso(result.updatedAt),
      });
    }

    const result = await deleteReviewState(sql, { reviewId, ownerKey, accountId: scopedAccountId });
    if (result.ok === false && result.reason === "not_found") {
      return res.status(404).json({ error: "not_found" });
    }
    if (result.ok === false && result.reason === "owner_mismatch") {
      return res.status(403).json({ error: "owner_mismatch" });
    }
    return res.status(204).end();
  } catch (err) {
    if (respondIfDbFailure(res, err)) return;
    throw err;
  }
}

export default withCors(handler, {});
