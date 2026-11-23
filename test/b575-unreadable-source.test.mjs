/**
 * B575. An unreadable upload says so and records a problem.
 * A review whose sources produced no text says so and records a problem.
 */
import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import extractHandler from "../api/extract-draft-text.js";
import { setSqlOverrideForTests } from "../lib/db/client.mjs";
import { setSessionReaderForTests } from "../lib/auth/require-account.mjs";
import {
  NONE_READABLE,
  everySourceUnreadable,
  refuseIfUnreadable,
  unreadableFileMessage,
} from "../lib/unreadable-source.mjs";

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
          status: params[4],
        };
        rows.push(row);
        return [row];
      }
      if (text.includes("emailed_at is not null")) return [];
      if (text.includes("from accounts")) {
        return [{
          id: "user_ada",
          email: "ada@example.com",
          name: "Ada",
          writing_for: null,
          spelling: "US",
          thousands: "comma",
          feedback_banner_closed_at: null,
          style_choices: { spelling: "US", thousands: "comma", dates: "dmy" },
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
    headersSent: false,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      this.headersSent = true;
      return this;
    },
    end() {
      this.headersSent = true;
      return this;
    },
  };
}

afterEach(() => {
  setSqlOverrideForTests(null);
  setSessionReaderForTests(null);
  vi.unstubAllEnvs();
});

test("an empty file tells the reader it could not be read and records a problem", async () => {
  assert.match(unreadableFileMessage("scan.pdf"), /not a real PDF/);
  assert.equal(unreadableFileMessage("scan.pdf").includes("—"), false);
  const sql = problemSql();
  setSqlOverrideForTests(sql);
  setSessionReaderForTests(() => ({ accountId: "user_ada", email: "ada@example.com", name: "Ada" }));
  vi.stubEnv("AUTH_MODE", "on");
  const res = createRes();
  await extractHandler({
    method: "POST",
    headers: {
      authorization: "Bearer test",
      origin: "https://brightline-content-engine-frontend.vercel.app",
    },
    body: { name: "scan.pdf", mimeType: "text/plain", text: "   " },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.unreadable, true);
  assert.equal(res.body.message, unreadableFileMessage("scan.pdf"));
  assert.equal(res.headers["Access-Control-Allow-Origin"], "https://brightline-content-engine-frontend.vercel.app");
  assert.equal(sql.rows.length, 1);
  assert.equal(sql.rows[0].route, "extract-draft-text");
  assert.equal(sql.rows[0].message, unreadableFileMessage("scan.pdf"));
});

test("a review of only unreadable sources returns the specific message and records a problem", async () => {
  const sources = [
    { name: "scan.pdf", text: "" },
    { name: "photo.png", text: "   " },
  ];
  assert.equal(everySourceUnreadable(sources), true);
  assert.equal(everySourceUnreadable([{ name: "notes.txt", text: "Revenue rose." }]), false);
  const sql = problemSql();
  const account = { accountId: "user_ada", email: "ada@example.com", name: "Ada" };
  const body = await refuseIfUnreadable({
    sources,
    account,
    route: "analyse-statements",
    sql,
    startedAt: Date.now(),
  });
  assert.deepEqual(body, { ok: false, error: NONE_READABLE });
  assert.equal(sql.rows.length, 1);
  assert.equal(sql.rows[0].message, NONE_READABLE);
  assert.equal(sql.rows[0].route, "analyse-statements");
  const readable = await refuseIfUnreadable({
    sources: [{ text: "Revenue rose." }],
    account,
    route: "analyse-statements",
    sql,
  });
  assert.equal(readable, null);
  assert.equal(sql.rows.length, 1);
});
