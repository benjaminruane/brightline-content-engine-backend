import assert from "node:assert/strict";
import { afterEach, describe, test, vi } from "vitest";
import { createTraceId, flushObservability } from "../lib/observability.js";
import {
  langfuseUsageDetails,
  toLangfuseTraceId,
} from "../lib/langfuse-tracing.mjs";
import {
  listObservationsV2,
  observationsV2Path,
  parseObservationIo,
  sumObservationCost,
} from "../scripts/diagnostic/lib/langfuse-public.mjs";

describe("B489 Langfuse id and usage contracts", () => {
  test("createTraceId is a 32-hex W3C trace id", () => {
    const id = createTraceId();
    assert.match(id, /^[0-9a-f]{32}$/);
    assert.equal(toLangfuseTraceId(id), id);
  });

  test("a UUID and an arbitrary string both become 32 hex", () => {
    assert.equal(
      toLangfuseTraceId("A9FCA83A-1111-4222-8333-444444444444"),
      "a9fca83a111142228333444444444444"
    );
    const first = toLangfuseTraceId("suggest-revision");
    const second = toLangfuseTraceId("suggest-revision");
    assert.match(first, /^[0-9a-f]{32}$/);
    assert.equal(first, second);
    assert.notEqual(first, toLangfuseTraceId("suggest-revision-retry"));
  });

  test("cached input tokens are an exclusive bucket", () => {
    assert.deepEqual(
      langfuseUsageDetails({ inputTokens: 100, outputTokens: 10, cachedInputTokens: 40 }),
      { input: 60, output: 10, input_cached_tokens: 40, total: 110 }
    );
    assert.deepEqual(langfuseUsageDetails(null), { input: 0, output: 0, total: 0 });
  });

  test("flush without credentials does not throw", async () => {
    vi.stubEnv("LANGFUSE_PUBLIC_KEY", "");
    vi.stubEnv("LANGFUSE_SECRET_KEY", "");
    vi.stubEnv("LANGFUSE_HOST", "");
    vi.stubEnv("LANGFUSE_BASE_URL", "");
    await flushObservability();
  });
});

describe("B489 observations v2 reads", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  test("the query requires a time range and uses cursor pagination", () => {
    const path = observationsV2Path({
      fromStartTime: "2026-01-01T00:00:00.000Z",
      toStartTime: "2026-11-11T00:00:00.000Z",
      traceId: "abc",
      fields: "core,basic,usage",
      cursor: "next",
    });
    assert.match(path, /^\/api\/public\/v2\/observations\?/);
    assert.match(path, /fromStartTime=/);
    assert.match(path, /traceId=abc/);
    assert.match(path, /cursor=next/);
    assert.doesNotMatch(path, /\/api\/public\/observations\?/);
  });

  test("a missing time range is refused before fetch", async () => {
    let called = false;
    vi.stubGlobal("fetch", async () => {
      called = true;
      throw new Error("fetch should not run");
    });
    const result = await listObservationsV2({});
    assert.equal(result.ok, false);
    assert.equal(result.error, "missing time range");
    assert.equal(called, false);
  });

  test("string input and output are parsed and cost is summed", async () => {
    vi.stubEnv("LANGFUSE_HOST", "https://langfuse.example.test");
    vi.stubEnv("LANGFUSE_PUBLIC_KEY", "pk");
    vi.stubEnv("LANGFUSE_SECRET_KEY", "sk");
    const pages = [
      {
        data: [
          {
            id: "obs-1",
            traceId: "trace-1",
            input: JSON.stringify([{ role: "user", content: "hello" }]),
            output: JSON.stringify({ classification: "no_support" }),
            totalCost: 1.25,
          },
        ],
        meta: { cursor: "page-2" },
      },
      {
        data: [{ id: "obs-2", traceId: "trace-1", totalCost: "0.75" }],
        meta: {},
      },
    ];
    vi.stubGlobal("fetch", async (url) => {
      const body = String(url).includes("cursor=page-2") ? pages[1] : pages[0];
      return { ok: true, status: 200, json: async () => body };
    });
    const listed = await listObservationsV2({
      fromStartTime: "2026-01-01T00:00:00.000Z",
      toStartTime: "2026-11-11T00:00:00.000Z",
      fields: "core,basic,io,usage",
    });
    assert.equal(listed.ok, true);
    assert.equal(listed.truncated, false);
    assert.deepEqual(listed.rows[0].output, { classification: "no_support" });
    assert.equal(sumObservationCost(listed.rows), 2);
    assert.equal(parseObservationIo("not-json"), "not-json");
  });
});
