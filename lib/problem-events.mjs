/**
 * B573. A failed signed-in action records a problem. The email is one line,
 * at most once an hour per account, and never includes draft or source text.
 */
import { getSql } from "./db/client.mjs";
import { readBuildIdentity } from "./qc/build-identity.mjs";
import { readReleaseVersion } from "./release-version.mjs";
import { sendProblemEmail } from "./feedback-email.mjs";

export const PROBLEM_EMAIL_GAP_MS = 60 * 60 * 1000;

function requestBody(req) {
  if (req?.body && typeof req.body === "object") return req.body;
  if (typeof req?.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return {};
}

export function sourceSizeRows(sources) {
  if (!Array.isArray(sources)) return [];
  return sources.map((source) => {
    const text = typeof source?.text === "string" ? source.text.length : 0;
    const file = typeof source?.contentBase64 === "string" ? source.contentBase64.length : 0;
    return {
      name: typeof source?.name === "string" ? source.name.slice(0, 160) : "",
      characters: text,
      fileCharacters: file,
    };
  });
}

function requestIdOf(req, explicit) {
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim().slice(0, 200);
  const headers = req?.headers || {};
  const header = headers["x-request-id"] || headers["x-vercel-id"] || headers["x-brightline-rid"] || "";
  const value = req?._brightlineRid || header;
  return String(value || "").slice(0, 200);
}

function durationOf(startedAt, now) {
  const start = Number(startedAt);
  if (!Number.isFinite(start)) return null;
  return Math.max(0, now - start);
}

function sourcesFrom(input, req) {
  if (Array.isArray(input.sources)) return input.sources;
  const body = requestBody(req);
  if (Array.isArray(body.uploadedSources)) return body.uploadedSources;
  if (Array.isArray(body.sources)) return body.sources;
  return [];
}

export function problemEmailDue(lastEmailedAt, now, gapMs = PROBLEM_EMAIL_GAP_MS) {
  if (lastEmailedAt == null || lastEmailedAt === "") return true;
  const ms = new Date(lastEmailedAt).getTime();
  if (!Number.isFinite(ms)) return true;
  return now - ms >= gapMs;
}

/**
 * Records one problem. Never throws. Skips a signed-out caller.
 * Email is skipped when Resend is not configured, and when this account
 * was already emailed inside the last hour.
 */
export async function reportRouteFailure(input = {}) {
  const accountId = typeof input.account?.accountId === "string" ? input.account.accountId : "";
  if (!accountId) return { recorded: false, reason: "no_account" };
  const route = typeof input.route === "string" ? input.route.trim() : "";
  if (!route) console.error("[problem] route is missing");
  const now = Number.isFinite(input.now) ? input.now : Date.now();
  const message = String(input.error?.message || input.error || "failed").replace(/\s+/g, " ").trim().slice(0, 500);
  const sizes = sourceSizeRows(sourcesFrom(input, input.req));
  let version = "";
  try {
    version = readReleaseVersion();
  } catch (err) {
    console.error("[problem] version was not read", err?.message || err);
    version = "unavailable";
  }
  const build = readBuildIdentity().commit;
  try {
    const sql = input.sql || getSql();
    const recent = await sql.query(
      `select emailed_at from problem_events
        where account_id = $1 and emailed_at is not null
        order by emailed_at desc
        limit 1`,
      [accountId]
    );
    const last = Array.isArray(recent) && recent[0] ? recent[0].emailed_at : null;
    const due = problemEmailDue(last, now);
    let emailedAt = null;
    if (due) {
      const sent = await sendProblemEmail({
        force: input.forceEmail === true,
        fetchImpl: input.fetchImpl,
        name: input.account?.name || input.account?.email || "",
        route: route || "unknown",
        message,
        build,
      });
      if (sent?.sent) emailedAt = new Date(now).toISOString();
    }
    const stack = typeof input.componentStack === "string" ? input.componentStack.slice(0, 4000) : null;
    const rows = await sql.query(
      `insert into problem_events (
         account_id, route, message, request_id, status, duration_ms, build, version,
         source_count, source_sizes, component_stack, emailed_at
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       returning id, created_at`,
      [
        accountId,
        route || "unknown",
        message,
        requestIdOf(input.req, input.requestId),
        Number.isFinite(Number(input.status)) ? Number(input.status) : null,
        durationOf(input.startedAt, now),
        build,
        version,
        sizes.length,
        sizes,
        stack,
        emailedAt,
      ]
    );
    return { recorded: true, emailed: Boolean(emailedAt), id: rows?.[0]?.id ?? null };
  } catch (err) {
    console.error("[problem] not recorded", err?.message || err);
    return { recorded: false, reason: "not_recorded" };
  }
}

export function presentProblem(row) {
  return {
    id: row.id,
    accountId: row.account_id,
    route: row.route,
    message: row.message,
    requestId: row.request_id ?? null,
    status: row.status ?? null,
    durationMs: row.duration_ms ?? null,
    build: row.build ?? null,
    version: row.version ?? null,
    sourceCount: row.source_count ?? null,
    sourceSizes: row.source_sizes ?? [],
    componentStack: row.component_stack ?? null,
    emailedAt: row.emailed_at ?? null,
    createdAt: row.created_at,
    senderName: row.sender_name ?? null,
    senderEmail: row.sender_email ?? null,
  };
}
