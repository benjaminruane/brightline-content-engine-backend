/**
 * B462. Every non-zero check is its own summary line. There is no cap.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";
import { summariseReview } from "../lib/qc/review-summary.mjs";
import { summaryBulletsFromReview } from "../lib/qc/summary-bullets.mjs";
import { summaryBullets } from "../../brightline-content-engine-frontend/src/modules/drafting/reviewSummaryDisplay.js";

const OPTIONS = { evidenceEnabled: true, editorialEnabled: true, complianceEnabled: true };
const EXPECTED = [1, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 5, 5, 5];
const pass = path.join(path.dirname(fileURLToPath(import.meta.url)), "../scripts/diagnostic/b456/pass-1.json");

function slots(summary) {
  const ev = summary?.evidence || {};
  const names = [];
  if (ev.notSupported > 0) names.push("unsupported");
  if (ev.conflicting > 0) names.push("conflicting");
  if ((summary?.notChecked || 0) > 0) names.push("not checked");
  if (ev.beyond > 0) names.push("beyond");
  if (ev.partial > 0) names.push("partial");
  if (ev.needsLook > 0) names.push("needs a look");
  if ((summary?.signalConcerns || 0) > 0) names.push("editorial or compliance");
  if (ev.unbadged > 0) names.push("unbadged");
  return names;
}

describe("B462 summary lines", () => {
  test("the pass shows every check, and both sides write the same list", () => {
    const cards = JSON.parse(readFileSync(pass, "utf8")).cards;
    const groups = new Map();
    for (const card of cards) {
      const id = String(card.fixtureId).padStart(2, "0");
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push(card);
    }
    assert.equal(groups.size, 20);
    const lengths = [];
    for (const group of groups.values()) {
      const summary = summariseReview(group, OPTIONS);
      const backend = summaryBulletsFromReview(summary);
      const screen = summaryBullets(summary);
      assert.deepEqual(screen, backend);
      assert.equal(backend.some((line) => /not shown/.test(line)), false);
      const names = slots(summary);
      assert.equal(backend.length, names.length);
      if (names.includes("editorial or compliance")) {
        assert.equal(backend.some((line) => /editorial notes|compliance notes/.test(line)), true);
      }
      lengths.push(backend.length);
    }
    lengths.sort((a, b) => a - b);
    assert.deepEqual(lengths, EXPECTED);
  });
});
