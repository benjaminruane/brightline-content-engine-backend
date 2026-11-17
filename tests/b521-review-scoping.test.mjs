import assert from "node:assert/strict";
import { afterEach, describe, test, vi } from "vitest";
import reviewHandler from "../api/review-state.js";
import reviewsHandler from "../api/reviews.js";
import { LIST_REVIEWS_SQL, draftTitle } from "../lib/db/accounts.mjs";
import { setSqlOverrideForTests } from "../lib/db/client.mjs";
import { setSessionReaderForTests } from "../lib/auth/require-account.mjs";

const OWNER = "owner_key_aaa";
const OTHER = "owner_key_bbb";

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader() { return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { this.ended = true; return this; },
  };
}

function createStore() {
  const accounts = new Map();
  const reviews = new Map();
  return {
    reviews,
    async query(text, params) {
      const sql = text.replace(/\s+/g, " ").trim().toLowerCase();
      if (sql.startsWith("select id, email")) {
        const row = accounts.get(params[0]);
        return row ? [row] : [];
      }
      if (sql.startsWith("insert into accounts")) {
        const row = {
          id: params[0],
          email: params[1],
          name: params[2],
          writing_for: null,
          last_active_at: new Date(),
        };
        accounts.set(row.id, row);
        return [row];
      }
      if (sql.startsWith("update accounts set last_active_at")) return [accounts.get(params[0])];
      if (sql.startsWith("select review_id, owner_key")) {
        const row = reviews.get(params[0]);
        return row ? [row] : [];
      }
      if (sql.startsWith("insert into review_state") && sql.includes("account_id")) {
        const existing = reviews.get(params[0]);
        if (existing && existing.account_id && existing.account_id !== params[3]) return [];
        const row = {
          review_id: params[0],
          owner_key: params[1],
          state: JSON.parse(params[2]),
          account_id: params[3],
          updated_at: "2026-11-17T01:00:00.000Z",
        };
        reviews.set(row.review_id, row);
        return [{ review_id: row.review_id, updated_at: row.updated_at }];
      }
      if (sql.startsWith("delete from review_state")) {
        const row = reviews.get(params[0]);
        if (!row) return [];
        if (row.account_id === params[1] || row.account_id == null) reviews.delete(params[0]);
        return [];
      }
      if (sql.includes("draft_head")) {
        return [...reviews.values()]
          .filter((row) => row.account_id === params[0])
          .map((row) => ({
            review_id: row.review_id,
            draft_head: String(row.state?.draftText || "").trim().slice(0, 61),
            word_count: String(row.state?.draftText || "").trim().split(/\s+/).filter(Boolean).length,
            text_type: row.state?.scenario || "",
            updated_at: row.updated_at,
          }));
      }
      throw new Error(sql);
    },
  };
}

function req(method, token, extra = {}) {
  return {
    method,
    headers: { authorization: `Bearer ${token}`, "x-owner-key": extra.ownerKey || OWNER, origin: "http://localhost:5173" },
    query: extra.query || {},
    body: extra.body || {},
  };
}

describe("B521 review scoping", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    setSessionReaderForTests(null);
    setSqlOverrideForTests(null);
  });

  test("the title keeps a whole word and the list query does not load the snapshot", () => {
    assert.equal(draftTitle(""), "Untitled text");
    assert.equal(draftTitle("  A short note.  "), "A short note.");
    const words = "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda";
    assert.equal(draftTitle(words), "alpha beta gamma delta epsilon zeta eta theta iota kappa");
    assert.equal(draftTitle("x".repeat(70)), "x".repeat(60));
    assert.equal(/\bselect\s+state\b/i.test(LIST_REVIEWS_SQL), false);
    assert.equal(LIST_REVIEWS_SQL.includes("state->>'draftText'"), true);
    assert.equal(LIST_REVIEWS_SQL.includes("account_id = $1"), true);
  });

  test("account A cannot read, write, list or delete account B's text", async () => {
    vi.stubEnv("AUTH_MODE", "on");
    const store = createStore();
    setSqlOverrideForTests(store);
    setSessionReaderForTests((token) => (
      token === "aaa"
        ? { accountId: "acc_a", email: "a@example.com", name: "Ada" }
        : { accountId: "acc_b", email: "b@example.com", name: "Bea" }
    ));
    store.reviews.set("review_b_01", {
      review_id: "review_b_01",
      owner_key: OTHER,
      account_id: "acc_b",
      state: { draftText: "Bea's private draft about the fund.", scenario: "SPECIAL_TOPIC" },
      updated_at: "2026-11-17T02:00:00.000Z",
    });

    const read = mockRes();
    await reviewHandler(req("GET", "aaa", { query: { reviewId: "review_b_01" } }), read);
    assert.equal(read.statusCode, 404);

    const write = mockRes();
    await reviewHandler(req("POST", "aaa", {
      body: { reviewId: "review_b_01", state: { draftText: "stolen" } },
    }), write);
    assert.equal(write.statusCode, 404);
    assert.equal(store.reviews.get("review_b_01").state.draftText.includes("private"), true);

    const remove = mockRes();
    await reviewHandler(req("DELETE", "aaa", { query: { reviewId: "review_b_01" } }), remove);
    assert.equal(remove.statusCode, 404);
    assert.equal(store.reviews.has("review_b_01"), true);

    const list = mockRes();
    await reviewsHandler(req("GET", "aaa"), list);
    assert.equal(list.statusCode, 200);
    assert.deepEqual(list.body.reviews, []);

    const own = mockRes();
    await reviewHandler(req("POST", "aaa", {
      body: { reviewId: "review_a_01", state: { draftText: "Ada wrote this.", scenario: "NEW_DIRECT_INVESTMENT" } },
    }), own);
    assert.equal(own.statusCode, 200);
    const ownList = mockRes();
    await reviewsHandler(req("GET", "aaa"), ownList);
    assert.equal(ownList.body.reviews.length, 1);
    assert.equal(ownList.body.reviews[0].reviewId, "review_a_01");
    assert.equal(ownList.body.reviews[0].title, "Ada wrote this.");
  });
});
