/**
 * B569. A rewrite that comes back the same is a miss, retried once.
 * No model call.
 */
import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import rewrite from "../api/rewrite.js";
import * as observability from "../lib/observability.js";
import { rewriteTextUnchanged, UNCHANGED_RETRY_LINE } from "../lib/rewrite-length-target.mjs";

const DRAFT = "The draft stays as it is today.";

function createRes() {
  return {
    statusCode: 200,
    body: undefined,
    setHeader() {},
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

afterEach(() => {
  vi.restoreAllMocks();
});

test("whitespace-only differences count as the same text", () => {
  assert.equal(rewriteTextUnchanged("  The draft   stays.\n", "The draft stays."), true);
  assert.equal(rewriteTextUnchanged("The draft stays shorter.", "The draft stays."), false);
});

test("an unchanged rewrite is retried once and then flagged", async () => {
  vi.spyOn(observability, "hasProviderApiKey").mockReturnValue(true);
  vi.spyOn(observability, "flushObservability").mockResolvedValue(undefined);
  const llm = vi.spyOn(observability, "callLLM").mockResolvedValue({
    text: JSON.stringify({ draftText: DRAFT }),
  });
  const res = createRes();
  await rewrite({
    method: "POST",
    headers: {},
    body: {
      text: DRAFT,
      instructions: "Make the opening warmer.",
      eventType: "GENERAL",
      outputType: "reporting_commentary",
      visibility: "complete",
      sources: [{ id: "s1", name: "notes.txt", mimeType: "text/plain", text: "The draft stays as it is today in the notes.", role: "facts" }],
    },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(llm.mock.calls.length, 2);
  const second = JSON.stringify(llm.mock.calls[1]);
  assert.equal(second.includes(UNCHANGED_RETRY_LINE), true);
  assert.equal(res.body.unchanged, true);
});

test("a second attempt that changes the text is not flagged unchanged", async () => {
  vi.spyOn(observability, "hasProviderApiKey").mockReturnValue(true);
  vi.spyOn(observability, "flushObservability").mockResolvedValue(undefined);
  vi.spyOn(observability, "callLLM")
    .mockResolvedValueOnce({ text: JSON.stringify({ draftText: DRAFT }) })
    .mockResolvedValueOnce({ text: JSON.stringify({ draftText: "A warmer opening now starts the draft." }) });
  const res = createRes();
  await rewrite({
    method: "POST",
    headers: {},
    body: {
      text: DRAFT,
      instructions: "Make the opening warmer.",
      eventType: "GENERAL",
      outputType: "reporting_commentary",
      visibility: "complete",
      sources: [{ id: "s1", name: "notes.txt", mimeType: "text/plain", text: "A warmer opening now starts the draft in the notes.", role: "facts" }],
    },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.unchanged, false);
  assert.match(res.body.draftText, /warmer opening/);
});
