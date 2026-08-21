import assert from "node:assert/strict";
import { describe, test } from "vitest";

import {
  MAX_STATE_BYTES,
  deleteReviewState,
  loadReviewState,
  saveReviewState,
  validateOwnerKey,
  validateReviewId,
} from "../lib/db/review-state.mjs";

function createFakeSql(store) {
  const calls = [];
  async function sql(text, params = []) {
    calls.push({ text, params });
    const normalised = String(text).toLowerCase().replace(/\s+/g, " ").trim();
    const reviewId = params[0];
    if (normalised.startsWith("select")) {
      const row = store.get(reviewId);
      return row ? [{ ...row }] : [];
    }
    if (normalised.startsWith("insert")) {
      const ownerKey = params[1];
      const rawState = params[2];
      const state = typeof rawState === "string" ? JSON.parse(rawState) : rawState;
      const updatedAt = new Date("2026-08-21T08:00:00.000Z");
      store.set(reviewId, {
        review_id: reviewId,
        owner_key: ownerKey,
        state,
        updated_at: updatedAt,
      });
      return [{ review_id: reviewId, updated_at: updatedAt }];
    }
    if (normalised.startsWith("delete")) {
      store.delete(reviewId);
      return [];
    }
    throw new Error(`unexpected query: ${text}`);
  }
  sql.calls = calls;
  return sql;
}

const VALID_ID = "review_ab12";
const OWNER_A = "owner_key_aaa";
const OWNER_B = "owner_key_bbb";

describe("validateReviewId", () => {
  test("accepts an 8-64 character id of letters, digits, underscore and hyphen", () => {
    assert.equal(validateReviewId("abcdefgh"), true);
    assert.equal(validateReviewId("AZaz09_-".repeat(8)), true);
  });

  test("rejects empty, overlong, and strings containing slash, space or quote", () => {
    assert.equal(validateReviewId(""), false);
    assert.equal(validateReviewId("short"), false);
    assert.equal(validateReviewId("a".repeat(65)), false);
    assert.equal(validateReviewId("review/idxx"), false);
    assert.equal(validateReviewId("review idxx"), false);
    assert.equal(validateReviewId('review"idxx'), false);
    assert.equal(validateReviewId("review'idxx"), false);
  });
});

describe("validateOwnerKey", () => {
  test("accepts an 8-128 character key of letters, digits, underscore and hyphen", () => {
    assert.equal(validateOwnerKey("ownerkey"), true);
    assert.equal(validateOwnerKey("AZaz09_-".repeat(16)), true);
  });

  test("rejects empty, overlong, and strings containing slash, space or quote", () => {
    assert.equal(validateOwnerKey(""), false);
    assert.equal(validateOwnerKey("short"), false);
    assert.equal(validateOwnerKey("a".repeat(129)), false);
    assert.equal(validateOwnerKey("owner/keyx"), false);
    assert.equal(validateOwnerKey("owner keyx"), false);
    assert.equal(validateOwnerKey('owner"keyx'), false);
    assert.equal(validateOwnerKey("owner'keyx"), false);
  });
});

describe("saveReviewState", () => {
  test("rejects a state blob over MAX_STATE_BYTES with too_large and issues no query", async () => {
    const sql = createFakeSql(new Map());
    const state = { blob: "x".repeat(MAX_STATE_BYTES) };
    const result = await saveReviewState(sql, {
      reviewId: VALID_ID,
      ownerKey: OWNER_A,
      state,
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "too_large");
    assert.equal(typeof result.bytes, "number");
    assert.equal(result.bytes > MAX_STATE_BYTES, true);
    assert.equal(sql.calls.length, 0);
  });

  test("upserts on a fresh review_id", async () => {
    const store = new Map();
    const sql = createFakeSql(store);
    const state = { draft: "hello" };
    const result = await saveReviewState(sql, {
      reviewId: VALID_ID,
      ownerKey: OWNER_A,
      state,
    });
    assert.equal(result.ok, true);
    assert.equal(result.reviewId, VALID_ID);
    assert.ok(result.updatedAt);
    assert.equal(store.get(VALID_ID).owner_key, OWNER_A);
    assert.deepEqual(store.get(VALID_ID).state, state);
    const writes = sql.calls.filter((call) =>
      String(call.text).toLowerCase().includes("insert")
    );
    assert.equal(writes.length, 1);
  });

  test("returns owner_mismatch when the existing row has a different owner_key, and issues no update", async () => {
    const store = new Map([
      [
        VALID_ID,
        {
          review_id: VALID_ID,
          owner_key: OWNER_A,
          state: { draft: "original" },
          updated_at: new Date("2026-08-20T00:00:00.000Z"),
        },
      ],
    ]);
    const sql = createFakeSql(store);
    const result = await saveReviewState(sql, {
      reviewId: VALID_ID,
      ownerKey: OWNER_B,
      state: { draft: "stolen" },
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "owner_mismatch");
    assert.deepEqual(store.get(VALID_ID).state, { draft: "original" });
    assert.equal(sql.calls.length, 1);
    assert.equal(String(sql.calls[0].text).toLowerCase().startsWith("select"), true);
  });
});

describe("loadReviewState", () => {
  test("returns null when no row exists", async () => {
    const sql = createFakeSql(new Map());
    const result = await loadReviewState(sql, {
      reviewId: VALID_ID,
      ownerKey: OWNER_A,
    });
    assert.equal(result, null);
    assert.equal(sql.calls.length, 1);
  });

  test("returns owner_mismatch on a differing owner_key", async () => {
    const sql = createFakeSql(
      new Map([
        [
          VALID_ID,
          {
            review_id: VALID_ID,
            owner_key: OWNER_A,
            state: { draft: "kept" },
            updated_at: new Date("2026-08-20T00:00:00.000Z"),
          },
        ],
      ])
    );
    const result = await loadReviewState(sql, {
      reviewId: VALID_ID,
      ownerKey: OWNER_B,
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "owner_mismatch");
  });
});

describe("deleteReviewState", () => {
  test("returns owner_mismatch on a differing owner_key", async () => {
    const store = new Map([
      [
        VALID_ID,
        {
          review_id: VALID_ID,
          owner_key: OWNER_A,
          state: { draft: "kept" },
          updated_at: new Date("2026-08-20T00:00:00.000Z"),
        },
      ],
    ]);
    const sql = createFakeSql(store);
    const result = await deleteReviewState(sql, {
      reviewId: VALID_ID,
      ownerKey: OWNER_B,
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "owner_mismatch");
    assert.equal(store.has(VALID_ID), true);
    assert.equal(sql.calls.length, 1);
    assert.equal(String(sql.calls[0].text).toLowerCase().startsWith("select"), true);
  });
});
