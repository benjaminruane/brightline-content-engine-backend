import { withCors } from "../lib/http/with-cors.mjs";
import { applyCors } from "../lib/http/frontend-origins.mjs";
import { emailIsAdmin, rememberAccount, requireAccount } from "../lib/auth/require-account.mjs";
import { dismissFeedbackBanner, feedbackNotice, findAccount, normaliseWritingFor, problemNotice, updateHouseStyle, updateStyleChoices, updateWritingFor } from "../lib/db/accounts.mjs";
import { houseStyleForRow, normaliseHouseStyle } from "../lib/house-style-choice.mjs";
import { choicesFromAccountRow, normaliseBannedWords, renderHouseRulesView } from "../lib/style-guide/render.mjs";
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
  const houseStyle = houseStyleForRow(row, admin);
  const choices = choicesFromAccountRow({ ...(row || {}), ...houseStyle });
  const guide = renderHouseRulesView(choices);
  let notice = null;
  let problems = null;
  if (admin && sql && fallback?.accountId) {
    const closedAt = row?.feedback_banner_closed_at ?? null;
    notice = await feedbackNotice(sql, closedAt);
    problems = await problemNotice(sql, closedAt);
  }
  return {
    name,
    email,
    writingFor: row?.writing_for ?? null,
    spelling: houseStyle.spelling,
    thousands: houseStyle.thousands,
    bannedWords: choices.bannedWords,
    styleChoices: choices,
    styleGuide: guide,
    feedbackNotice: notice,
    problemNotice: problems,
    isAdmin: admin,
    allowanceUsd: allowance,
    spentThisMonthUsd: spent,
    usedFraction: admin ? null : usedFraction(spent, allowance),
    resetsOn: resetsOnIso(new Date()),
  };
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
      const body = readJsonBody(req);
      if (body.dismissFeedbackBanner === true) {
        const saved = await dismissFeedbackBanner(sql, account.accountId);
        if (!saved) return res.status(404).json({ error: "not_found" });
        return res.status(200).json(await publicAccount(sql, saved, account));
      }
      let saved = null;
      if (Object.prototype.hasOwnProperty.call(body, "writingFor")) {
        let writingFor;
        try {
          writingFor = normaliseWritingFor(body.writingFor);
        } catch (err) {
          if (err?.code === "invalid_writing_for") return res.status(400).json({ error: "invalid_writing_for" });
          throw err;
        }
        saved = await updateWritingFor(sql, { id: account.accountId, writingFor });
      }
      if (body.spelling != null || body.thousands != null) {
        let choice;
        try {
          choice = normaliseHouseStyle({ spelling: body.spelling, thousands: body.thousands });
        } catch (err) {
          return res.status(400).json({ error: "invalid_house_style" });
        }
        if (!choice) return res.status(400).json({ error: "invalid_house_style" });
        saved = await updateHouseStyle(sql, { id: account.accountId, spelling: choice.spelling, thousands: choice.thousands });
      }
      if (Array.isArray(body.bannedWords) || (body.styleChoices && typeof body.styleChoices === "object")) {
        const current = saved || await findAccount(sql, account.accountId);
        const existing = choicesFromAccountRow(current || {});
        const nextChoices = {
          ...existing,
          ...(body.styleChoices && typeof body.styleChoices === "object" ? body.styleChoices : {}),
        };
        if (Array.isArray(body.bannedWords)) nextChoices.bannedWords = normaliseBannedWords(body.bannedWords);
        saved = await updateStyleChoices(sql, { id: account.accountId, styleChoices: nextChoices });
      }
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

export default withCors(handler, {});
