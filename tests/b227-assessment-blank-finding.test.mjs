/**
 * B227: synthesize-review refuses a blank finding the same way it refuses a bad readiness.
 */
import assert from "node:assert/strict";
import { afterEach, describe, test, vi } from "vitest";
import * as observability from "../lib/observability.js";
import handler from "../api/synthesize-review.js";

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

describe("B227 assessment blank finding", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("empty editorial concern does not call the model", async () => {
    vi.spyOn(observability, "hasProviderApiKey").mockReturnValue(true);
    const llmSpy = vi.spyOn(observability, "callLLM").mockResolvedValue({ text: "should not run" });
    const res = createRes();
    await handler(
      postReq({
        qcSummary: { readiness: "Needs work" },
        editorialConcerns: [{ statement: "We recommend approval.", concern: "" }],
      }),
      res
    );
    assert.equal(llmSpy.mock.calls.length, 0);
    assert.deepEqual(res.body, { ok: false, narrative: "" });
  });
});
