/**
 * B576. A client report with no start time is stored. Unread problems
 * drive the notice. A missing Resend setting is logged and labelled.
 */
import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import handler from "../api/problem-event.js";
import { problemNotice } from "../lib/db/accounts.mjs";
import { setSqlOverrideForTests } from "../lib/db/client.mjs";
import { setSessionReaderForTests } from "../lib/auth/require-account.mjs";
import {
  EMAIL_NOT_SENT_LABEL,
  FEEDBACK_EMAIL_SKIPPED_LINE,
  PROBLEM_EMAIL_SKIPPED_LINE,
  emailNotSentLabel,
  sendFeedbackEmail,
  sendProblemEmail,
} from "../lib/feedback-email.mjs";
import { presentProblem, reportRouteFailure } from "../lib/problem-events.mjs";

const NONE_READABLE = "None of your sources could be read.";

function exactPayload() {
  return {
    message: NONE_READABLE,
    componentStack: "",
    stack: "",
    status: null,
    requestId: "",
    startedAt: null,
    route: "review",
  };
}

function problemSql() {
  const rows = [];
  let nextId = 1;
  return {
    rows,
    async query(text, params = []) {
      if (text.includes("insert into problem_events")) {
        if (params[5] != null && Number(params[5]) > 2147483647) {
          throw new Error("integer out of range");
        }
        const row = {
          id: nextId,
          account_id: params[0],
          route: params[1],
          message: params[2],
          request_id: params[3],
          status: params[4],
          duration_ms: params[5],
          build: params[6],
          version: params[7],
          source_count: params[8],
          source_sizes: params[9],
          component_stack: params[10],
          emailed_at: params[11],
          email_skip: params[12] ?? null,
          read_at: null,
          created_at: new Date(Date.now() + nextId).toISOString(),
          sender_name: "Ada",
          sender_email: "ada@example.com",
        };
        nextId += 1;
        rows.push(row);
        return [row];
      }
      if (text.includes("emailed_at is not null")) return [];
      if (text.includes("set read_at") && text.includes("read_at is null")) {
        const marked = [];
        for (const row of rows) {
          if (row.read_at == null) {
            row.read_at = "2026-11-23T10:00:00.000Z";
            marked.push({ id: row.id });
          }
        }
        return marked;
      }
      if (text.includes("set read_at")) {
        const row = rows.find((item) => String(item.id) === String(params[0]));
        if (!row) return [];
        row.read_at = "2026-11-23T10:00:00.000Z";
        return [{ id: row.id, read_at: row.read_at }];
      }
      if (text.includes("from accounts") || text.includes("into accounts") || text.includes("update accounts")) {
        return [{
          id: params[0] || "user_ada",
          email: "ada@example.com",
          name: "Ada",
          writing_for: null,
          spelling: "US",
          thousands: "comma",
          feedback_banner_closed_at: null,
          style_choices: null,
          created_environment: null,
          monthly_allowance_usd: null,
          created_at: new Date().toISOString(),
          last_active_at: new Date().toISOString(),
          profile_refreshed_at: new Date().toISOString(),
        }];
      }
      if (text.includes("from problem_events")) {
        return rows
          .filter((row) => row.read_at == null)
          .map((row) => ({ created_at: row.created_at, name: "Ada", email: "ada@example.com" }));
      }
      return [];
    },
  };
}

function createRes() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end() {
      return this;
    },
  };
}

function restoreEnv(saved) {
  for (const [name, value] of Object.entries(saved)) {
    if (value == null) delete process.env[name];
    else process.env[name] = value;
  }
}

afterEach(() => {
  setSqlOverrideForTests(null);
  setSessionReaderForTests(null);
  vi.unstubAllEnvs();
});

test("the pre-request review payload is stored with route review and status null", async () => {
  const sql = problemSql();
  setSqlOverrideForTests(sql);
  setSessionReaderForTests(() => ({ accountId: "user_review", email: "ada@example.com", name: "Ada" }));
  vi.stubEnv("AUTH_MODE", "on");
  const res = createRes();
  await handler({
    method: "POST",
    headers: { authorization: "Bearer test" },
    body: exactPayload(),
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(sql.rows.length, 1);
  assert.equal(sql.rows[0].route, "review");
  assert.equal(sql.rows[0].status, null);
  assert.equal(sql.rows[0].duration_ms, null);
  assert.equal(sql.rows[0].message, NONE_READABLE);

  const previous = createRes();
  await handler({
    method: "POST",
    headers: { authorization: "Bearer test" },
    body: {
      message: "The upload could not be read.",
      componentStack: "",
      stack: "",
      status: 0,
      requestId: "",
      startedAt: null,
      route: "analyse-statements",
    },
  }, previous);
  assert.equal(previous.statusCode, 200);
  assert.equal(sql.rows[1].route, "review");
  assert.equal(sql.rows[1].status, null);
  assert.equal(sql.rows[1].duration_ms, null);
});

test("a failed insert does not turn the next report into a duplicate", async () => {
  let attempts = 0;
  const sql = {
    async query(text) {
      if (text.includes("emailed_at is not null")) return [];
      if (!text.includes("insert into problem_events")) return [];
      attempts += 1;
      if (attempts === 1) throw new Error("integer out of range");
      return [{ id: 7 }];
    },
  };
  const input = {
    account: { accountId: "user_retry", name: "Ada" },
    route: "review",
    error: NONE_READABLE,
    status: null,
    startedAt: null,
    sql,
    now: 10_000,
  };
  const first = await reportRouteFailure(input);
  const second = await reportRouteFailure(input);
  assert.equal(first.recorded, false);
  assert.equal(first.reason, "not_recorded");
  assert.equal(second.recorded, true);
  assert.equal(second.id, 7);
});

test("unread problems drive the notice, and mark read clears it", async () => {
  const sql = problemSql();
  setSqlOverrideForTests(sql);
  setSessionReaderForTests(() => ({ accountId: "user_notice", email: "ada@example.com", name: "Ada" }));
  vi.stubEnv("AUTH_MODE", "on");
  vi.stubEnv("ADMIN_EMAILS", "ada@example.com");
  const posted = createRes();
  await handler({
    method: "POST",
    headers: { authorization: "Bearer test" },
    body: exactPayload(),
  }, posted);
  assert.equal(posted.statusCode, 200);
  const before = await problemNotice(sql, null);
  assert.equal(before.count, 1);
  assert.equal(before.fromName, "Ada");

  const one = createRes();
  await handler({
    method: "PUT",
    headers: { authorization: "Bearer test" },
    body: { id: sql.rows[0].id, read: true },
  }, one);
  assert.equal(one.statusCode, 200);
  assert.equal((await problemNotice(sql, null)).count, 0);

  await handler({
    method: "POST",
    headers: { authorization: "Bearer test" },
    body: { ...exactPayload(), message: "Generate stopped." },
  }, createRes());
  await handler({
    method: "POST",
    headers: { authorization: "Bearer test" },
    body: { ...exactPayload(), message: "Rewrite stopped.", route: "rewrite" },
  }, createRes());
  assert.equal((await problemNotice(sql, null)).count, 2);
  const all = createRes();
  await handler({
    method: "PUT",
    headers: { authorization: "Bearer test" },
    body: { readAll: true },
  }, all);
  assert.equal(all.statusCode, 200);
  assert.equal(all.body.marked, 2);
  assert.equal((await problemNotice(sql, null)).count, 0);
});

test("missing Resend settings log one line and label the item", async () => {
  const saved = {
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    FEEDBACK_EMAIL_FROM: process.env.FEEDBACK_EMAIL_FROM,
    FEEDBACK_EMAIL_TO: process.env.FEEDBACK_EMAIL_TO,
  };
  delete process.env.RESEND_API_KEY;
  delete process.env.FEEDBACK_EMAIL_FROM;
  delete process.env.FEEDBACK_EMAIL_TO;
  const lines = [];
  const original = console.log;
  console.log = (...args) => {
    lines.push(args.map((item) => String(item)).join(" "));
  };
  try {
    const problem = await sendProblemEmail({ force: true, name: "Ada", route: "review", message: NONE_READABLE });
    const feedback = await sendFeedbackEmail({ force: true, comment: "The counts were hard to read." });
    assert.equal(problem.sent, false);
    assert.equal(problem.reason, "not_configured");
    assert.equal(feedback.sent, false);
    assert.equal(feedback.reason, "not_configured");
    assert.equal(lines.filter((line) => line === PROBLEM_EMAIL_SKIPPED_LINE).length, 1);
    assert.equal(lines.filter((line) => line === FEEDBACK_EMAIL_SKIPPED_LINE).length, 1);

    const sql = problemSql();
    const stored = await reportRouteFailure({
      account: { accountId: "user_email", name: "Ada" },
      route: "review",
      status: null,
      error: "Generate failed before the email check.",
      startedAt: null,
      now: 20_000,
      sql,
      forceEmail: true,
      fetchImpl: async () => {
        throw new Error("email should not be sent");
      },
    });
    assert.equal(stored.recorded, true);
    assert.equal(stored.emailed, false);
    assert.equal(sql.rows[0].email_skip, "settings");
    assert.equal(sql.rows[0].emailed_at, null);
    const item = presentProblem(sql.rows[0]);
    assert.equal(emailNotSentLabel(item), EMAIL_NOT_SENT_LABEL);
    assert.equal(item.status, null);
    assert.equal(item.route, "review");
  } finally {
    console.log = original;
    restoreEnv(saved);
  }
});
