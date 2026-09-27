/**
 * B336. A figure the source repeats verbatim cannot be reported as a conflict.
 * Tests fillAction, the real proposal path, not pre-built tokens.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import {
  applyConflictProposal,
  findCandidatePairs,
  findFigureAgreements,
} from "../lib/revise-actions/conflict-engagement.mjs";
import { fillAction } from "../lib/revise-actions/run.mjs";

const A3_STATEMENT =
  "On the commercial front, Action added 119 new stores in Denmark over the period and remains on track to meet its target of 330 new stores for by end-2025.";
const A3_EXCERPT =
  "Action added 119 new stores to the end of P6 (YTD P6 2023: 90) and remains on track to meet its target of 330 stores added this year.";

const SLUG = "conflict_suppressed_figure_agrees";

function conflictEntry(id, fixture, extra = {}) {
  return {
    id,
    disposition: "ACTION",
    statementId: "0",
    statement: fixture.statement,
    kind: "evidence",
    rule: "conflicting",
    thing1: null,
    thing1State: "NONE",
    thing2: "",
    primaryExcerpt: fixture.primaryExcerpt,
    suggestedDirection: null,
    sort: {
      policyPermit: true,
      silenceOnCard: false,
      rule: "conflicting",
      reasonCode: "permitted",
    },
    ...extra,
  };
}

function throwingModel() {
  return async () => {
    throw new Error("rewrite model must not be called on contradicted evidence");
  };
}

function pairRows(statement, excerpt) {
  return findCandidatePairs(statement, excerpt).map((pair) => ({
    from: pair.from.raw,
    to: pair.to.raw,
  }));
}

describe("B336 conflict agreement guard", () => {
  test("T1 A3 strings: no 119->330 pair, no replace proposal, suppression slug present", async () => {
    const pairs = pairRows(A3_STATEMENT, A3_EXCERPT);
    assert.equal(
      pairs.some((pair) => pair.from === "119"),
      false,
      `unexpected from=119 pair: ${JSON.stringify(pairs)}`
    );
    assert.equal(
      pairs.some((pair) => pair.from === "119" && pair.to === "330"),
      false
    );

    const outcome = applyConflictProposal(
      conflictEntry("T1:evidence:conflicting:0", { statement: A3_STATEMENT, primaryExcerpt: A3_EXCERPT })
    );
    assert.notEqual(outcome.status, "replace");
    assert.equal(outcome.proposal, null);
    assert.equal(outcome.explain?.code, SLUG);
    assert.equal(outcome.explain?.values?.draftRaw, "119");
    assert.equal(outcome.explain?.values?.sourceRaw, "119");

    const result = await fillAction(
      conflictEntry("T1:evidence:conflicting:0", { statement: A3_STATEMENT, primaryExcerpt: A3_EXCERPT }),
      { callModel: throwingModel() }
    );
    assert.equal(result.disposition, "ACKNOWLEDGE");
    assert.equal(result.sort?.reasonCode, "conflict_unaddressed");
    assert.equal(result.explainCode, SLUG);
    assert.equal(result.proposedChange, undefined);
    assert.equal(result.resultingSentence, undefined);
    assert.equal(String(result.proposedChange || "").includes("Replace '119' with '330'"), false);
  });

  test("T2 a genuine conflict still fires 12 -> 9.0 with a proposal", async () => {
    const statement = "Like-for-like sales growth reached 12% for the period";
    const excerpt = "Like-for-like sales growth was 9.0%";
    const pairs = pairRows(statement, excerpt);
    assert.deepEqual(pairs, [{ from: "12%", to: "9.0%" }]);

    const result = await fillAction(
      conflictEntry("T2:evidence:conflicting:0", { statement, primaryExcerpt: excerpt }),
      { callModel: throwingModel() }
    );
    assert.equal(result.disposition, "ACTION");
    assert.equal(result.proposedChange, "Replace '12%' with '9.0%'.");
    assert.equal(result.resultingSentence, "Like-for-like sales growth reached 9.0% for the period");
    assert.notEqual(result.explainCode, SLUG);
  });

  test("T3 agreement inside a citation does not count", async () => {
    const statement = "Action added 90 new stores to the end of P6.";
    const agreements = findFigureAgreements(statement, A3_EXCERPT);
    assert.equal(
      agreements.some((row) => row.draft.raw === "90"),
      false,
      `90 must not be agreed: ${JSON.stringify(agreements.map((row) => row.draft.raw))}`
    );

    const result = await fillAction(
      conflictEntry("T3:evidence:conflicting:0", { statement, primaryExcerpt: A3_EXCERPT }),
      { callModel: throwingModel() }
    );
    assert.notEqual(result.explainCode, SLUG);
  });

  test("T4 mixed sentence: agreed figure untouched, genuine conflict still proposes", async () => {
    const statement =
      "Like-for-like sales growth reached 12% for the period and Action added 119 new stores.";
    const excerpt =
      "Like-for-like sales growth was 9.0% and Action added 119 new stores to the end of P6 (YTD P6 2023: 90) and remains on track to meet its target of 330 stores added this year.";
    const pairs = pairRows(statement, excerpt);
    assert.deepEqual(pairs, [{ from: "12%", to: "9.0%" }]);
    assert.equal(
      pairs.some((pair) => pair.from === "119"),
      false
    );

    const result = await fillAction(
      conflictEntry("T4:evidence:conflicting:0", { statement, primaryExcerpt: excerpt }),
      { callModel: throwingModel() }
    );
    assert.equal(result.disposition, "ACTION");
    assert.equal(result.proposedChange, "Replace '12%' with '9.0%'.");
    assert.match(result.resultingSentence, /9\.0%/);
    assert.match(result.resultingSentence, /119 new stores/);
    assert.equal(result.resultingSentence.includes("Replace"), false);
    assert.equal(/119/.test(result.proposedChange || ""), false);
  });
});
