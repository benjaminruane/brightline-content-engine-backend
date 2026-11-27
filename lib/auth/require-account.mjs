import { AsyncLocalStorage } from "node:async_hooks";
import { getSql, respondIfDbFailure } from "../db/client.mjs";
import { maybeSendSignupAlert } from "../account-alerts.mjs";
import {
  accountEnvironment,
  claimProfileRefresh,
  findAccount,
  nonEmptyProfileValue,
  profileRefreshDue,
  PROFILE_REFRESH_MS,
  rememberSeenAccount,
  updateAccountIdentity,
} from "../db/accounts.mjs";
import { partiesForOrigin } from "../http/frontend-origins.mjs";

const accountStore = new AsyncLocalStorage();
const HOUR_MS = 60 * 60 * 1000;
let sessionReaderForTests = null;
let clerkProfileReaderForTests = null;

export function authMode() {
  return process.env.AUTH_MODE === "on" ? "on" : "off";
}

export function currentAccountId() {
  const id = accountStore.getStore()?.accountId;
  return typeof id === "string" && id ? id : null;
}

/** Call in the route, after await, so later model traces see the account. */
export function rememberAccount(account) {
  if (typeof account?.accountId === "string" && account.accountId) {
    accountStore.enterWith({ accountId: account.accountId });
  }
}

export function setSessionReaderForTests(reader) {
  sessionReaderForTests = typeof reader === "function" ? reader : null;
}

export function setClerkProfileReaderForTests(reader) {
  clerkProfileReaderForTests = typeof reader === "function" ? reader : null;
}

export function emailIsAdmin(email) {
  const raw = typeof process.env.ADMIN_EMAILS === "string" ? process.env.ADMIN_EMAILS : "";
  const wanted = raw.split(",").map((part) => part.trim().toLowerCase()).filter(Boolean);
  const mine = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!mine || wanted.length === 0) return false;
  return wanted.includes(mine);
}

function bearerToken(req) {
  const raw = req?.headers?.authorization || req?.headers?.Authorization || "";
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return "";
  const match = /^Bearer\s+(\S+)\s*$/i.exec(value.trim());
  return match ? match[1] : "";
}

function clerkSecret() {
  return typeof process.env.CLERK_SECRET_KEY === "string" ? process.env.CLERK_SECRET_KEY.trim() : "";
}

async function readClerkProfile(accountId) {
  if (clerkProfileReaderForTests) return clerkProfileReaderForTests(accountId);
  return profileFromClerk(accountId, clerkSecret());
}

async function profileFromClerk(accountId, secret) {
  const { createClerkClient } = await import("@clerk/backend");
  const client = createClerkClient({ secretKey: secret });
  const user = await client.users.getUser(accountId);
  const emails = Array.isArray(user?.emailAddresses) ? user.emailAddresses : [];
  const primary = emails.find((row) => row?.id === user?.primaryEmailAddressId) || emails[0];
  const email = typeof primary?.emailAddress === "string" ? primary.emailAddress : null;
  const parts = [user?.firstName, user?.lastName].filter((part) => typeof part === "string" && part.trim());
  const name = parts.length > 0 ? parts.map((part) => part.trim()).join(" ") : null;
  if (!email) console.error("[auth] Clerk account has no email", accountId);
  return { email, name };
}

function requestOrigin(req) {
  const raw = req?.headers?.origin || req?.headers?.Origin || "";
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" ? value.trim() : "";
}

async function readVerifiedSession(token, req) {
  if (sessionReaderForTests) return sessionReaderForTests(token);
  const secret = clerkSecret();
  if (!secret) {
    const err = new Error("auth: CLERK_SECRET_KEY is missing");
    err.code = "CLERK_SECRET_MISSING";
    throw err;
  }
  const { verifyToken } = await import("@clerk/backend");
  let payload;
  try {
    payload = await verifyToken(token, {
      secretKey: secret,
      authorizedParties: partiesForOrigin(requestOrigin(req)),
    });
  } catch (err) {
    console.warn("[auth] session was not accepted", err?.message || err);
    return null;
  }
  const accountId = typeof payload?.sub === "string" ? payload.sub.trim() : "";
  if (!accountId) return null;
  return { accountId };
}

export async function getAccount(req) {
  const token = bearerToken(req);
  if (!token) return null;
  const session = await readVerifiedSession(token, req);
  if (!session?.accountId) return null;
  const sql = getSql();
  const existing = await findAccount(sql, session.accountId);
  let email = session.email ?? null;
  let name = session.name ?? null;
  if (!existing && !sessionReaderForTests) {
    const profile = await readClerkProfile(session.accountId);
    email = profile.email;
    name = profile.name;
  }
  const row = await rememberSeenAccount(sql, {
    id: session.accountId,
    email,
    name,
    now: Date.now(),
    hourMs: HOUR_MS,
    createdEnvironment: accountEnvironment(),
  });
  // B619. New account row: claim and email Ben once. Failures never block sign-in.
  if (!existing) {
    try {
      await maybeSendSignupAlert(sql, {
        id: row?.id || session.accountId,
        email: row?.email ?? email ?? null,
        name: row?.name ?? name ?? null,
      });
    } catch (err) {
      console.warn("[auth] signup alert failed", err?.message || err);
    }
  }
  const refreshed = await refreshProfileIfDue(sql, existing, row);
  return {
    accountId: refreshed.id,
    email: refreshed.email ?? null,
    name: refreshed.name ?? null,
  };
}

/**
 * At most one Clerk read per account per day. A failure is logged and the
 * request keeps the stored name. Preview uses the same secret as this process,
 * which is the development instance on preview deployments.
 */
async function refreshProfileIfDue(sql, existing, row) {
  if (!existing) return row;
  if (!profileRefreshDue(existing.profile_refreshed_at, Date.now(), PROFILE_REFRESH_MS)) return row;
  let claimed = false;
  try {
    claimed = await claimProfileRefresh(sql, existing.id);
    if (!claimed) return row;
    const profile = await readClerkProfile(existing.id);
    const email = nonEmptyProfileValue(profile?.email);
    const name = nonEmptyProfileValue(profile?.name);
    if (!email && !name) return row;
    const updated = await updateAccountIdentity(sql, { id: existing.id, email, name });
    if (!updated) return row;
    return { ...row, email: updated.email ?? row.email, name: updated.name ?? row.name };
  } catch (err) {
    console.error("[auth] profile refresh failed", existing.id, claimed ? "after the daily claim" : "before the daily claim", err?.message || err);
    return row;
  }
}

export async function requireAccount(req, res) {
  if (authMode() !== "on") return { accountId: null };
  try {
    const account = await getAccount(req);
    if (!account) {
      res.status(401).json({ error: "sign_in_required" });
      return null;
    }
    req.brightlineAccount = account;
    return account;
  } catch (err) {
    if (err?.code === "CLERK_SECRET_MISSING") {
      console.error(err.message);
      res.status(500).json({ error: "sign_in_unavailable" });
      return null;
    }
    if (respondIfDbFailure(res, err)) return null;
    console.error("[auth] account lookup failed", err?.message || err);
    res.status(500).json({ error: "sign_in_unavailable" });
    return null;
  }
}
