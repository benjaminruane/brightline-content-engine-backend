import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { assembleCard } from "../lib/qc/pipeline-v3/stage7-assemble-card.mjs";
import {
  applyDeterministicStyleFilters,
  suppressNoOpSuggestions,
} from "../lib/qc/editorial-compliance-reviewer.mjs";

const TODAY = new Date("2026-08-18T00:00:00Z");

const STALE_SOURCE = `INVESTMENT MEMO
Date: 14 March 2023

Company overview. The company employs 640 people.
`;

const RECENT_SOURCE = `FACT SHEET
As at 30 June 2026

Employees: 720
`;

function makeEntry(statement, sourceMatches, contributingSourceIndices) {
  return {
    statementText: statement,
    startChar: 0,
    endChar: statement.length,
    sourceMatches,
    verdictResult: {
      verdict: "confirmed",
      hasConflict: sourceMatches.some((m) => m.classification === "conflicting"),
      confirmingMatches: sourceMatches
        .filter((m) => m.classification === "confirmed")
        .map((m) => ({ sourceIndex: m.sourceIndex, sourceLabel: m.sourceLabel })),
      contributingSourceIndices,
    },
    excerptResult: {
      primaryExcerpt: { passage: "720 people", sourceLabel: "fact sheet" },
    },
    editorialResult: {
      editorialVerdict: "clean",
      editorialConcerns: [],
      complianceVerdict: "clean",
      complianceConcerns: [],
    },
  };
}

describe("#2 recency anchors to supporting source", () => {
  const statement = "The company employs 720 people.";

  test("does NOT fire when the supporting source is current, even though an older source also matches", async () => {
    const entry = makeEntry(
      statement,
      [
        { sourceIndex: 0, sourceLabel: "IC memo", classification: "conflicting" },
        { sourceIndex: 1, sourceLabel: "fact sheet", classification: "confirmed" },
      ],
      [0, 1]
    );
    const card = await assembleCard(entry, 0, {
      pipelineRoute: "v4",
      sources: [
        { text: STALE_SOURCE, label: "IC memo" },
        { text: RECENT_SOURCE, label: "fact sheet" },
      ],
      today: TODAY,
    });
    assert.equal(card.supportState, "supported");
    assert.deepEqual(card.sourceRecencyConcerns, []);
  });

  test("STILL fires when the only supporting source is old", async () => {
    const staleStatement = "The company employs 640 people.";
    const entry = makeEntry(
      staleStatement,
      [{ sourceIndex: 0, sourceLabel: "IC memo", classification: "confirmed" }],
      [0]
    );
    const card = await assembleCard(entry, 0, {
      pipelineRoute: "v4",
      sources: [
        { text: STALE_SOURCE, label: "IC memo" },
        { text: RECENT_SOURCE, label: "fact sheet" },
      ],
      today: TODAY,
    });
    assert.equal(card.sourceRecencyConcerns.length, 1);
    assert.match(card.sourceRecencyConcerns[0].note, /14 March 2023/);
  });
});

describe("#4a first_person_plural deterministic filter", () => {
  function makeConcern(citedSpan, statementText) {
    return {
      concernCode: "first_person_plural",
      rule: "first_person_plural",
      category: "style_guide",
      note: "First-person plural detected.",
      suggestedDirection: "Replace with third-person.",
      span: [{ startChar: 0, endChar: citedSpan.length }],
    };
  }

  test("drops the concern when the statement has no first-person pronoun", () => {
    const stmt = "The company anticipates two further bolt-on acquisitions and does not expect a realisation before 2028.";
    const concern = makeConcern(stmt, stmt);
    const result = applyDeterministicStyleFilters([concern], stmt);
    assert.equal(result.length, 0);
  });

  test("keeps the concern when the statement contains a real first-person pronoun", () => {
    const stmt = "We expect to complete two further bolt-on acquisitions.";
    const concern = makeConcern(stmt, stmt);
    const result = applyDeterministicStyleFilters([concern], stmt);
    assert.equal(result.length, 1);
  });

  test("keeps the concern for 'our' usage", () => {
    const stmt = "Following our recent acquisition of Baltic ColdCo, combined revenue has climbed.";
    const concern = makeConcern(stmt, stmt);
    const result = applyDeterministicStyleFilters([concern], stmt);
    assert.equal(result.length, 1);
  });
});

describe("#4b no-op suggestedRewrite suppression", () => {
  test("drops a concern whose suggestedRewrite equals the source text", () => {
    const stmt = "The company does not expect a realisation before 2028.";
    const concerns = [
      {
        concernCode: "first_person_plural",
        note: "First-person plural.",
        suggestedRewrite: stmt,
      },
    ];
    const result = suppressNoOpSuggestions(concerns, stmt);
    assert.equal(result.length, 0);
  });

  test("drops when suggestedRewrite differs only in whitespace", () => {
    const stmt = "The company  does not expect.";
    const concerns = [
      {
        concernCode: "some_rule",
        note: "Some note.",
        suggestedRewrite: "The company does not expect.",
      },
    ];
    const result = suppressNoOpSuggestions(concerns, stmt);
    assert.equal(result.length, 0);
  });

  test("keeps a concern with a genuine rewrite", () => {
    const stmt = "We expect to complete two further bolt-on acquisitions.";
    const concerns = [
      {
        concernCode: "first_person_plural",
        note: "First-person plural.",
        suggestedRewrite: "The Fund expects to complete two further bolt-on acquisitions.",
      },
    ];
    const result = suppressNoOpSuggestions(concerns, stmt);
    assert.equal(result.length, 1);
  });

  test("keeps a concern with no suggestedRewrite at all", () => {
    const stmt = "We expect growth.";
    const concerns = [
      {
        concernCode: "first_person_plural",
        note: "First-person plural.",
      },
    ];
    const result = suppressNoOpSuggestions(concerns, stmt);
    assert.equal(result.length, 1);
  });
});
