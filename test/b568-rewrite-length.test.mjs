/**
 * B568. A length instruction becomes a word target and that target reaches the prompt.
 * The model is mocked. No live call.
 */
import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import * as observability from "../lib/observability.js";
import rewrite from "../api/rewrite.js";
import {
  lengthIsOff,
  lengthMissLine,
  lengthPromptLine,
  lengthTargetFromInstruction,
} from "../lib/rewrite-length-target.mjs";

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

const TEN = "alpha beta gamma delta epsilon zeta eta theta iota kappa";

afterEach(() => {
  vi.restoreAllMocks();
});

test("relative and absolute length instructions become a word target", () => {
  assert.equal(lengthTargetFromInstruction("shorten by 30%", 247), 173);
  assert.equal(lengthTargetFromInstruction("halve it", 250), 125);
  assert.equal(lengthTargetFromInstruction("cut to 150 words", 247), 150);
  assert.equal(lengthTargetFromInstruction("make the tone firmer", 247), null);
  assert.equal(lengthIsOff(246, 173), true);
  assert.equal(lengthIsOff(173, 173), false);
  assert.equal(lengthMissLine(246, 173), "This rewrite is 246 words; you asked for about 173.");
  assert.match(lengthPromptLine(173), /Write about 173 words/);
});

test("the word target reaches the rewrite prompt and replaces the document limit", async () => {
  vi.spyOn(observability, "hasProviderApiKey").mockReturnValue(true);
  vi.spyOn(observability, "flushObservability").mockResolvedValue(undefined);
  const long = `${TEN} ${TEN}`.trim();
  const llmSpy = vi.spyOn(observability, "callLLM").mockResolvedValue({
    text: JSON.stringify({ draftText: long }),
  });
  const res = createRes();
  await rewrite(
    {
      method: "POST",
      headers: { origin: "http://localhost:5173" },
      body: {
        text: TEN,
        instructions: "shorten by 30%",
        maxWords: 400,
        outputType: "reporting_commentary",
        visibility: "complete",
        sources: [{ id: "t1", name: "memo.txt", text: "GP Industries reported a higher margin.", role: "facts" }],
      },
    },
    res
  );
  const first = JSON.stringify(llmSpy.mock.calls[0]);
  assert.match(first, /Write about 7 words/);
  assert.match(first, /replaces the document word limit/);
  assert.equal(first.includes("400 words"), false);
  assert.equal(llmSpy.mock.calls.length, 2);
  const second = JSON.stringify(llmSpy.mock.calls[1]);
  assert.match(second, /The last draft was \d+ words/);
  assert.equal(res.statusCode, 200);
  assert.match(res.body.lengthNotice, /^This rewrite is \d+ words; you asked for about 7\.$/);
});

test("a rewrite that lands on the target is not retried", async () => {
  vi.spyOn(observability, "hasProviderApiKey").mockReturnValue(true);
  vi.spyOn(observability, "flushObservability").mockResolvedValue(undefined);
  const seven = "alpha beta gamma delta epsilon zeta eta";
  const llmSpy = vi.spyOn(observability, "callLLM").mockResolvedValue({
    text: JSON.stringify({ draftText: seven }),
  });
  const res = createRes();
  await rewrite(
    {
      method: "POST",
      headers: { origin: "http://localhost:5173" },
      body: {
        text: TEN,
        instructions: "shorten by 30%",
        maxWords: 400,
        outputType: "reporting_commentary",
        visibility: "complete",
        sources: [{ id: "t1", name: "memo.txt", text: "GP Industries reported a higher margin.", role: "facts" }],
      },
    },
    res
  );
  assert.equal(llmSpy.mock.calls.length, 1);
  assert.equal(res.body.lengthNotice, null);
});
