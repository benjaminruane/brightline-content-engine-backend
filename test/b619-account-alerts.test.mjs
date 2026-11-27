/**
 * B619. Email Ben on new sign-up and first review.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "vitest";
import {
  ACCOUNT_ALERT_EMAIL_SKIPPED_LINE,
  alertsEnabledInEnv,
  firstReviewAlertBody,
  firstReviewAlertSubject,
  firstReviewDetailLine,
  isCompletedReviewState,
  maybeSendFirstReviewAlert,
  maybeSendSignupAlert,
  signupAlertBody,
  signupAlertSubject,
} from "../lib/account-alerts.mjs";
import {
  claimFirstReviewAlert,
  claimSignupAlert,
  resetMissingAccountColumnsForTests,
} from "../lib/db/accounts.mjs";

function memorySql({ signupClaimed = false, firstReviewClaimed = false } = {}) {
  const claims = {
    signup_alert_sent_at: signupClaimed,
    first_review_alert_sent_at: firstReviewClaimed,
  };
  const queries = [];
  const accounts = new Map();
  return {
    queries,
    claims,
    accounts,
    seedAccount(row) {
      accounts.set(row.id, { ...row });
    },
    async query(text, params) {
      const sql = String(text);
      queries.push(sql);
      if (sql.includes("signup_alert_sent_at = now()")) {
        const id = params[0];
        if (claims.signup_alert_sent_at) return [];
        claims.signup_alert_sent_at = true;
        const row = accounts.get(id) || { id, email: null, name: null };
        accounts.set(id, { ...row, signup_alert_sent_at: new Date().toISOString() });
        return [{ id: row.id, email: row.email ?? null, name: row.name ?? null }];
      }
      if (sql.includes("first_review_alert_sent_at = now()")) {
        const id = params[0];
        if (claims.first_review_alert_sent_at) return [];
        claims.first_review_alert_sent_at = true;
        const row = accounts.get(id) || { id, email: null, name: null };
        accounts.set(id, { ...row, first_review_alert_sent_at: new Date().toISOString() });
        return [{ id: row.id, email: row.email ?? null, name: row.name ?? null }];
      }
      return [];
    },
  };
}

function completedState(overrides = {}) {
  return {
    draftText: "Shopify combines simple onboarding with fees.",
    scenario: "LinkedIn post",
    lastAnalysedAt: "2026-11-27T12:00:00.000Z",
    reviewReference: "R-ABCD",
    analysisResult: {
      meta: {
        reviewSummary: { version: 1, readiness: "Needs work" },
        reviewReference: "R-ABCD",
      },
    },
    ...overrides,
  };
}

describe("B619 account alerts", () => {
  const saved = {};

  beforeEach(() => {
    resetMissingAccountColumnsForTests();
    saved.VERCEL_ENV = process.env.VERCEL_ENV;
    saved.RESEND_API_KEY = process.env.RESEND_API_KEY;
    saved.FEEDBACK_EMAIL_FROM = process.env.FEEDBACK_EMAIL_FROM;
    saved.FEEDBACK_EMAIL_TO = process.env.FEEDBACK_EMAIL_TO;
    saved.FEEDBACK_APP_URL = process.env.FEEDBACK_APP_URL;
    process.env.VERCEL_ENV = "production";
    process.env.RESEND_API_KEY = "test-key";
    process.env.FEEDBACK_EMAIL_FROM = "from@example.com";
    process.env.FEEDBACK_EMAIL_TO = "ben@example.com";
    process.env.FEEDBACK_APP_URL = "https://app.example.com";
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  });

  test("new account claims and sends once; a second sight sends nothing", async () => {
    const sql = memorySql();
    sql.seedAccount({ id: "user_1", email: "ada@example.com", name: "Ada" });
    const sent = [];
    const fetchImpl = async (_url, init) => {
      sent.push(JSON.parse(init.body));
      return { ok: true, status: 200 };
    };
    const first = await maybeSendSignupAlert(sql, {
      id: "user_1",
      email: "ada@example.com",
      name: "Ada",
      force: true,
      fetchImpl,
    });
    assert.equal(first.claimed, true);
    assert.equal(first.sent, true);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].subject, "New sign-up: Ada");
    assert.match(sent[0].text, /Ada \(ada@example.com\) signed up to Brightline Content Engine\./);
    assert.match(sent[0].text, /https:\/\/app\.example\.com$/m);
    assert.doesNotMatch(sent[0].text, /feedback=inbox/);

    const second = await maybeSendSignupAlert(sql, {
      id: "user_1",
      email: "ada@example.com",
      name: "Ada",
      force: true,
      fetchImpl,
    });
    assert.equal(second.claimed, false);
    assert.equal(second.sent, false);
    assert.equal(sent.length, 1);
  });

  test("existing account with alert column already set sends nothing", async () => {
    const sql = memorySql({ signupClaimed: true });
    sql.seedAccount({ id: "user_old", email: "old@example.com", name: "Old" });
    const sent = [];
    const result = await maybeSendSignupAlert(sql, {
      id: "user_old",
      force: true,
      fetchImpl: async (_url, init) => {
        sent.push(JSON.parse(init.body));
        return { ok: true };
      },
    });
    assert.equal(result.claimed, false);
    assert.equal(result.sent, false);
    assert.equal(sent.length, 0);
  });

  test("first saved review sends once; second review sends nothing", async () => {
    const sql = memorySql();
    sql.seedAccount({ id: "user_2", email: "ben@friend.com", name: "Ben Friend" });
    const sent = [];
    const fetchImpl = async (_url, init) => {
      sent.push(JSON.parse(init.body));
      return { ok: true };
    };
    const state = completedState();
    const first = await maybeSendFirstReviewAlert(sql, {
      id: "user_2",
      email: "ben@friend.com",
      name: "Ben Friend",
      state,
      reviewId: "rev_first_01",
      force: true,
      fetchImpl,
    });
    assert.equal(first.claimed, true);
    assert.equal(first.sent, true);
    assert.equal(sent[0].subject, "First review: Ben Friend");
    assert.match(sent[0].text, /Ben Friend \(ben@friend.com\) ran their first review\./);
    assert.match(sent[0].text, /LinkedIn post · \d+ words · Needs work · Ref R-ABCD/);

    const second = await maybeSendFirstReviewAlert(sql, {
      id: "user_2",
      state: completedState({ draftText: "Another draft entirely." }),
      reviewId: "rev_second_02",
      force: true,
      fetchImpl,
    });
    assert.equal(second.claimed, false);
    assert.equal(second.sent, false);
    assert.equal(sent.length, 1);
  });

  test("not production: nothing claimed, nothing sent", async () => {
    const sql = memorySql();
    sql.seedAccount({ id: "user_3", email: "x@example.com", name: "X" });
    const sent = [];
    const result = await maybeSendSignupAlert(sql, {
      id: "user_3",
      env: "preview",
      force: true,
      fetchImpl: async (_url, init) => {
        sent.push(init);
        return { ok: true };
      },
    });
    assert.equal(alertsEnabledInEnv("preview"), false);
    assert.equal(result.reason, "not_production");
    assert.equal(result.claimed, false);
    assert.equal(sent.length, 0);
    assert.equal(sql.claims.signup_alert_sent_at, false);

    const review = await maybeSendFirstReviewAlert(sql, {
      id: "user_3",
      state: completedState(),
      env: "development",
      force: true,
      fetchImpl: async () => ({ ok: true }),
    });
    assert.equal(review.claimed, false);
    assert.equal(sql.claims.first_review_alert_sent_at, false);
  });

  test("missing Resend settings: skipped, no throw", async () => {
    delete process.env.RESEND_API_KEY;
    const sql = memorySql();
    sql.seedAccount({ id: "user_4", email: "y@example.com", name: "Y" });
    const lines = [];
    const original = console.log;
    console.log = (...args) => lines.push(args.join(" "));
    try {
      const result = await maybeSendSignupAlert(sql, {
        id: "user_4",
        force: true,
        fetchImpl: async () => {
          throw new Error("should not fetch");
        },
      });
      assert.equal(result.claimed, true);
      assert.equal(result.sent, false);
      assert.equal(result.reason, "not_configured");
      assert.equal(lines.filter((line) => line === ACCOUNT_ALERT_EMAIL_SKIPPED_LINE).length, 1);
    } finally {
      console.log = original;
    }
  });

  test("email bodies contain no draft text and no em or en dashes", () => {
    const account = { name: "Ada", email: "ada@example.com" };
    const draft = "Shopify combines simple, self-serve onboarding with fees.";
    const state = completedState({ draftText: draft });
    const signup = signupAlertBody(account);
    const first = firstReviewAlertBody(account, state, "rev_1");
    assert.doesNotMatch(signup, /Shopify/);
    assert.doesNotMatch(first, /Shopify/);
    assert.doesNotMatch(first, /self-serve onboarding/);
    for (const text of [
      signup,
      first,
      signupAlertSubject(account),
      firstReviewAlertSubject(account),
      firstReviewDetailLine(state, "rev_1"),
    ]) {
      assert.equal(/\u2013|\u2014/.test(text), false, `dash found in: ${text}`);
    }
    assert.equal(isCompletedReviewState({}), false);
    assert.equal(isCompletedReviewState(state), true);
  });

  test("claim helpers return a row only once", async () => {
    const sql = memorySql();
    sql.seedAccount({ id: "user_5", email: "z@example.com", name: "Z" });
    const a = await claimSignupAlert(sql, "user_5");
    const b = await claimSignupAlert(sql, "user_5");
    assert.equal(a.id, "user_5");
    assert.equal(b, null);
    const c = await claimFirstReviewAlert(sql, "user_5");
    const d = await claimFirstReviewAlert(sql, "user_5");
    assert.equal(c.id, "user_5");
    assert.equal(d, null);
  });
});
