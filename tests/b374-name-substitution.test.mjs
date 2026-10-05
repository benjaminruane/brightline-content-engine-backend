/**
 * B374. Offer the name the source states, or offer nothing.
 * Replay stored HICL Review payloads through the action list. No model.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";
import { fillAction, runActionList } from "../lib/revise-actions/run.mjs";
import { findNamePairs } from "../lib/revise-actions/name-pair.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HICL_DIR = path.join(ROOT, "tests/fixtures/real-runs-2026-10-04-hicl");
const OCT_DIR = path.join(ROOT, "tests/fixtures/real-runs-2026-10-02");

const HICL_CLEAN = JSON.parse(readFileSync(path.join(HICL_DIR, "clean-review.json"), "utf8"));
const HICL_DOC = JSON.parse(readFileSync(path.join(HICL_DIR, "doc-review.json"), "utf8"));
const OCT_DOC = JSON.parse(readFileSync(path.join(OCT_DIR, "doc-review.json"), "utf8"));

function throwingModel() {
  return async () => {
    throw new Error("rewrite model must not be called");
  };
}

function conflictEntry(id, statement, excerpt, extra = {}) {
  return {
    id,
    disposition: "ACTION",
    statementId: "0",
    statement,
    kind: "evidence",
    rule: "conflicting",
    thing1: null,
    thing1State: "NONE",
    thing2: "A source contradicts this statement.",
    primaryExcerpt: excerpt,
    suggestedDirection: null,
    sort: { policyPermit: true, silenceOnCard: false, rule: "conflicting", reasonCode: "permitted" },
    card: { primaryExcerpt: excerpt, supportSpans: extra.supportSpans || [] },
  };
}

describe("B374 name substitution", () => {
  test("doctored HICL S3-S5 offer stated names; S6-S7 and partials stay silent", async () => {
    const result = await runActionList(HICL_DOC.statements, { callModel: throwingModel() });
    const byId = Object.fromEntries(result.entries.map((row) => [row.id, row]));

    const s3 = byId["S3:evidence:conflicting:0"];
    assert.equal(s3.disposition, "ACTION");
    assert.equal(
      s3.proposedChange,
      "Replace 'Paris St. Germain High Speed' with 'London St. Pancras High Speed'."
    );
    assert.equal(
      s3.resultingSentence,
      "Among the significant holdings, London St. Pancras High Speed performed well during the period, with international train path bookings slightly ahead of forecast."
    );
    assert.equal(s3.verification.status, "checked");

    const s4 = byId["S4:evidence:conflicting:0"];
    assert.equal(s4.disposition, "ACTION");
    assert.equal(s4.proposedChange, "Replace 'St. Germain' with 'St. Pancras'.");
    assert.equal(
      s4.resultingSentence,
      "On the commercial front, progress has been made on adding a second international operator on the route, while Virgin Trains recently announced its intentions for cross-Channel operations from St. Pancras."
    );
    assert.equal(s4.verification.status, "checked");

    const s5 = byId["S5:evidence:conflicting:0"];
    assert.equal(s5.disposition, "ACTION");
    assert.equal(s5.proposedChange, "Replace 'TowerCo' with 'Fortysouth' and '20' with '16'.");
    assert.equal(
      s5.resultingSentence,
      "Elsewhere, Fortysouth delivered 16 new towers during the past year and is actively progressing additional co-location opportunities, both of which are expected to support continued growth in EBITDA and valuation gains."
    );
    assert.equal(s5.verification.status, "checked");

    const s6 = byId["S6:evidence:conflicting:0"];
    assert.equal(s6.disposition, "ACKNOWLEDGE");
    assert.equal(s6.proposedChange, undefined);

    const s7 = byId["S7:evidence:not_supported:0"];
    assert.equal(s7.disposition, "ACKNOWLEDGE");
    assert.equal(s7.proposedChange, undefined);

    const s1 = byId["S1:evidence:partial:0"];
    assert.equal(s1.disposition, "ACKNOWLEDGE");
    assert.equal(s1.proposedChange, undefined);

    const s2 = byId["S2:evidence:partial:0"];
    assert.equal(s2.disposition, "ACKNOWLEDGE");
    assert.equal(s2.proposedChange, undefined);

    const editorial = result.entries.filter((row) => row.kind === "editorial");
    assert.equal(editorial.length, 1);
    assert.equal(editorial[0].id, "S2:editorial:overreach_unsupported_causal:0");
    assert.equal(editorial[0].disposition, "ACKNOWLEDGE");
    assert.equal(editorial[0].proposedChange, undefined);
  });

  test("clean HICL still has exactly two acknowledge entries and no proposals", async () => {
    const result = await runActionList(HICL_CLEAN.statements, { callModel: throwingModel() });
    assert.equal(result.entries.length, 2);
    assert.equal(
      result.entries.every((row) => row.disposition === "ACKNOWLEDGE" && !row.proposedChange),
      true
    );
    assert.equal(result.entries[0].id, "S1:editorial:overreach_unsupported_causal:0");
    assert.equal(result.entries[1].id, "S6:evidence:partial:0");
  });

  test("3i money proposal still reads GBP 3,291 million", async () => {
    const card = OCT_DOC.statements[0].qcCard;
    const excerpt =
      typeof card.primaryExcerpt === "string" ? card.primaryExcerpt : card.primaryExcerpt?.passage || "";
    const result = await fillAction(
      conflictEntry("S0:evidence:conflicting:0", card.statement, excerpt, {
        supportSpans: card.supportSpans,
      }),
      { callModel: throwingModel() }
    );
    assert.equal(result.proposedChange, "Replace 'GBP 3.3 million' with 'GBP 3,291 million'.");
  });

  test("a party the source never states has no replacement", async () => {
    const statement = "Zyxylon Partners delivered 20 new towers during the period.";
    const excerpt = "The period saw continued investment in the tower estate.";
    assert.equal(findNamePairs(statement, [excerpt]).length, 0);
    const result = await fillAction(conflictEntry("Z:evidence:conflicting:0", statement, excerpt), {
      callModel: throwingModel(),
    });
    assert.equal(result.disposition, "ACKNOWLEDGE");
    assert.equal(result.proposedChange, undefined);
  });

  test("a name plus two source figures of the same kind offers nothing", async () => {
    const statement = "TowerCo delivered 20 new towers during the period.";
    const excerpt = "Fortysouth delivered 16 new towers during the period and completed 18 new towers.";
    const result = await fillAction(conflictEntry("R2:evidence:conflicting:0", statement, excerpt), {
      callModel: throwingModel(),
    });
    assert.equal(result.disposition, "ACKNOWLEDGE");
    assert.equal(result.proposedChange, undefined);
  });
});
