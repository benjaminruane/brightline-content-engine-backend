import { emailIsAdmin, rememberAccount, requireAccount } from "../lib/auth/require-account.mjs";
import { findAccount, normaliseWritingFor, updateWritingFor } from "../lib/db/accounts.mjs";
import { getSql, respondIfDbFailure } from "../lib/db/client.mjs";
import { resolveReviewStateCorsOrigin } from "./review-state.js";

function setCorsHeaders(req, res) {
  res.setHeader("Access-Control-Allow-Origin", resolveReviewStateCorsOrigin(req.headers?.origin));
  res.setHeader("Access-Control-Allow-Methods", "GET,PUT,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-owner-key");
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

function publicAccount(row, fallback) {
  const email = row?.email ?? fallback?.email ?? null;
  const name = row?.name ?? fallback?.name ?? null;
  return {
    name,
    email,
    writingFor: row?.writing_for ?? null,
    isAdmin: emailIsAdmin(email),
  };
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  const account = await requireAccount(req, res);
  if (!account) return;
  rememberAccount(account);
  if (req.method !== "GET" && req.method !== "PUT") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!account.accountId) return res.status(200).json(publicAccount(null, account));

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
      return res.status(200).json(publicAccount(saved, account));
    }
    const row = await findAccount(sql, account.accountId);
    return res.status(200).json(publicAccount(row, account));
  } catch (err) {
    if (respondIfDbFailure(res, err)) return;
    throw err;
  }
}
