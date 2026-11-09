/**
 * B485. The estimate counts the selected fixtures, and the ceiling applies to a named run.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "vitest";
import { buildEstimate } from "../scripts/diagnostic/b437/estimate.mjs";

describe("B485 paid pass estimate", () => {
  test("named ids estimate only those fixtures", async () => {
    const named = await buildEstimate({ ids: ["22", "24"] });
    assert.deepEqual(named.perFixture.map((row) => String(row.id).padStart(2, "0")), ["22", "24"]);
    const corpus = await buildEstimate();
    assert.equal(corpus.fixtures, 20);
    assert.equal(named.onePass.usd < corpus.onePass.usd, true);
  });

  test("the ceiling check applies to a named run", () => {
    const src = readFileSync(new URL("../scripts/diagnostic/lib/paid-pass.mjs", import.meta.url), "utf8");
    assert.match(src, /if \(one\.usd > ceilingUsd\)/);
    assert.equal(src.includes("!(Array.isArray(namedIds)"), false);
  });
});
