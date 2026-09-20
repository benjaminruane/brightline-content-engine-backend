/**
 * B249 / D2: disclose dropped and uncovered draft spans without re-splitting.
 * Calibration: Shopify messy full extract, 22163 chars.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";
import {
  computeDraftCoverage,
  coverageIsWorthNaming,
  DROPPED_NOT_A_CLAIM_REASON,
} from "../lib/qc/draft-coverage.mjs";
import { STAGE6_CONCURRENCY } from "../lib/qc/pipeline-v4/index.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHOPIFY = path.join(ROOT, "tests/fixtures/b247/shopify-messy-full.json");

function loadShopify() {
  return JSON.parse(readFileSync(SHOPIFY, "utf8"));
}

describe("B249 unchecked sentences (recorded Shopify memo)", () => {
  test("D11 Stage 6 pool is still 4", () => {
    assert.equal(STAGE6_CONCURRENCY, 4);
  });

  test("C2 every card carries positions that slice the draft", () => {
    const payload = loadShopify();
    const draft = payload._auditDraft;
    assert.equal(typeof draft, "string");
    assert.equal(draft.length, 22163);
    const cards = payload.statements.map((row) => row.qcCard);
    assert.equal(cards.length, 184);
    for (const card of cards) {
      assert.equal(Number.isFinite(card.charStart), true);
      assert.equal(Number.isFinite(card.charEnd), true);
      assert.equal(draft.slice(card.charStart, card.charEnd), card.statement);
    }
  });

  test("recorded payload does not disclose the drops (before picture)", () => {
    const payload = loadShopify();
    assert.equal(payload.meta?.draftCoverage, undefined);
  });

  test("coverage from cards names the uncovered Why? run without re-splitting", () => {
    const payload = loadShopify();
    const cards = payload.statements.map((row) => row.qcCard);
    const coverage = computeDraftCoverage({
      draftText: payload._auditDraft,
      cards,
      dropped: [],
    });
    assert.equal(coverageIsWorthNaming(coverage), true);
    assert.equal(coverage.droppedCount, 0);
    assert.ok(coverage.uncoveredCount >= 1);
    assert.ok(coverage.uncoveredChars >= 1200);
    const joined = coverage.uncovered.map((row) => row.text).join("\n");
    assert.match(joined, /Why\?/);
    assert.match(joined, /To: BVP Group/);
  });

  test("a disclosed not-a-claim drop covers its span so it is not also uncovered", () => {
    const draft = "Hello.\nWhy?\nThe fund closed.";
    const whyStart = draft.indexOf("Why?");
    const coverage = computeDraftCoverage({
      draftText: draft,
      cards: [
        { charStart: 0, charEnd: 6, statement: "Hello." },
        { charStart: 12, charEnd: draft.length, statement: "The fund closed." },
      ],
      dropped: [
        {
          text: "Why?",
          charStart: whyStart,
          charEnd: whyStart + 4,
          reason: DROPPED_NOT_A_CLAIM_REASON,
        },
      ],
    });
    assert.equal(coverage.droppedCount, 1);
    assert.equal(coverage.dropped[0].text, "Why?");
    assert.equal(
      coverage.uncovered.some((row) => row.text.includes("Why?")),
      false
    );
  });

  test("whitespace-only gaps between sentences are not named", () => {
    const draft = "Hello.  There.";
    const coverage = computeDraftCoverage({
      draftText: draft,
      cards: [
        { charStart: 0, charEnd: 6 },
        { charStart: 8, charEnd: 14 },
      ],
      dropped: [],
    });
    assert.equal(coverage.uncoveredCount, 0);
  });
});
