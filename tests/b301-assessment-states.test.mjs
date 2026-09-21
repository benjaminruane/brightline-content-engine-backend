/**
 * B302. synthesize-review returns which empty state it is.
 * B301 kill: the blank-finding guard still refuses the whole call.
 */
import assert from "node:assert/strict";
import { afterEach, describe, test, vi } from "vitest";
import * as observability from "../lib/observability.js";
import handler from "../api/synthesize-review.js";
import {
  ASSESSMENT_REASONS,
  assessmentStateOf,
} from "../lib/qc/assessment-reason.mjs";
import { synthesisPayloadHasBlankFinding } from "../lib/qc/blank-finding-guard.mjs";

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

describe("B302 assessment reasons", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("assessmentStateOf groups extra routes as could_not_be_written", () => {
    assert.equal(assessmentStateOf(ASSESSMENT_REASONS.WRITTEN), "written");
    assert.equal(assessmentStateOf(ASSESSMENT_REASONS.NOTHING_TO_SAY), "nothing_to_say");
    assert.equal(assessmentStateOf(ASSESSMENT_REASONS.NOT_REQUESTED), "not_requested");
    assert.equal(assessmentStateOf(ASSESSMENT_REASONS.CALL_FAILED), "could_not_be_written");
    assert.equal(assessmentStateOf(ASSESSMENT_REASONS.BLANK_FINDING), "could_not_be_written");
    assert.equal(assessmentStateOf(ASSESSMENT_REASONS.INVALID_READINESS), "could_not_be_written");
    assert.equal(assessmentStateOf(ASSESSMENT_REASONS.MISSING_PROVIDER_KEY), "could_not_be_written");
    assert.equal(assessmentStateOf(ASSESSMENT_REASONS.EMPTY_COMPLETION), "could_not_be_written");
  });

  test("missing readiness returns invalid_readiness and does not call the model", async () => {
    const llmSpy = vi.spyOn(observability, "callLLM").mockResolvedValue({ text: "should not run" });
    const res = createRes();
    await handler(postReq({ qcSummary: {} }), res);
    assert.equal(llmSpy.mock.calls.length, 0);
    assert.deepEqual(res.body, {
      ok: false,
      narrative: "",
      reason: ASSESSMENT_REASONS.INVALID_READINESS,
    });
  });

  test("missing provider key returns missing_provider_key", async () => {
    vi.spyOn(observability, "hasProviderApiKey").mockReturnValue(false);
    const llmSpy = vi.spyOn(observability, "callLLM").mockResolvedValue({ text: "should not run" });
    const res = createRes();
    await handler(postReq({ qcSummary: { readiness: "Needs work" } }), res);
    assert.equal(llmSpy.mock.calls.length, 0);
    assert.deepEqual(res.body, {
      ok: false,
      narrative: "",
      reason: ASSESSMENT_REASONS.MISSING_PROVIDER_KEY,
    });
  });

  test("every finding blank is nothing_to_say and never reaches the model", async () => {
    vi.spyOn(observability, "hasProviderApiKey").mockReturnValue(true);
    const llmSpy = vi.spyOn(observability, "callLLM").mockResolvedValue({ text: "should not run" });
    const res = createRes();
    await handler(
      postReq({
        qcSummary: { readiness: "Needs work" },
        notSupportedStatements: [{ statement: "Returns were strong.", evidenceFinding: "   " }],
        editorialConcerns: [{ statement: "We recommend approval.", concern: "" }],
      }),
      res
    );
    assert.equal(llmSpy.mock.calls.length, 0);
    assert.deepEqual(res.body, {
      ok: false,
      narrative: "",
      reason: ASSESSMENT_REASONS.NOTHING_TO_SAY,
    });
  });

  test("one blank finding among usable findings still never reaches the model", async () => {
    vi.spyOn(observability, "hasProviderApiKey").mockReturnValue(true);
    const llmSpy = vi.spyOn(observability, "callLLM").mockResolvedValue({ text: "should not run" });
    const body = {
      qcSummary: { readiness: "Needs work" },
      notSupportedStatements: [
        { statement: "Returns were strong.", evidenceFinding: "No source supports this claim." },
        { statement: "Headcount is 24.", evidenceFinding: "" },
      ],
    };
    assert.equal(synthesisPayloadHasBlankFinding(body), true);
    const res = createRes();
    await handler(postReq(body), res);
    assert.equal(llmSpy.mock.calls.length, 0);
    assert.deepEqual(res.body, {
      ok: false,
      narrative: "",
      reason: ASSESSMENT_REASONS.BLANK_FINDING,
    });
  });

  test("empty completion is empty_completion, not a written narrative", async () => {
    vi.spyOn(observability, "hasProviderApiKey").mockReturnValue(true);
    vi.spyOn(observability, "callLLM").mockResolvedValue({ text: "  " });
    const res = createRes();
    await handler(postReq({ qcSummary: { readiness: "Ready" } }), res);
    assert.deepEqual(res.body, {
      ok: false,
      narrative: "",
      reason: ASSESSMENT_REASONS.EMPTY_COMPLETION,
    });
  });

  test("a thrown call is call_failed", async () => {
    vi.spyOn(observability, "hasProviderApiKey").mockReturnValue(true);
    vi.spyOn(observability, "callLLM").mockRejectedValue(new Error("provider down"));
    const res = createRes();
    await handler(postReq({ qcSummary: { readiness: "Ready" } }), res);
    assert.deepEqual(res.body, {
      ok: false,
      narrative: "",
      reason: ASSESSMENT_REASONS.CALL_FAILED,
    });
  });

  test("a real narrative is written", async () => {
    vi.spyOn(observability, "hasProviderApiKey").mockReturnValue(true);
    vi.spyOn(observability, "callLLM").mockResolvedValue({
      text: "Needs work. The draft has an unsupported claim about returns.",
    });
    const res = createRes();
    await handler(
      postReq({
        qcSummary: { readiness: "Needs work" },
        notSupportedStatements: [
          { statement: "Returns were strong.", evidenceFinding: "No source supports this claim." },
        ],
      }),
      res
    );
    assert.equal(res.body.ok, true);
    assert.equal(res.body.reason, ASSESSMENT_REASONS.WRITTEN);
    assert.match(res.body.narrative, /Needs work/);
  });
});
