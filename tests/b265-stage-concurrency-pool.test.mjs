/**
 * B277. Stages 5 and 6 use the shared pool helper. Stage 2 stays at 24.
 * Concurrency for 5 and 6 is planned at run time, not a constant.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";
import { mapPool, mapPoolPaced } from "../lib/qc/map-pool.mjs";
import { STAGE2_CONCURRENCY } from "../lib/qc/pipeline-v4/stage2-match-sources.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("B265 Stages 5 and 6 are pooled", () => {
  test("Stage 2 stays at 24", () => {
    assert.equal(STAGE2_CONCURRENCY, 24);
  });

  test("mapPool never runs more than the cap at once and keeps order", async () => {
    const items = Array.from({ length: 40 }, (_, i) => i);
    let inFlight = 0;
    let peak = 0;
    const results = await mapPool(items, 3, async (item) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return item * 2;
    });
    assert.equal(peak <= 3, true, `peak in-flight was ${peak}`);
    assert.deepEqual(results, items.map((n) => n * 2));
  });

  test("mapPoolPaced keeps order", async () => {
    const items = [1, 2, 3];
    const results = await mapPoolPaced(items, 2, async (item) => item + 1, { tokensPerItem: 0 });
    assert.deepEqual(results, [2, 3, 4]);
  });

  test("the v4 pipeline uses mapPoolPaced for Stage 6 and Stage 5", () => {
    const src = readFileSync(path.join(ROOT, "lib/qc/pipeline-v4/index.mjs"), "utf8");
    assert.equal(src.includes("mapPoolPaced"), true);
    assert.equal(/stage2WithEditorial = await mapPoolPaced/.test(src), true);
    assert.equal(src.includes("Promise.all(\n    stageAfterV4Stages34.map"), false);
  });
});
