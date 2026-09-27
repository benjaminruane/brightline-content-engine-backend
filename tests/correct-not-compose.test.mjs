/**
 * B338. The product corrects what it can derive and never composes prose.
 * Tests fillAction / runActionList with a throwing model.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { findCandidatePairs } from "../lib/revise-actions/conflict-engagement.mjs";
import { fillAction, runActionList } from "../lib/revise-actions/run.mjs";
import { NO_PROPOSAL } from "../lib/revise-actions/sort.mjs";

const SLUG = "conflict_suppressed_figure_agrees";

const S1_STATEMENT = "Like-for-like sales growth reached 12% for the period";
const S1_EXCERPT =
  'In the six months to the end of Action\'s P6 (ending 30 June 2024), like-for-like ("LFL") sales growth was 9.0%.';

const S4_STATEMENT =
  "Following the refinancing, 3i recycled a portion of its proceeds to acquire an additional holding in the company in April 2024, increasing its stake to 56.7%.";
const S4_EXCERPT =
  "3i used EUR 821 million of the EUR 1,374 million gross proceeds received to acquire further shares in Action, increasing our gross equity stake from 54.8% to 57.6%.";

const T4_STATEMENT = "...remains on track to meet its target of 330 new stores for by end-2025.";
const T4_EXCERPT = "...target of 330 stores added this year.";

const A3_STATEMENT =
  "On the commercial front, Action added 119 new stores in Denmark over the period and remains on track to meet its target of 330 new stores for by end-2025.";
const A3_EXCERPT =
  "Action added 119 new stores to the end of P6 (YTD P6 2023: 90) and remains on track to meet its target of 330 stores added this year.";

function throwingModel() {
  return async () => {
    throw new Error("rewrite model must not be consulted");
  };
}

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
    thing2: fixture.thing2 || "A source contradicts this statement.",
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

function editorialEntry(rule, statement, thing2) {
  return {
    id: `S0:editorial:${rule}:0`,
    disposition: "ACTION",
    statementId: "0",
    statement,
    kind: "editorial",
    rule,
    thing1: null,
    thing1State: "NONE",
    thing2,
    suggestedDirection: "Rewrite the sentence.",
    sort: {
      policyPermit: true,
      silenceOnCard: false,
      rule,
      reasonCode: "permitted",
    },
  };
}

function statementRow(id, statement, card) {
  return {
    id: String(id),
    text: statement,
    qcCard: {
      index: Number(id),
      statement,
      ...card,
    },
  };
}

describe("B338 correct not compose", () => {
  test("T1 invariant: no authored entry carries proposedChange", async () => {
    const statements = [
      statementRow(1, S1_STATEMENT, {
        supportState: "conflicting",
        displayVerdict: "conflict",
        hasConflict: true,
        primaryExcerpt: S1_EXCERPT,
      }),
      statementRow(2, "The team's execution is exceptional because the pipeline is deep.", {
        supportState: "confirmed",
        displayVerdict: "confirmed",
        hasConflict: false,
        editorialConcerns: [
          {
            concernCode: "overreach_unsupported_causal",
            note: "Causal overreach.",
            suggestedDirection: "Neutralise the causal verb.",
          },
          {
            concernCode: "narrative_coherence",
            note: "The sentence does not follow.",
            suggestedDirection: "Rewrite for coherence.",
          },
          {
            concernCode: "materiality",
            note: "Not material.",
            suggestedDirection: "Drop the claim.",
          },
        ],
      }),
      statementRow(3, "The fund sits in a crowded European mid-market.", {
        supportState: "confirmed",
        displayVerdict: "confirmed",
        hasConflict: false,
        framingFidelityConcerns: [{ concernCode: "framing_fidelity", note: "Framing drift." }],
        sourceRecencyConcerns: [{ concernCode: "source_recency", note: "The source is dated." }],
      }),
    ];
    const result = await runActionList(statements, { callModel: throwingModel() });
    assert.equal(result.ok, true);
    assert.ok(result.entries.length > 0);
    for (const entry of result.entries) {
      assert.ok(entry.provenance === "derived" || entry.provenance === "authored", entry.id);
      if (entry.provenance === "authored") {
        assert.equal(entry.proposedChange, undefined, entry.id);
        assert.equal(entry.resultingSentence, undefined, entry.id);
      }
    }
  });

  test("T2 correction fires on like-for-like 12% vs 9.0%", async () => {
    const pairs = findCandidatePairs(S1_STATEMENT, S1_EXCERPT);
    assert.deepEqual(
      pairs.map((pair) => ({ from: pair.from.raw, to: pair.to.raw })),
      [{ from: "12%", to: "9.0%" }]
    );
    const result = await fillAction(
      conflictEntry("T2:evidence:conflicting:0", { statement: S1_STATEMENT, primaryExcerpt: S1_EXCERPT }),
      { callModel: throwingModel() }
    );
    assert.equal(result.disposition, "ACTION");
    assert.equal(result.provenance, "derived");
    assert.equal(result.proposedChange, "Replace '12%' with '9.0%'.");
    assert.equal(result.resultingSentence, "Like-for-like sales growth reached 9.0% for the period");
    assert.match(result.resultingSentence, /9\.0%/);
  });

  test("T3 correction fires on the stake 56.7% to 57.6%", async () => {
    const pairs = findCandidatePairs(S4_STATEMENT, S4_EXCERPT);
    assert.deepEqual(
      pairs.map((pair) => ({ from: pair.from.raw, to: pair.to.raw })),
      [{ from: "56.7%", to: "57.6%" }]
    );
    const result = await fillAction(
      conflictEntry("T3:evidence:conflicting:0", { statement: S4_STATEMENT, primaryExcerpt: S4_EXCERPT }),
      { callModel: throwingModel() }
    );
    assert.equal(result.disposition, "ACTION");
    assert.equal(result.provenance, "derived");
    assert.equal(result.proposedChange, "Replace '56.7%' with '57.6%'.");
    assert.match(result.resultingSentence, /57\.6%/);
    assert.match(result.resultingSentence, /April 2024/);
    assert.equal(/July/.test(result.proposedChange || ""), false);
    assert.equal(/April/.test(result.proposedChange || ""), false);
  });

  test("T4 no source year, no proposal", async () => {
    const result = await fillAction(
      conflictEntry("T4:evidence:conflicting:0", { statement: T4_STATEMENT, primaryExcerpt: T4_EXCERPT }),
      { callModel: throwingModel() }
    );
    assert.equal(result.disposition, "ACKNOWLEDGE");
    assert.equal(result.proposedChange, undefined);
    assert.equal(result.resultingSentence, undefined);
  });

  test("T5 B336 holds on 119", async () => {
    const result = await fillAction(
      conflictEntry("T5:evidence:conflicting:0", { statement: A3_STATEMENT, primaryExcerpt: A3_EXCERPT }),
      { callModel: throwingModel() }
    );
    assert.equal(result.disposition, "ACKNOWLEDGE");
    assert.equal(result.explainCode, SLUG);
    assert.equal(result.proposedChange, undefined);
    assert.equal(result.resultingSentence, undefined);
  });

  test("T6 editorial rules produce concerns with no proposedChange", async () => {
    const rows = [
      editorialEntry(
        "overreach_unsupported_causal",
        "The team's execution is exceptional because the pipeline is deep.",
        "Causal overreach."
      ),
      editorialEntry(
        "narrative_coherence",
        "The next sentence does not follow from the last.",
        "Narrative coherence."
      ),
      editorialEntry("materiality", "The fund also restated a footnote.", "Not material."),
    ];
    for (const entry of rows) {
      const result = await fillAction(entry, { callModel: throwingModel() });
      assert.equal(result.disposition, "ACKNOWLEDGE", entry.rule);
      assert.equal(result.provenance, "authored", entry.rule);
      assert.equal(result.proposedChange, undefined, entry.rule);
      assert.equal(result.thing2, entry.thing2, entry.rule);
      assert.equal(result.noProposalReason, NO_PROPOSAL.visible_signal, entry.rule);
    }
  });

  test("T7 B4c: a valid pair with no source figure in the displayed excerpt proposes nothing", async () => {
    const pairing = S1_EXCERPT;
    const displayed = "In the six months to the end of Action's P6, like-for-like sales growth was discussed.";
    const pairs = findCandidatePairs(S1_STATEMENT, pairing);
    assert.equal(pairs.length, 1);
    assert.equal(pairs[0].to.raw, "9.0%");
    assert.equal(displayed.includes("9.0%"), false);
    const result = await fillAction(
      conflictEntry("T7:evidence:conflicting:0", {
        statement: S1_STATEMENT,
        primaryExcerpt: pairing,
      }, {
        card: { primaryExcerpt: displayed },
      }),
      { callModel: throwingModel() }
    );
    assert.equal(result.disposition, "ACKNOWLEDGE");
    assert.equal(result.proposedChange, undefined);
    assert.equal(result.resultingSentence, undefined);
  });
});
