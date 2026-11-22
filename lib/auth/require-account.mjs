import { AsyncLocalStorage } from "node:async_hooks";
import { getSql, respondIfDbFailure } from "../db/client.mjs";
import { accountEnvironment, findAccount, rememberSeenAccount } from "../db/accounts.mjs";
import { partiesForOrigin } from "../http/frontend-origins.mjs";

const accountStore = new AsyncLocalStorage();
const HOUR_MS = 60 * 60 * 1000;
let sessionReaderForTests = null;

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
    const profile = await profileFromClerk(session.accountId, clerkSecret());
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
  return {
    accountId: row.id,
    email: row.email ?? null,
    name: row.name ?? null,
  };
}

export async function requireAccount(req, res) {
  if (authMode() !== "on") return { accountId: null };
  try {
    const account = await getAccount(req);
    if (!account) {
      res.status(401).json({ error: "sign_in_required" });
      return null;
    }
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
