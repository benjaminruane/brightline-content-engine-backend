import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, test, vi } from "vitest";
import handler from "../api/health.js";
import debugHandler from "../api/debug-node.js";
import {
  authMode,
  requireAccount,
  setSessionReaderForTests,
} from "../lib/auth/require-account.mjs";

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { this.ended = true; return this; },
  };
}

describe("B521 auth off", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    setSessionReaderForTests(null);
  });

  test("health says off and the account gate does not run Clerk", async () => {
    vi.stubEnv("AUTH_MODE", "");
    assert.equal(authMode(), "off");
    let reads = 0;
    setSessionReaderForTests(() => {
      reads += 1;
      return { accountId: "acc_should_not_run", email: "a@example.com", name: "Ada" };
    });
    const account = await requireAccount({ headers: { authorization: "Bearer token" } }, mockRes());
    assert.deepEqual(account, { accountId: null });
    assert.equal(reads, 0);

    const res = mockRes();
    await handler({ method: "GET", headers: {} }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.authMode, "off");

    const debug = mockRes();
    await debugHandler({ method: "GET", headers: {} }, debug);
    assert.equal(debug.statusCode, 200);
    assert.equal(debug.body.ok, true);
  });

  test("health and cron are the only routes without the account gate", () => {
    const apiDir = path.resolve("api");
    const routes = readdirSync(apiDir).filter((name) => name.endsWith(".js"));
    for (const name of routes) {
      const text = readFileSync(path.join(apiDir, name), "utf8");
      if (name === "health.js") {
        assert.equal(text.includes("requireAccount"), false);
        assert.equal(text.includes("authMode"), true);
      } else {
        assert.equal(text.includes("requireAccount"), true, name);
        assert.equal(text.includes("applyCors"), true, name);
      }
    }
    const cron = readFileSync(path.resolve("api/cron/langfuse-retention.js"), "utf8");
    assert.equal(cron.includes("requireAccount"), false);
  });
});
