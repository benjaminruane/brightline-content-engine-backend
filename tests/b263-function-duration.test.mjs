/**
 * B263: the analyse Function is allowed 300 seconds, not the old 60.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("B263 function duration is 300 seconds", () => {
  test("vercel.json maxDuration is 300", () => {
    const vercel = JSON.parse(readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
    const duration = vercel?.functions?.["api/*.js"]?.maxDuration;
    assert.equal(duration, 300);
  });
});
