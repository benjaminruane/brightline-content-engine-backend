import assert from "node:assert/strict";
import { afterEach, describe, test, vi } from "vitest";
import healthHandler from "../api/health.js";
import reviewHandler from "../api/review-state.js";
import {
  DEFAULT_FRONTEND_ORIGIN,
  allowedOrigins,
  applyCors,
} from "../lib/http/frontend-origins.mjs";

const APP = "https://app.brightlineinsights.com";
const VERCEL = DEFAULT_FRONTEND_ORIGIN;

function mockRes() {
  return {
    statusCode: 200,
    ended: false,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    end() { this.ended = true; return this; },
    json() { return this; },
  };
}

describe("B522 frontend origins", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("each listed origin is echoed, and an unlisted origin gets no Allow-Origin", () => {
    vi.stubEnv("FRONTEND_ORIGINS", ` ${APP}, ${VERCEL} `);
    assert.deepEqual(allowedOrigins(), [APP, VERCEL]);

    const listed = mockRes();
    const done = applyCors(
      { method: "GET", headers: { origin: APP } },
      listed,
      { methods: "GET,POST,OPTIONS", headers: ["x-brightline-diag"] }
    );
    assert.equal(done, false);
    assert.equal(listed.headers["Access-Control-Allow-Origin"], APP);
    assert.equal(listed.headers.Vary, "Origin");
    assert.equal(listed.headers["Access-Control-Allow-Methods"], "GET,POST,OPTIONS");
    assert.match(listed.headers["Access-Control-Allow-Headers"], /Content-Type/);
    assert.match(listed.headers["Access-Control-Allow-Headers"], /Authorization/);
    assert.match(listed.headers["Access-Control-Allow-Headers"], /x-owner-key/);
    assert.match(listed.headers["Access-Control-Allow-Headers"], /x-brightline-diag/);

    const other = mockRes();
    applyCors({ method: "GET", headers: { origin: VERCEL } }, other, { methods: "GET,OPTIONS" });
    assert.equal(other.headers["Access-Control-Allow-Origin"], VERCEL);

    const evil = mockRes();
    applyCors({ method: "POST", headers: { origin: "https://evil.example" } }, evil, {});
    assert.equal(Object.hasOwn(evil.headers, "Access-Control-Allow-Origin"), false);
    assert.equal(Object.hasOwn(evil.headers, "Vary"), false);
  });

  test("preflight is 204 for a listed origin and carries no Allow-Origin when unlisted", () => {
    vi.stubEnv("FRONTEND_ORIGINS", APP);
    const listed = mockRes();
    const handled = applyCors(
      { method: "OPTIONS", headers: { origin: APP } },
      listed,
      { methods: "GET,POST,DELETE,OPTIONS" }
    );
    assert.equal(handled, true);
    assert.equal(listed.statusCode, 204);
    assert.equal(listed.ended, true);
    assert.equal(listed.headers["Access-Control-Allow-Origin"], APP);

    const evil = mockRes();
    applyCors({ method: "OPTIONS", headers: { origin: "https://evil.example" } }, evil, {});
    assert.equal(evil.statusCode, 204);
    assert.equal(Object.hasOwn(evil.headers, "Access-Control-Allow-Origin"), false);
  });

  test("an unset list uses the current frontend origin", async () => {
    vi.stubEnv("FRONTEND_ORIGINS", "");
    assert.deepEqual(allowedOrigins(), [VERCEL]);
    const res = mockRes();
    await healthHandler({ method: "OPTIONS", headers: { origin: VERCEL } }, res);
    assert.equal(res.statusCode, 204);
    assert.equal(res.headers["Access-Control-Allow-Origin"], VERCEL);

    const review = mockRes();
    await reviewHandler({ method: "OPTIONS", headers: { origin: "https://evil.example" } }, review);
    assert.equal(Object.hasOwn(review.headers, "Access-Control-Allow-Origin"), false);
  });
});
