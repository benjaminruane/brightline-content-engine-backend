import { withCors } from "../lib/http/with-cors.mjs";
import { applyCors } from "../lib/http/frontend-origins.mjs";
import { rememberAccount, requireAccount } from "../lib/auth/require-account.mjs";
import { findAccount, updateHouseStyle, updateStyleChoices } from "../lib/db/accounts.mjs";
import { getSql, respondIfDbFailure } from "../lib/db/client.mjs";
import { choicesFromAccountRow, renderHouseStylePage } from "../lib/style-guide/render.mjs";
import { rowAfterHouseStyleUpdate } from "../lib/style-guide/house-style-update.mjs";

const SAVED = "Saved. New drafts and reviews use this house style.";

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
  if (applyCors(req, res, { methods: "GET,PUT,OPTIONS" })) return;
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  const account = await requireAccount(req, res);
  if (!account) return;
  rememberAccount(account);
  if (req.method !== "GET" && req.method !== "PUT") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!account.accountId) {
    if (req.method === "PUT") {
      console.error("[style] house style was sent without an account and was not saved");
      return res.status(400).json({ error: "sign_in_required" });
    }
    return res.status(200).json(renderHouseStylePage(null));
  }

  let sql;
  try {
    sql = getSql();
  } catch (err) {
    if (respondIfDbFailure(res, err)) return;
    throw err;
  }

  try {
    const row = await findAccount(sql, account.accountId);
    if (!row) return res.status(404).json({ error: "not_found" });
    if (req.method === "GET") {
      return res.status(200).json(renderHouseStylePage(choicesFromAccountRow(row)));
    }
    const applied = rowAfterHouseStyleUpdate(row, readJsonBody(req));
    if (!applied.ok) return res.status(400).json({ error: applied.error, field: applied.field || null });
    await updateHouseStyle(sql, {
      id: account.accountId,
      spelling: applied.choices.spelling,
      thousands: applied.choices.thousands,
    });
    const saved = await updateStyleChoices(sql, {
      id: account.accountId,
      styleChoices: applied.choices,
    });
    if (!saved) return res.status(404).json({ error: "not_found" });
    return res.status(200).json({ ...renderHouseStylePage(applied.choices), message: SAVED });
  } catch (err) {
    if (respondIfDbFailure(res, err)) return;
    throw err;
  }
}

export default withCors(handler, {});
