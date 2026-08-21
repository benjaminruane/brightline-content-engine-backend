import { getSql } from "../lib/db/client.mjs";
import {
  MAX_STATE_BYTES,
  deleteReviewState,
  loadReviewState,
  saveReviewState,
  validateOwnerKey,
  validateReviewId,
} from "../lib/db/review-state.mjs";

export const REVIEW_STATE_PRODUCTION_ORIGIN =
  "https://brightline-content-engine-frontend.vercel.app";

// Localhost CORS is a deliberate loosening for local development. Revisit when user accounts arrive.
const LOCAL_DEV_ORIGIN_RE = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;

export function resolveReviewStateCorsOrigin(requestOrigin) {
  const origin = Array.isArray(requestOrigin) ? requestOrigin[0] : requestOrigin;
  if (origin === REVIEW_STATE_PRODUCTION_ORIGIN) return origin;
  if (typeof origin === "string" && LOCAL_DEV_ORIGIN_RE.test(origin)) return origin;
  return REVIEW_STATE_PRODUCTION_ORIGIN;
}

function setCorsHeaders(req, res) {
  res.setHeader("Access-Control-Allow-Origin", resolveReviewStateCorsOrigin(req.headers?.origin));
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-brightline-diag, x-owner-key");
  res.setHeader("Access-Control-Max-Age", "86400");
}

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

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  res.setHeader("Cache-Control", "private, no-store");
  console.log(
    `[review-state] ${req.method} db=${process.env.DATABASE_URL ? "configured" : "UNSET"}`
  );

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET" && req.method !== "POST" && req.method !== "DELETE") {
    return res.status(405).json({ error: "Method not allowed" });
  }

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
    if (err?.code === "DB_NOT_CONFIGURED") {
      return res.status(503).json({ error: "db_not_configured" });
    }
    throw err;
  }

  if (req.method === "GET") {
    const result = await loadReviewState(sql, { reviewId, ownerKey });
    if (!result) return res.status(404).json({ error: "not_found" });
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
    const result = await saveReviewState(sql, {
      reviewId,
      ownerKey,
      state: body.state,
    });
    if (result.ok === false && result.reason === "too_large") {
      return res.status(413).json({
        error: "state_too_large",
        bytes: result.bytes,
        limit: MAX_STATE_BYTES,
      });
    }
    if (result.ok === false && result.reason === "owner_mismatch") {
      return res.status(403).json({ error: "owner_mismatch" });
    }
    return res.status(200).json({
      reviewId: result.reviewId,
      updatedAt: toIso(result.updatedAt),
    });
  }

  const result = await deleteReviewState(sql, { reviewId, ownerKey });
  if (result.ok === false && result.reason === "owner_mismatch") {
    return res.status(403).json({ error: "owner_mismatch" });
  }
  return res.status(204).end();
}
