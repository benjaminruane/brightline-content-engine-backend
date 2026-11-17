import assert from "node:assert/strict";
import { afterEach, beforeAll, describe, test } from "vitest";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace";
import { rememberAccount } from "../lib/auth/require-account.mjs";
import {
  flushLangfuse,
  newLangfuseTraceId,
  openLangfuseGeneration,
  resetLangfuseRootsForTests,
  startLangfuseTrace,
  useLangfuseSpanExporterForTests,
} from "../lib/langfuse-tracing.mjs";

const exporter = new InMemorySpanExporter();

function finishCall(traceId) {
  const generation = openLangfuseGeneration({
    traceId,
    traceName: "qc-run",
    spanName: "llm-call",
    model: "gpt-4o-2024-08-06",
    input: [{ role: "user", content: "hello" }],
  });
  assert.ok(generation);
  generation.succeed({
    output: "ok",
    usage: { inputTokens: 1, outputTokens: 1, cachedInputTokens: 0 },
  });
}

describe("B521 trace user", () => {
  beforeAll(() => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk-test";
    process.env.LANGFUSE_SECRET_KEY = "sk-test";
    process.env.LANGFUSE_BASE_URL = "https://langfuse.example.test";
    process.env.LANGFUSE_TRACING_ENVIRONMENT = "test";
    useLangfuseSpanExporterForTests(exporter);
  });

  afterEach(() => {
    exporter.reset();
    resetLangfuseRootsForTests();
  });

  test("a trace with no account does not set a user id", async () => {
    const traceId = newLangfuseTraceId();
    startLangfuseTrace({
      traceId,
      traceName: "qc-run",
      metadata: { pipelineRoute: "v4" },
    });
    finishCall(traceId);
    await flushLangfuse();
    assert.equal(exporter.getFinishedSpans().some((span) => span.attributes?.["user.id"]), false);
  });

  test("an account id is the trace user id", async () => {
    rememberAccount({ accountId: "user_42" });
    const traceId = newLangfuseTraceId();
    startLangfuseTrace({
      traceId,
      traceName: "qc-run",
      metadata: { pipelineRoute: "v4" },
    });
    finishCall(traceId);
    await flushLangfuse();
    assert.equal(
      exporter.getFinishedSpans().some((span) => span.attributes?.["user.id"] === "user_42"),
      true
    );
  });
});
