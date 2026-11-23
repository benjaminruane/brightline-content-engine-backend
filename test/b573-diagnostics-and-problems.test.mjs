/**
 * B573. Diagnostics are capped and scrubbed. A failed review records a problem
 * and emails once an hour. Problems and the download payload are admin only.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, test, vi } from "vitest";
import handler from "../api/problem-event.js";
import { prepareDiagnostics, DIAGNOSTICS_MAX_BYTES } from "../lib/feedback-diagnostics.mjs";
import { problemEmailText } from "../lib/feedback-email.mjs";
import { reportRouteFailure, sourceSizeRows } from "../lib/problem-events.mjs";
import { setSqlOverrideForTests } from "../lib/db/client.mjs";
import { setSessionReaderForTests } from "../lib/auth/require-account.mjs";

function byteLength(text) {
  return new TextEncoder().encode(text).length;
}

function problemSql() {
  const rows = [];
  return {
    rows,
    async query(text, params = []) {
      if (text.includes("insert into problem_events")) {
        const row = {
          id: rows.length + 1,
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
          created_at: new Date().toISOString(),
          sender_name: "Ada",
          sender_email: "ada@example.com",
        };
        rows.push(row);
        return [row];
      }
      if (text.includes("emailed_at is not null")) {
        return rows
          .filter((row) => row.account_id === params[0] && row.emailed_at)
          .sort((a, b) => String(b.emailed_at).localeCompare(String(a.emailed_at)));
      }
      if (text.includes("from problem_events")) {
        return [...rows].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      }
      if (text.includes("from accounts")) {
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

afterEach(() => {
  setSqlOverrideForTests(null);
  setSessionReaderForTests(null);
  vi.unstubAllEnvs();
});

test("diagnostics drop excerpts first, stay under 2 MB, and keep no tokens, cookies or keys", () => {
  const small = prepareDiagnostics({
    review: [{ statement: "Revenue rose.", excerpt: "revenue rose", reason: "Supported." }],
    cookie: "session=abc",
    apiKey: "sk-live-key",
    authorization: "Bearer secret-token",
    note: "Authorization: Bearer secret-token",
  });
  const smallJson = JSON.stringify(small);
  assert.equal(smallJson.includes("session=abc"), false);
  assert.equal(smallJson.includes("sk-live-key"), false);
  assert.equal(smallJson.includes("secret-token"), false);
  assert.equal(small.review[0].excerpt, "revenue rose");
  assert.equal(small.excerptsDropped, undefined);

  const large = prepareDiagnostics({
    review: [{ statement: "Kept.", reason: "because", excerpt: "x".repeat(2_200_000) }],
    events: [{ message: "still here" }],
  });
  assert.equal(large.excerptsDropped, true);
  assert.equal(large.review[0].statement, "Kept.");
  assert.equal(large.review[0].reason, "because");
  assert.equal(Object.prototype.hasOwnProperty.call(large.review[0], "excerpt"), false);
  assert.equal(large.events[0].message, "still here");
  assert.equal(byteLength(JSON.stringify(large)) <= DIAGNOSTICS_MAX_BYTES, true);
});

test("source sizes count characters and do not keep the text", () => {
  const sizes = sourceSizeRows([{ name: "GP.pdf", text: "SECRETSOURCE words", contentBase64: "abcd" }]);
  assert.deepEqual(sizes, [{ name: "GP.pdf", characters: "SECRETSOURCE words".length, fileCharacters: 4 }]);
  assert.equal(JSON.stringify(sizes).includes("SECRETSOURCE"), false);
});

test("a failed review records a problem and emails once an hour", async () => {
  const sql = problemSql();
  const sent = [];
  const saved = {
    key: process.env.RESEND_API_KEY,
    from: process.env.FEEDBACK_EMAIL_FROM,
    to: process.env.FEEDBACK_EMAIL_TO,
  };
  process.env.RESEND_API_KEY = "test-key";
  process.env.FEEDBACK_EMAIL_FROM = "from@example.com";
  process.env.FEEDBACK_EMAIL_TO = "to@example.com";
  const account = { accountId: "user_ada", name: "Ada", email: "ada@example.com" };
  const sources = [{ name: "GP.pdf", text: "SECRETSOURCE words" }];
  const first = await reportRouteFailure({
    account,
    route: "analyse-statements",
    status: 200,
    error: new Error("Review timed out"),
    requestId: "rid-1",
    startedAt: 1_000,
    now: 5_000,
    sources,
    sql,
    forceEmail: true,
    fetchImpl: async (_url, init) => {
      sent.push(JSON.parse(init.body));
      return { ok: true, status: 200 };
    },
  });
  const second = await reportRouteFailure({
    account,
    route: "analyse-statements",
    status: 200,
    error: "Review timed out again",
    requestId: "rid-2",
    startedAt: 1_000,
    now: 5_000 + 30 * 60 * 1000,
    sources,
    sql,
    forceEmail: true,
    fetchImpl: async () => {
      throw new Error("email should not be sent");
    },
  });
  for (const [name, value] of Object.entries({
    RESEND_API_KEY: saved.key,
    FEEDBACK_EMAIL_FROM: saved.from,
    FEEDBACK_EMAIL_TO: saved.to,
  })) {
    if (value == null) delete process.env[name];
    else process.env[name] = value;
  }
  assert.equal(first.recorded, true);
  assert.equal(first.emailed, true);
  assert.equal(second.recorded, true);
  assert.equal(second.emailed, false);
  assert.equal(sql.rows.length, 2);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].text, problemEmailText({
    name: "Ada",
    route: "analyse-statements",
    message: "Review timed out",
    build: sql.rows[0].build,
  }));
  assert.equal(sent[0].text.includes("SECRETSOURCE"), false);
  assert.equal(JSON.stringify(sql.rows).includes("SECRETSOURCE"), false);
  assert.equal(sql.rows[0].source_count, 1);
  assert.equal(sql.rows[0].request_id, "rid-1");
  assert.equal(sql.rows[0].duration_ms, 4000);
  assert.equal(sql.rows[0].status, 200);
  assert.equal(sql.rows[1].emailed_at, null);
  const review = readFileSync(new URL("../api/analyse-statements.js", import.meta.url), "utf8");
  assert.match(review, /reportRouteFailure\(\{[\s\S]*route: "analyse-statements"/);
});

test("a missing Resend setting records the problem and does not email", async () => {
  const sql = problemSql();
  const saved = {
    key: process.env.RESEND_API_KEY,
    from: process.env.FEEDBACK_EMAIL_FROM,
    to: process.env.FEEDBACK_EMAIL_TO,
  };
  delete process.env.RESEND_API_KEY;
  delete process.env.FEEDBACK_EMAIL_FROM;
  delete process.env.FEEDBACK_EMAIL_TO;
  const result = await reportRouteFailure({
    account: { accountId: "user_ada", name: "Ada" },
    route: "generate",
    status: 500,
    error: "Generate failed",
    now: 10_000,
    sql,
    forceEmail: true,
    fetchImpl: async () => {
      throw new Error("email should not be sent");
    },
  });
  for (const [name, value] of Object.entries({
    RESEND_API_KEY: saved.key,
    FEEDBACK_EMAIL_FROM: saved.from,
    FEEDBACK_EMAIL_TO: saved.to,
  })) {
    if (value == null) delete process.env[name];
    else process.env[name] = value;
  }
  assert.equal(result.recorded, true);
  assert.equal(result.emailed, false);
  assert.equal(sql.rows[0].emailed_at, null);
});

test("problems and their details are admin only, and a signed-in crash is recorded", async () => {
  const sql = problemSql();
  setSqlOverrideForTests(sql);
  setSessionReaderForTests(() => ({ accountId: "user_ada", email: "ada@example.com", name: "Ada" }));
  vi.stubEnv("AUTH_MODE", "on");
  vi.stubEnv("ADMIN_EMAILS", "someone-else@example.com");

  const signedOut = createRes();
  await handler({ method: "GET", headers: {} }, signedOut);
  assert.equal(signedOut.statusCode, 401);

  const denied = createRes();
  await handler({ method: "GET", headers: { authorization: "Bearer test" } }, denied);
  assert.equal(denied.statusCode, 404);

  const posted = createRes();
  await handler({
    method: "POST",
    headers: { authorization: "Bearer test" },
    body: { message: "The review pane crashed", componentStack: "in ReviewCard" },
  }, posted);
  assert.equal(posted.statusCode, 200);
  assert.equal(sql.rows.length, 1);
  assert.equal(sql.rows[0].route, "frontend");
  assert.equal(sql.rows[0].component_stack, "in ReviewCard");
  assert.equal(sql.rows[0].message, "The review pane crashed");

  vi.stubEnv("ADMIN_EMAILS", "ada@example.com");
  const allowed = createRes();
  await handler({ method: "GET", headers: { authorization: "Bearer test" } }, allowed);
  assert.equal(allowed.statusCode, 200);
  assert.equal(allowed.body.problems.length, 1);
  assert.equal(allowed.body.problems[0].componentStack, "in ReviewCard");
  assert.equal(allowed.body.problems[0].senderName, "Ada");
  assert.equal(JSON.stringify(allowed.body).includes("SECRETSOURCE"), false);
});
