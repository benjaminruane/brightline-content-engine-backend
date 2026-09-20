/**
 * B265: Stages 5 and 6 share Stage 2's pool helper at concurrency 24.
 * Spec named this file b263; B263 was already the duration filing, so this is B265.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";
import { mapPool } from "../lib/qc/map-pool.mjs";
import {
  STAGE5_CONCURRENCY,
  STAGE6_CONCURRENCY,
} from "../lib/qc/pipeline-v4/index.mjs";
import { STAGE2_CONCURRENCY } from "../lib/qc/pipeline-v4/stage2-match-sources.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("B265 Stages 5 and 6 are pooled", () => {
  test("Stage 5 matches Stage 2 at 24; Stage 6 is no longer this cap (B268)", () => {
    assert.equal(STAGE2_CONCURRENCY, 24);
    assert.equal(STAGE5_CONCURRENCY, 24);
    assert.notEqual(STAGE6_CONCURRENCY, STAGE2_CONCURRENCY);
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

  test("the v4 pipeline uses mapPool for Stage 6 and Stage 5", () => {
    const src = readFileSync(path.join(ROOT, "lib/qc/pipeline-v4/index.mjs"), "utf8");
    assert.equal(src.includes("STAGE5_CONCURRENCY"), true);
    assert.equal(src.includes("STAGE6_CONCURRENCY"), true);
    assert.equal(/stage2WithEditorial = await mapPool/.test(src), true);
    assert.equal(/await mapPool\(\s*stage2WithExcerpts/.test(src), true);
    assert.equal(src.includes("Promise.all(\n    stageAfterV4Stages34.map"), false);
  });
});
