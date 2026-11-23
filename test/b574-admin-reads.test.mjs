/**
 * B574. Mark as read survives preflight. The same message within 30 seconds
 * is one problem, whichever route reported it. No model call.
 */
import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import feedbackHandler from "../api/feedback.js";
import problemHandler from "../api/problem-event.js";
import { setSqlOverrideForTests } from "../lib/db/client.mjs";
import { setSessionReaderForTests } from "../lib/auth/require-account.mjs";
import { reportRouteFailure } from "../lib/problem-events.mjs";

const ORIGIN = "https://brightline-content-engine-frontend.vercel.app";

function createRes() {
  return {
    statusCode: 200,
    headers: {},
    headersSent: false,
    body: undefined,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; this.headersSent = true; return this; },
    end() { this.headersSent = true; return this; },
  };
}

function accountSql() {
  return {
    async query(text) {
      if (text.includes("from accounts") || text.includes("into accounts") || text.includes("update accounts")) {
        return [{
          id: "user_b574",
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
      if (text.includes("set read_at")) return [{ id: 7, read_at: "2026-11-23T10:00:00.000Z" }];
      return [];
    },
  };
}

afterEach(() => {
  setSqlOverrideForTests(null);
  setSessionReaderForTests(null);
  vi.unstubAllEnvs();
});

async function preflight(handler) {
  const res = createRes();
  await handler({ method: "OPTIONS", headers: { origin: ORIGIN } }, res);
  return res;
}

test("feedback and problem preflight allow PUT, and mark read succeeds", async () => {
  setSqlOverrideForTests(accountSql());
  setSessionReaderForTests(() => ({ accountId: "user_b574", email: "ada@example.com", name: "Ada" }));
  vi.stubEnv("AUTH_MODE", "on");
  vi.stubEnv("ADMIN_EMAILS", "ada@example.com");
  const feedbackPre = await preflight(feedbackHandler);
  const problemPre = await preflight(problemHandler);
  assert.match(feedbackPre.headers["Access-Control-Allow-Methods"], /\bPUT\b/);
  assert.match(problemPre.headers["Access-Control-Allow-Methods"], /\bPUT\b/);
  assert.equal(feedbackPre.statusCode, 204);
  assert.equal(problemPre.statusCode, 204);

  for (const [handler, body] of [
    [feedbackHandler, { id: 7, read: true }],
    [feedbackHandler, { readAll: true }],
    [problemHandler, { id: 7, read: true }],
    [problemHandler, { readAll: true }],
  ]) {
    const res = createRes();
    await handler({
      method: "PUT",
      headers: { origin: ORIGIN, authorization: "Bearer test" },
      body,
    }, res);
    assert.equal(res.statusCode, 200, JSON.stringify(body));
    assert.equal(res.body.ok, true);
  }
});

test("the same message within 30 seconds is one problem across routes", async () => {
  const seen = [];
  setSqlOverrideForTests({
    async query(text, params = []) {
      if (text.includes("insert into problem_events")) {
        seen.push(params[2]);
        return [{ id: seen.length }];
      }
      if (text.includes("emailed_at is not null")) return [];
      return [];
    },
  });
  const account = { accountId: "user_b574_dup", email: "ada@example.com", name: "Ada" };
  const message = "We could not read this PDF.";
  const first = await reportRouteFailure({ account, route: "extract-draft-text", error: message, status: 200 });
  const second = await reportRouteFailure({ account, route: "upload", error: message, status: 200 });
  assert.equal(first.recorded, true);
  assert.equal(second.duplicate, true);
  assert.equal(seen.length, 1);
});
