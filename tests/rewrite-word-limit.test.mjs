import assert from "node:assert/strict";
import { afterEach, describe, test, vi } from "vitest";
import * as observability from "../lib/observability.js";
import handler from "../api/rewrite.js";

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

function draftOfWordCount(n, token = "token") {
  return Array.from({ length: n }, () => token).join(" ");
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("rewrite word limit", () => {
  test("rewrite never makes a second model call to hit a word limit", async () => {
    const keySpy = vi.spyOn(observability, "hasProviderApiKey").mockReturnValue(true);
    const flushSpy = vi.spyOn(observability, "flushObservability").mockResolvedValue(undefined);

    async function runOnce(modelDraftText) {
      const llmSpy = vi.spyOn(observability, "callLLM").mockResolvedValue({
        text: JSON.stringify({ draftText: modelDraftText }),
      });
      const res = createRes();
      await handler(
        postReq({
          text: "Original draft about the transaction.",
          instructions: "Tighten the second paragraph",
          maxWords: 80,
          outputType: "reporting_commentary",
          visibility: "complete",
        }),
        res
      );
      const callCount = llmSpy.mock.calls.length;
      llmSpy.mockRestore();
      return { res, callCount };
    }

    const farOver = draftOfWordCount(300, "overword");
    const over = await runOnce(farOver);
    assert.equal(over.res.statusCode, 200);
    assert.equal(over.res.body?.ok, true);
    assert.equal(over.res.body?.draftText, farOver);
    assert.equal(over.callCount, 1);
    assert.equal(over.res.body?.meta?.rewriteReport?.metrics?.wordsOverLimit, 220);
    assert.equal(over.res.body?.meta?.rewriteReport?.metrics?.hitTarget, undefined);
    assert.equal(over.res.body?.meta?.outputIntent?.wordLimitMiss, undefined);

    const farUnder = draftOfWordCount(8, "underword");
    const under = await runOnce(farUnder);
    assert.equal(under.res.statusCode, 200);
    assert.equal(under.res.body?.ok, true);
    assert.equal(under.res.body?.draftText, farUnder);
    assert.equal(under.callCount, 1);
    assert.equal(under.res.body?.meta?.rewriteReport?.metrics?.wordsOverLimit, 0);

    keySpy.mockRestore();
    flushSpy.mockRestore();
  });
});
