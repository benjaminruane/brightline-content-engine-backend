import assert from "node:assert/strict";
import { afterEach, describe, test, vi } from "vitest";

import * as reviewerDecisions from "../lib/db/reviewer-decisions.mjs";
import {
  buildReviewerDecisionPayload,
  DECISION_KINDS,
} from "../lib/db/reviewer-decisions.mjs";
import handler from "../api/reviewer-decisions.js";

const VALID_ID = "review_ab12";
const OWNER_A = "owner_key_aaa";
const BASE_FIELDS = {
  labelA: "Fact sheet",
  labelB: "Performance report",
  figureA: "11.2%",
  figureB: "12.4%",
  passageA: "Net IRR was 11.2 percent.",
  passageB: "Net IRR stood at 12.4%.",
};

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

function postReq(body) {
  return {
    method: "POST",
    headers: { "x-owner-key": OWNER_A, origin: "http://localhost:5173" },
    query: {},
    body,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("T1 row builder payload", () => {
  test("carries both labels, both figures, both passages and the decision", () => {
    const payload = buildReviewerDecisionPayload({
      ...BASE_FIELDS,
      chosenLabel: "Fact sheet",
    });
    assert.equal(payload.labelA, "Fact sheet");
    assert.equal(payload.labelB, "Performance report");
    assert.equal(payload.figureA, "11.2%");
    assert.equal(payload.figureB, "12.4%");
    assert.equal(payload.passageA, "Net IRR was 11.2 percent.");
    assert.equal(payload.passageB, "Net IRR stood at 12.4%.");
    assert.equal(payload.chosenLabel, "Fact sheet");
  });
});

describe("T2 neither is distinct from no decision", () => {
  test("records null for the chosen document and keeps the key", () => {
    const neither = buildReviewerDecisionPayload({
      ...BASE_FIELDS,
      chosenLabel: null,
    });
    assert.equal(neither.chosenLabel, null);
    assert.equal(Object.prototype.hasOwnProperty.call(neither, "chosenLabel"), true);

    const noDecision = buildReviewerDecisionPayload(BASE_FIELDS);
    assert.equal(Object.prototype.hasOwnProperty.call(noDecision, "chosenLabel"), false);
    assert.notDeepEqual(neither, noDecision);

    const serialised = JSON.parse(JSON.stringify(neither));
    assert.equal(serialised.chosenLabel, null);
    const serialisedNone = JSON.parse(JSON.stringify(noDecision));
    assert.equal("chosenLabel" in serialisedNone, false);
  });
});

describe("T3 route validation", () => {
  test("rejects a missing reviewId, a missing payload and an unknown kind", async () => {
    const missingId = createRes();
    await handler(
      postReq({
        kind: "source_governance",
        payload: { ...BASE_FIELDS, chosenLabel: "Fact sheet" },
      }),
      missingId
    );
    assert.equal(missingId.statusCode, 400);
    assert.equal(missingId.body?.error, "invalid_review_id");

    const missingPayload = createRes();
    await handler(
      postReq({
        reviewId: VALID_ID,
        kind: "source_governance",
      }),
      missingPayload
    );
    assert.equal(missingPayload.statusCode, 400);
    assert.equal(missingPayload.body?.error, "invalid_payload");

    const unknownKind = createRes();
    await handler(
      postReq({
        reviewId: VALID_ID,
        kind: "accept_finding",
        payload: { ...BASE_FIELDS, chosenLabel: "Fact sheet" },
      }),
      unknownKind
    );
    assert.equal(unknownKind.statusCode, 400);
    assert.equal(unknownKind.body?.error, "invalid_kind");
  });
});

describe("T4 exported surface is append-only", () => {
  test("exposes no update or delete path", () => {
    const names = Object.keys(reviewerDecisions);
    assert.equal(names.some((name) => /update|delete/i.test(name)), false);
    assert.equal(typeof reviewerDecisions.insertReviewerDecision, "function");
    assert.equal(typeof reviewerDecisions.listReviewerDecisions, "function");
    assert.equal(typeof reviewerDecisions.buildReviewerDecisionPayload, "function");
    assert.deepEqual([...DECISION_KINDS], ["source_governance", "source_override"]);
  });
});

describe("T5 no database configured", () => {
  test("returns 503 db_not_configured and does not throw", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const res = createRes();
    await assert.doesNotReject(() =>
      handler(
        postReq({
          reviewId: VALID_ID,
          kind: "source_governance",
          payload: { ...BASE_FIELDS, chosenLabel: "Fact sheet" },
        }),
        res
      )
    );
    assert.equal(res.statusCode, 503);
    assert.equal(res.body?.error, "db_not_configured");
  });
});
