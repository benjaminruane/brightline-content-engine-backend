/**
 * B520. Nightly Langfuse retention. Mocked fetch, no network.
 */
import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import { runRetention } from "../lib/langfuse-retention.mjs";
import handler from "../api/cron/langfuse-retention.js";

const KEYS = ["LANGFUSE_BASE_URL", "LANGFUSE_HOST", "LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY", "CRON_SECRET"];
const SAVED = Object.fromEntries(KEYS.map((name) => [name, process.env[name]]));

afterEach(() => {
  for (const name of KEYS) {
    if (SAVED[name] === undefined) delete process.env[name];
    else process.env[name] = SAVED[name];
  }
});

function configure() {
  process.env.LANGFUSE_BASE_URL = "https://cloud.langfuse.com";
  delete process.env.LANGFUSE_HOST;
  process.env.LANGFUSE_PUBLIC_KEY = "pk-test";
  process.env.LANGFUSE_SECRET_KEY = "sk-test";
}

function observation(traceId, startTime) {
  return { traceId, startTime };
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

/**
 * Pages are arrays of observation rows for the cutoff window.
 * A later window, or a cursor past the last page, is empty.
 */
function mockFetch({ pages, onDelete }) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const method = init.method || "GET";
    const parsed = new URL(url);
    let body = null;
    if (typeof init.body === "string" && init.body) body = JSON.parse(init.body);
    calls.push({ url: parsed, method, headers: init.headers || {}, body });
    if (method === "DELETE") {
      onDelete?.(body);
      return jsonResponse({ ok: true });
    }
    const to = parsed.searchParams.get("toStartTime");
    const cursor = parsed.searchParams.get("cursor");
    const cutoff = pages.cutoff;
    if (to !== cutoff) return jsonResponse({ data: [], meta: {} });
    const index = cursor ? Number(cursor) : 0;
    const data = pages.rows[index] || [];
    const next = index + 1 < pages.rows.length ? String(index + 1) : null;
    return jsonResponse({ data, meta: next ? { cursor: next } : {} });
  };
  return { fetchImpl, calls };
}

test("cutoff is exactly 30 days, and a trace at or after cutoff is never deleted", async () => {
  configure();
  const now = new Date("2026-11-16T12:00:00.000Z");
  const cutoff = "2026-10-17T12:00:00.000Z";
  const { fetchImpl, calls } = mockFetch({
    pages: {
      cutoff,
      rows: [[
        observation("old", "2026-10-17T11:59:59.999Z"),
        observation("edge", cutoff),
        observation("newer", "2026-10-17T12:00:00.001Z"),
        { id: "legacy-new", timestamp: "2026-11-01T00:00:00.000Z" },
      ]],
    },
  });
  const result = await runRetention({
    now,
    dryRun: false,
    fetchImpl,
    sleepImpl: async () => {},
  });
  assert.equal(result.cutoff, cutoff);
  assert.equal(result.found, 1);
  assert.equal(result.deleted, 1);
  assert.equal(result.dryRun, false);
  const deletes = calls.filter((call) => call.method === "DELETE");
  assert.equal(deletes.length, 1);
  assert.deepEqual(deletes[0].body, { traceIds: ["old"] });
  const list = calls.find((call) => call.method === "GET");
  assert.equal(list.url.pathname, "/api/public/v2/observations");
  assert.equal(list.url.searchParams.get("toStartTime"), cutoff);
  assert.equal(list.url.searchParams.get("fields"), "core");
  assert.equal(list.headers.Authorization, `Basic ${Buffer.from("pk-test:sk-test").toString("base64")}`);
});

test("batches stay at or under 1000 ids and at or under 10 delete requests", async () => {
  configure();
  const now = new Date("2026-11-16T12:00:00.000Z");
  const cutoff = "2026-10-17T12:00:00.000Z";
  const rows = [];
  const page = [];
  for (let i = 0; i < 2500; i += 1) {
    page.push(observation(`t${i}`, "2026-10-01T00:00:00.000Z"));
    if (page.length === 1000) {
      rows.push(page.splice(0));
    }
  }
  if (page.length) rows.push(page);
  const sleeps = [];
  const { fetchImpl, calls } = mockFetch({ pages: { cutoff, rows } });
  const result = await runRetention({
    now,
    fetchImpl,
    sleepImpl: async (ms) => { sleeps.push(ms); },
  });
  const deletes = calls.filter((call) => call.method === "DELETE");
  assert.equal(result.found, 2500);
  assert.equal(result.deleted, 2500);
  assert.equal(result.deleteRequests, 3);
  assert.ok(result.deleteRequests <= 10);
  assert.deepEqual(deletes.map((call) => call.body.traceIds.length), [1000, 1000, 500]);
  for (const call of deletes) assert.ok(call.body.traceIds.length <= 1000);
  assert.ok(sleeps.length >= 1);
  assert.ok(sleeps.every((ms) => ms >= 2000));
});

test("a dry run lists and deletes nothing", async () => {
  configure();
  const now = new Date("2026-11-16T12:00:00.000Z");
  const cutoff = "2026-10-17T12:00:00.000Z";
  const { fetchImpl, calls } = mockFetch({
    pages: { cutoff, rows: [[observation("old", "2026-10-01T00:00:00.000Z")]] },
  });
  const result = await runRetention({ now, dryRun: true, fetchImpl, sleepImpl: async () => {} });
  assert.equal(result.found, 1);
  assert.equal(result.deleted, 0);
  assert.equal(result.deleteRequests, 0);
  assert.equal(result.dryRun, true);
  assert.equal(calls.some((call) => call.method === "DELETE"), false);
});

test("missing host or keys deletes nothing", async () => {
  delete process.env.LANGFUSE_BASE_URL;
  delete process.env.LANGFUSE_HOST;
  delete process.env.LANGFUSE_PUBLIC_KEY;
  delete process.env.LANGFUSE_SECRET_KEY;
  let called = false;
  const result = await runRetention({
    now: new Date("2026-11-16T12:00:00.000Z"),
    fetchImpl: async () => { called = true; return jsonResponse({}); },
    sleepImpl: async () => {},
  });
  assert.deepEqual(result, { skipped: "not_configured" });
  assert.equal(called, false);
});

test("retentionDays below 7 throws", async () => {
  configure();
  await assert.rejects(
    () => runRetention({ now: new Date(), retentionDays: 6, fetchImpl: async () => jsonResponse({}), sleepImpl: async () => {} }),
    /7/
  );
});

test("the route without the secret returns 401 and does not run", async () => {
  configure();
  process.env.CRON_SECRET = "not-the-request";
  let called = false;
  const req = { method: "GET", headers: {}, query: {} };
  const res = {
    statusCode: 0,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    setHeader() {},
  };
  const original = globalThis.fetch;
  globalThis.fetch = async () => { called = true; return jsonResponse({}); };
  try {
    await handler(req, res);
  } finally {
    globalThis.fetch = original;
  }
  assert.equal(res.statusCode, 401);
  assert.equal(called, false);
});
