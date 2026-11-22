/**
 * B567. Health reports the release version and the build.
 * A frontend preview origin is allowed. An unrelated origin is not.
 */
import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import healthHandler from "../api/health.js";
import { applyCors } from "../lib/http/frontend-origins.mjs";
import { resetSqlCache, setSqlOverrideForTests } from "../lib/db/client.mjs";
import { readReleaseVersion } from "../lib/release-version.mjs";

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

afterEach(() => {
  setSqlOverrideForTests(null);
  resetSqlCache();
  vi.unstubAllEnvs();
});

test("health reports the release version and the build", async () => {
  vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "ad1afd4f1371e88efe41edf79a75fda9ebdbea96");
  vi.stubEnv("VERCEL_GIT_COMMIT_REF", "main");
  setSqlOverrideForTests({
    async query() {
      return [{ "?column?": 1 }];
    },
  });
  const res = createRes();
  await healthHandler({ method: "GET", headers: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.version, "0.9.0");
  assert.equal(res.body.version, readReleaseVersion());
  assert.equal(res.body.build.commit, "ad1afd4");
  assert.equal(res.body.build.ref, "main");
});

test("a frontend preview origin is allowed and an unrelated origin is not", () => {
  vi.stubEnv("FRONTEND_ORIGINS", "https://app.brightlineinsights.com");
  const preview = "https://brightline-content-engine-frontend-git-main-brightline-5c69b471.vercel.app";
  const allowed = createRes();
  applyCors({ method: "GET", headers: { origin: preview } }, allowed, { methods: "GET,OPTIONS" });
  assert.equal(allowed.headers["Access-Control-Allow-Origin"], preview);

  const deployment = createRes();
  const deploymentOrigin = "https://brightline-content-engine-frontend-abc1234-brightline-5c69b471.vercel.app";
  applyCors({ method: "GET", headers: { origin: deploymentOrigin } }, deployment, {});
  assert.equal(deployment.headers["Access-Control-Allow-Origin"], deploymentOrigin);

  const evil = createRes();
  applyCors({ method: "GET", headers: { origin: "https://evil.vercel.app" } }, evil, {});
  assert.equal(Object.hasOwn(evil.headers, "Access-Control-Allow-Origin"), false);
});
