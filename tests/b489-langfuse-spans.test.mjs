import assert from "node:assert/strict";
import { afterEach, beforeAll, describe, test, vi } from "vitest";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace";
import { callLLM } from "../lib/observability.js";
import {
  flushLangfuse,
  newLangfuseTraceId,
  openLangfuseGeneration,
  recordLangfuseScore,
  resetLangfuseRootsForTests,
  startLangfuseTrace,
  toLangfuseTraceId,
  updateLangfuseTraceMetadata,
  useLangfuseClientForTests,
  useLangfuseSpanExporterForTests,
} from "../lib/langfuse-tracing.mjs";

const exporter = new InMemorySpanExporter();
const scores = [];
useLangfuseSpanExporterForTests(exporter);
useLangfuseClientForTests({
  score: {
    create(data) {
      scores.push(data);
    },
  },
  flush: async () => {},
});

function attr(span, key) {
  const value = span?.attributes?.[key];
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

describe("B489 Langfuse span tree", () => {
  beforeAll(() => {
    vi.stubEnv("LANGFUSE_PUBLIC_KEY", "pk-test");
    vi.stubEnv("LANGFUSE_SECRET_KEY", "sk-test");
    vi.stubEnv("LANGFUSE_BASE_URL", "https://langfuse.example.test");
    vi.stubEnv("LANGFUSE_TRACING_ENVIRONMENT", "test");
  });

  afterEach(() => {
    exporter.reset();
    resetLangfuseRootsForTests();
    scores.length = 0;
  });

  test("a qc-run root holds the glance metadata and the generation is its child", async () => {
    const traceId = newLangfuseTraceId();
    startLangfuseTrace({
      traceId,
      traceName: "qc-run",
      metadata: { pipelineRoute: "v4", statementCount: 2 },
    });
    updateLangfuseTraceMetadata(traceId, { outputType: "reporting_commentary" });
    const generation = openLangfuseGeneration({
      traceId,
      traceName: "qc-run",
      spanName: "stage2-match-sources",
      model: "gpt-4o-2024-08-06",
      input: [{ role: "user", content: "hello" }],
      metadata: { provider: "openai", statementIndex: 1 },
    });
    generation.succeed({
      output: "{\"classification\":\"no_support\"}",
      usage: { inputTokens: 100, outputTokens: 10, cachedInputTokens: 40 },
      metadata: { cachedInputTokens: 40, provider: "openai" },
    });
    recordLangfuseScore({
      traceId,
      name: "stage2_schema_validation_failed",
      value: 1,
      comment: "schema",
    });
    await flushLangfuse();

    const spans = exporter.getFinishedSpans();
    const root = spans.find((span) => span.name === "qc-run");
    const child = spans.find((span) => span.name === "stage2-match-sources");
    assert.ok(root);
    assert.ok(child);
    assert.equal(root.spanContext().traceId, traceId);
    assert.equal(child.spanContext().traceId, traceId);
    assert.equal(child.parentSpanContext?.spanId, root.spanContext().spanId);
    assert.equal(root.attributes["langfuse.internal.is_app_root"], true);
    assert.equal(child.attributes["langfuse.observation.type"], "generation");
    assert.equal(attr(child, "langfuse.trace.name"), "qc-run");
    assert.equal(attr(root, "langfuse.trace.name"), "qc-run");
    assert.equal(child.attributes["langfuse.session.id"], undefined);
    assert.equal(root.attributes["langfuse.session.id"], undefined);
    const usage = attr(child, "langfuse.observation.usage_details");
    assert.equal(usage.input, 60);
    assert.equal(usage.input_cached_tokens, 40);
    assert.equal(usage.output, 10);
    assert.equal(usage.total, 110);
    const rootOutput = attr(root, "langfuse.observation.output");
    assert.equal(rootOutput.pipelineRoute, "v4");
    assert.equal(rootOutput.outputType, "reporting_commentary");
    assert.equal(rootOutput.statementCount, 2);
    assert.equal(scores.length, 1);
    assert.equal(scores[0].traceId, traceId);
    assert.equal(scores[0].name, "stage2_schema_validation_failed");
    assert.equal(spans.some((span) => String(span.name).includes("ingestion")), false);
  });

  test("an arbitrary trace id is shared by the span and the score", async () => {
    const generation = openLangfuseGeneration({
      traceId: "suggest-revision",
      traceName: "suggest-revision",
      spanName: "suggest-revision",
      model: "gpt-5.1-2025-11-13",
      input: [{ role: "user", content: "revise" }],
    });
    generation.succeed({
      output: "revised",
      usage: { inputTokens: 4, outputTokens: 2, cachedInputTokens: 0 },
    });
    recordLangfuseScore({ traceId: "suggest-revision", name: "canary", value: 1 });
    await flushLangfuse();
    const expected = toLangfuseTraceId("suggest-revision");
    const child = exporter.getFinishedSpans().find((span) => span.name === "suggest-revision" && span.attributes["langfuse.observation.type"] === "generation");
    assert.equal(child.spanContext().traceId, expected);
    assert.equal(scores[0].traceId, expected);
  });

  test("callLLM without a provider key still records an error generation", async () => {
    const traceId = newLangfuseTraceId();
    await assert.rejects(
      () =>
        callLLM({
          provider: "anthropic",
          model: "claude-sonnet-4-5",
          messages: [{ role: "user", content: "hello" }],
          traceId,
          traceName: "ask-query",
          spanName: "llm-call",
        }),
      /ANTHROPIC_API_KEY/
    );
    await flushLangfuse();
    const child = exporter.getFinishedSpans().find((span) => span.name === "llm-call");
    assert.ok(child);
    assert.equal(child.spanContext().traceId, traceId);
    assert.equal(child.attributes["langfuse.observation.level"], "ERROR");
    assert.notEqual(child.parentSpanContext?.spanId, "0000000000000001");
  });
});
