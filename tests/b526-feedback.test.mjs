/**
 * B526. Feedback is stored with the text context. No model is called.
 * Admins read the inbox. Everyone else gets 404.
 */
import assert from "node:assert/strict";
import { afterEach, describe, test } from "vitest";
import { setSqlOverrideForTests } from "../lib/db/client.mjs";
import { setSessionReaderForTests } from "../lib/auth/require-account.mjs";
import handler from "../api/feedback.js";

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    setHeader() { return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; },
  };
}

function accountRow(id, email, name) {
  return {
    id,
    email,
    name,
    writing_for: null,
    monthly_allowance_usd: null,
    created_at: "2026-11-18T00:00:00.000Z",
    last_active_at: new Date().toISOString(),
  };
}

function memorySql() {
  const accounts = [
    accountRow("user_writer", "writer@example.com", "Bea Writer"),
    accountRow("user_admin", "admin@example.com", "Ada Admin"),
  ];
  const feedback = [];
  let nextId = 1;
  return {
    feedback,
    async query(text, params) {
      const sql = text.replace(/\s+/g, " ").trim().toLowerCase();
      if (sql.startsWith("select id, email")) {
        return accounts.filter((row) => row.id === params[0]);
      }
      if (sql.startsWith("update accounts set last_active_at")) {
        return accounts.filter((row) => row.id === params[0]);
      }
      if (sql.startsWith("insert into feedback")) {
        const row = {
          id: nextId,
          account_id: params[0],
          comment: params[1],
          meta: params[2],
          draft_snapshot: params[3],
          created_at: new Date(Date.now() + nextId).toISOString(),
          read_at: null,
        };
        nextId += 1;
        feedback.push(row);
        return [row];
      }
      if (sql.startsWith("select") && sql.includes("from feedback")) {
        return [...feedback].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).map((row) => {
          const sender = accounts.find((account) => account.id === row.account_id);
          return { ...row, sender_name: sender?.name ?? null, sender_email: sender?.email ?? null };
        });
      }
      if (sql.startsWith("update feedback set read_at")) {
        const row = feedback.find((item) => String(item.id) === String(params[0]));
        if (!row) return [];
        row.read_at = new Date().toISOString();
        return [row];
      }
      throw new Error(sql);
    },
  };
}

function authed(accountId, email, name) {
  setSessionReaderForTests(() => ({ accountId, email, name }));
  return {
    method: "POST",
    headers: { authorization: "Bearer test-token" },
    body: {},
  };
}

describe("B526 feedback", () => {
  const previousAuth = process.env.AUTH_MODE;
  const previousAdmins = process.env.ADMIN_EMAILS;

  afterEach(() => {
    setSqlOverrideForTests(null);
    setSessionReaderForTests(null);
    if (previousAuth == null) delete process.env.AUTH_MODE;
    else process.env.AUTH_MODE = previousAuth;
    if (previousAdmins == null) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = previousAdmins;
  });

  test("a signed-in writer stores a comment, the context and the draft, and does not call a model", async () => {
    process.env.AUTH_MODE = "on";
    process.env.ADMIN_EMAILS = "admin@example.com";
    const sql = memorySql();
    setSqlOverrideForTests(sql);
    const req = authed("user_writer", "writer@example.com", "Bea Writer");
    req.body = {
      comment: "The counts were hard to read.",
      meta: { reviewId: "rev_1", screen: "writing", wordCount: 12 },
      draftSnapshot: "Dear investors, the figure is 12.",
    };
    const res = mockRes();
    await handler(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    assert.equal(sql.feedback.length, 1);
    assert.equal(sql.feedback[0].comment, "The counts were hard to read.");
    assert.equal(sql.feedback[0].draft_snapshot, "Dear investors, the figure is 12.");
    assert.equal(sql.feedback[0].meta.reviewId, "rev_1");
    assert.equal(sql.feedback[0].read_at, null);
  });

  test("a missing comment is refused and nothing is stored", async () => {
    process.env.AUTH_MODE = "on";
    const sql = memorySql();
    setSqlOverrideForTests(sql);
    const req = authed("user_writer", "writer@example.com", "Bea Writer");
    req.body = { comment: "   " };
    const res = mockRes();
    await handler(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal(sql.feedback.length, 0);
  });

  test("a comment over 5000 characters is refused", async () => {
    process.env.AUTH_MODE = "on";
    const sql = memorySql();
    setSqlOverrideForTests(sql);
    const req = authed("user_writer", "writer@example.com", "Bea Writer");
    req.body = { comment: "a".repeat(5001) };
    const res = mockRes();
    await handler(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal(sql.feedback.length, 0);
  });

  test("a writer cannot read the inbox", async () => {
    process.env.AUTH_MODE = "on";
    process.env.ADMIN_EMAILS = "admin@example.com";
    setSqlOverrideForTests(memorySql());
    const req = authed("user_writer", "writer@example.com", "Bea Writer");
    req.method = "GET";
    const res = mockRes();
    await handler(req, res);
    assert.equal(res.statusCode, 404);
  });

  test("an admin sees newest first with the sender name and can mark a row read", async () => {
    process.env.AUTH_MODE = "on";
    process.env.ADMIN_EMAILS = "admin@example.com";
    const sql = memorySql();
    setSqlOverrideForTests(sql);
    const first = authed("user_writer", "writer@example.com", "Bea Writer");
    first.body = { comment: "First note", meta: { screen: "writing" }, draftSnapshot: "One" };
    await handler(first, mockRes());
    const second = authed("user_writer", "writer@example.com", "Bea Writer");
    second.body = { comment: "Second note", meta: { screen: "quality" }, draftSnapshot: "Two" };
    await handler(second, mockRes());

    const listReq = authed("user_admin", "admin@example.com", "Ada Admin");
    listReq.method = "GET";
    const list = mockRes();
    await handler(listReq, list);
    assert.equal(list.statusCode, 200);
    assert.equal(list.body.feedback[0].comment, "Second note");
    assert.equal(list.body.feedback[0].senderName, "Bea Writer");
    assert.equal(list.body.feedback[0].senderEmail, "writer@example.com");
    assert.equal(list.body.feedback[0].draftSnapshot, "Two");
    assert.equal(list.body.feedback[0].readAt, null);

    const mark = authed("user_admin", "admin@example.com", "Ada Admin");
    mark.method = "PUT";
    mark.body = { id: list.body.feedback[0].id, read: true };
    const marked = mockRes();
    await handler(mark, marked);
    assert.equal(marked.statusCode, 200);
    assert.equal(marked.body.ok, true);
    assert.ok(sql.feedback.find((row) => row.comment === "Second note").read_at);
  });
});
