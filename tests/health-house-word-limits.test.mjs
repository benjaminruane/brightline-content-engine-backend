import { describe, test } from "vitest";
import assert from "node:assert/strict";
import handler from "../api/health.js";
import { getPgCommentaryWordLimit } from "../lib/prompt-library/index.js";
import { PG_WRITING_EVENT } from "../lib/prompt-library/pg-writing-prompts.mjs";
import { VISIBILITY } from "../lib/output-intent.js";

function invokeHealth() {
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

describe("health houseWordLimits", () => {
  test("houseWordLimits matches getPgCommentaryWordLimit for each event key and visibility", async () => {
    const { status, json } = await invokeHealth();
    assert.equal(status, 200);
    assert.ok(json?.houseWordLimits && typeof json.houseWordLimits === "object");

    for (const eventKey of Object.values(PG_WRITING_EVENT)) {
      const publicLimit = getPgCommentaryWordLimit(eventKey, VISIBILITY.PUBLIC);
      const completeLimit = getPgCommentaryWordLimit(eventKey, VISIBILITY.COMPLETE);
      if (publicLimit == null && completeLimit == null) {
        assert.equal(json.houseWordLimits[eventKey], undefined);
        continue;
      }
      const published = json.houseWordLimits[eventKey];
      assert.ok(published && typeof published === "object");
      assert.equal(published.public, publicLimit);
      assert.equal(published.complete, completeLimit);
    }
  });
});
