import { describe, test, afterEach } from "vitest";
import assert from "node:assert/strict";
import handler from "../api/health.js";
import { OUTPUT_TYPE_LENGTH } from "../lib/prompt-library/outputTypeGuidance.js";
import { resetSqlCache, setSqlOverrideForTests } from "../lib/db/client.mjs";

function invokeHealth() {
  setSqlOverrideForTests({
    async query() {
      return [{ "?column?": 1 }];
    },
  });
  const headers = {};
  let status = null;
  let json = null;
  const req = { method: "GET" };
  const res = {
    setHeader(k, v) {
      headers[k] = v;
    },
    status(code) {
      status = code;
      return this;
    },
    json(body) {
      json = body;
      return this;
    },
    end() {
      return this;
    },
  };
  return handler(req, res).then(() => ({ status, json, headers }));
}

afterEach(() => {
  setSqlOverrideForTests(null);
  resetSqlCache();
});

describe("health houseWordLimits", () => {
  test("houseWordLimits is the output type word range", async () => {
    const { status, json } = await invokeHealth();
    assert.equal(status, 200);
    for (const [outputType, range] of Object.entries(OUTPUT_TYPE_LENGTH)) {
      assert.deepEqual(json.houseWordLimits[outputType], { min: range.min, max: range.max });
    }
  });
});
