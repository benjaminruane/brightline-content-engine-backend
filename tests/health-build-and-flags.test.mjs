/**
 * B340. Health names the build and reports resolved flags.
 * No model calls.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, test } from "vitest";
import { vi } from "vitest";

import healthHandler from "../api/health.js";
import analyseHandler from "../api/analyse-statements.js";
import { resetSqlCache, setSqlOverrideForTests } from "../lib/db/client.mjs";
import { isClaimSpansEnabled } from "../lib/qc/claim-spans.mjs";
import { isStage2SpanEnabled } from "../lib/qc/pipeline-v4/stage2-match-sources.mjs";
import { isLlmCacheEnabled } from "../lib/qc/llm-cache.mjs";
import { isMultisourceCoverageEnabled } from "../lib/qc/coverage-union.mjs";
import { isExtractStructureEnabled, resolvePdfEngine } from "../lib/extract-text-from-source.mjs";
import { isRaisedCharactersEnabled } from "../lib/extract-pdf-direct.mjs";
import { isNarrativeCoherenceEnabled } from "../lib/qc/narrative-coherence.mjs";
import { readBuildIdentity } from "../lib/qc/build-identity.mjs";
import { buildIncompleteReviewResponse } from "../lib/qc/review-deadline.mjs";
import { INCOMPLETE_CAUSES } from "../lib/qc/not-reviewed-reason.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const B2_FLAGS = [
  "claimSpans",
  "stage2Span",
  "llmCache",
  "multisourceCoverage",
  "pdfEngine",
  "extractStructure",
  "raisedCharacters",
  "narrativeCoherence",
];

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

function invokeHealth() {
  setSqlOverrideForTests({
    async query() {
      return [{ "?column?": 1 }];
    },
  });
  const res = createRes();
  return healthHandler({ method: "GET", headers: {} }, res).then(() => res);
}

function hugeText(words) {
  return Array.from({ length: words }, (_, i) => `word${i}`).join(" ");
}

afterEach(() => {
  setSqlOverrideForTests(null);
  resetSqlCache();
  vi.unstubAllEnvs();
});

describe("B340 health build and resolved flags", () => {
  test("T1 health returns a build object with commit, ref and source", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "fa1eade47b73733d6312d5abfad33ce9e4068081");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "main");
    const res = await invokeHealth();
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.build.commit, "fa1eade");
    assert.equal(res.body.build.ref, "main");
    assert.equal(res.body.build.source, "vercel-env");
  });

  test("T2 absent git env returns source unavailable and does not throw", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "");
    vi.stubEnv("VERCEL_GIT_COMMIT_MESSAGE", "");
    const res = await invokeHealth();
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.build, {
      commit: "unavailable",
      ref: "unavailable",
      source: "unavailable",
    });
  });

  test("T3 every B2 flag is resolved by the pipeline resolver", async () => {
    const res = await invokeHealth();
    const env = res.body.environment;
    for (const key of B2_FLAGS) {
      assert.equal(env[key] && typeof env[key] === "object", true, key);
      assert.equal("resolved" in env[key], true, key);
      assert.equal(typeof env[key].differsFromDefault, "boolean", key);
    }
    assert.equal(env.claimSpans.resolved, isClaimSpansEnabled());
    assert.equal(env.stage2Span.resolved, isStage2SpanEnabled());
    assert.equal(env.llmCache.resolved, isLlmCacheEnabled());
    assert.equal(env.multisourceCoverage.resolved, isMultisourceCoverageEnabled());
    assert.equal(env.pdfEngine.resolved, resolvePdfEngine());
    assert.equal(env.extractStructure.resolved, isExtractStructureEnabled());
    assert.equal(env.raisedCharacters.resolved, isRaisedCharactersEnabled());
    assert.equal(env.narrativeCoherence.resolved, isNarrativeCoherenceEnabled());
  });

  test("T4 editorial true is OFF and the name is listed without the value", async () => {
    vi.stubEnv("BRIGHTLINE_EDITORIAL_REVIEW", "true");
    vi.stubEnv("QC_PIPELINE_V4", "1");
    vi.stubEnv("AUTHORING_ORGANISATION", "Brightline");
    const res = await invokeHealth();
    assert.equal(res.body.environment.editorialReview, false);
    assert.equal(res.body.environment.unrecognisedFlags.includes("BRIGHTLINE_EDITORIAL_REVIEW"), true);
    const serialised = JSON.stringify(res.body);
    assert.equal(serialised.includes('"true"'), false);
    assert.equal(serialised.includes("BRIGHTLINE_EDITORIAL_REVIEW"), true);
  });

  test("T5 stage 2 span 1 is resolved true and differs from default", async () => {
    vi.stubEnv("QC_STAGE2_SPAN", "1");
    const res = await invokeHealth();
    assert.equal(isStage2SpanEnabled(), true);
    assert.equal(res.body.environment.stage2Span.resolved, true);
    assert.equal(res.body.environment.stage2Span.differsFromDefault, true);
  });

  test("T6 no secret, key or connection string in the health body", async () => {
    const secret = "b340-secret-value-do-not-emit";
    vi.stubEnv("OPENAI_API_KEY", secret);
    vi.stubEnv("ANTHROPIC_API_KEY", secret);
    vi.stubEnv("DATABASE_URL", `postgresql://neondb_owner:${secret}@localhost/neondb`);
    vi.stubEnv("LANGFUSE_SECRET_KEY", secret);
    vi.stubEnv("LANGFUSE_PUBLIC_KEY", secret);
    vi.stubEnv("TAVILY_API_KEY", secret);
    const res = await invokeHealth();
    const serialised = JSON.stringify(res.body);
    assert.equal(serialised.includes(secret), false);
    assert.equal(serialised.includes("postgresql://"), false);
    assert.equal(/sk-[A-Za-z0-9]/.test(serialised), false);
  });

  test("T7 a Review payload meta carries the same build object", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "aa11bb22cc33dd44ee55ff6677889900aabbccdd");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "main");
    vi.stubEnv("QC_PIPELINE_V4", "1");
    const expected = readBuildIdentity();
    const incomplete = buildIncompleteReviewResponse({
      cause: INCOMPLETE_CAUSES.TOO_LARGE,
      expectedSentences: 1,
      reachedSentences: 0,
      pipelineVersion: "v4",
    });
    assert.deepEqual(incomplete.meta.build, expected);

    const src = readFileSync(path.join(ROOT, "api/analyse-statements.js"), "utf8");
    assert.equal(src.includes("build: readBuildIdentity()"), true);

    const res = createRes();
    await analyseHandler(
      {
        method: "POST",
        headers: {},
        body: {
          draftText: hugeText(80_000),
          sources: [{ text: hugeText(80_000), label: "source" }],
          options: { pipelineRoute: "v4", outputType: "reporting_commentary" },
        },
      },
      res
    );
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.meta.build, expected);
  });
});
