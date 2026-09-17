import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, test, vi } from "vitest";
import { classifyCard, summariseReview } from "../lib/qc/review-summary.mjs";
import * as observability from "../lib/observability.js";
import handler from "../api/synthesize-review.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(path.join(root, "fixtures/review-summary-cases.json"), "utf8")
);

describe("review-summary cases", () => {
  for (const testCase of fixture.cases) {
    test(testCase.name, () => {
      const cards = testCase.cards;
      const opts = testCase.reviewOptions;
      assert.equal(cards.length, testCase.expectedSummaryClass.length);
      for (let i = 0; i < cards.length; i++) {
        assert.deepEqual(classifyCard(cards[i], opts), testCase.expectedSummaryClass[i]);
      }
      assert.deepEqual(summariseReview(cards, opts), testCase.expectedReviewSummary);
    });
  }
});

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
    headers: { origin: "http://localhost:5173" },
    body,
  };
}

describe("synthesize-review refuses a missing or unknown label", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("missing readiness does not call the model", async () => {
    const llmSpy = vi.spyOn(observability, "callLLM").mockResolvedValue({ text: "should not run" });
    const res = createRes();
    await handler(postReq({ qcSummary: {} }), res);
    assert.equal(llmSpy.mock.calls.length, 0);
    assert.deepEqual(res.body, { ok: false, narrative: "" });
  });

  test("unknown readiness does not call the model", async () => {
    const llmSpy = vi.spyOn(observability, "callLLM").mockResolvedValue({ text: "should not run" });
    const res = createRes();
    await handler(postReq({ qcSummary: { readiness: "Needs targeted revision" } }), res);
    assert.equal(llmSpy.mock.calls.length, 0);
    assert.deepEqual(res.body, { ok: false, narrative: "" });
  });
});
