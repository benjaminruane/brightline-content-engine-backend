import assert from "node:assert/strict";
import { afterEach, describe, test, vi } from "vitest";
import * as observability from "../lib/observability.js";
import handler from "../api/synthesize-review.js";

const D4_SENTENCE =
  "Describe a conflicting statement only as a disagreement between the sources, for example 'the two documents give different figures for X'. Never use any form of the word 'support' about a conflicting statement.";

const B193_LINE =
  "A conflicting statement HAS evidence: two or more sources address it and they disagree. Never describe a conflict as unsupported, unsubstantiated or lacking evidence. A partially confirmed statement is partly backed, not unbacked. Only statements with no source support are unsupported.";

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

afterEach(() => {
  vi.restoreAllMocks();
});

describe("B203 conflict wording in the assessment prompt", () => {
  test("contains the D4 sentence, the B193 conflict line, and the exact-label line", async () => {
    vi.spyOn(observability, "hasProviderApiKey").mockReturnValue(true);
    vi.spyOn(observability, "flushObservability").mockResolvedValue(undefined);
    const llmSpy = vi.spyOn(observability, "callLLM").mockResolvedValue({
      text: "Needs significant work.",
    });
    const res = createRes();
    await handler(
      postReq({
        qcSummary: { readiness: "Needs significant work" },
        conflictingStatements: [
          {
            statement: "The base case generates 2.8x MOIC and 23% gross IRR.",
            evidenceFinding: "",
          },
        ],
      }),
      res
    );
    assert.equal(llmSpy.mock.calls.length, 1);
    const user = JSON.parse(llmSpy.mock.calls[0][0].messages[1].content);
    const instructions = user.instructions;
    assert.equal(Array.isArray(instructions), true);
    assert.equal(instructions.includes(D4_SENTENCE), true);
    assert.equal(instructions.includes(B193_LINE), true);
    assert.equal(
      instructions.includes("Conclude explicitly with one of these exact labels: Needs significant work."),
      true
    );
  });
});
