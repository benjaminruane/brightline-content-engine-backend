import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { assembleCard } from "../lib/qc/pipeline-v3/stage7-assemble-card.mjs";
import { collectBackstopFigures } from "../lib/qc/pipeline-v4/stage2-match-sources.mjs";
import {
  extractClaimPeriod,
  extractSourcePeriodForFigure,
  resolveSupersession,
} from "../lib/qc/supersession.mjs";

const TODAY = new Date("2026-08-18T00:00:00Z");

const AS_OF = {
  0: { date: new Date("2020-03-12T00:00:00Z"), raw: "12 March 2020", cue: "Date: label" },
  1: { date: new Date("2025-03-15T00:00:00Z"), raw: "15 March 2025", cue: "Date: label" },
  2: { date: new Date("2026-06-30T00:00:00Z"), raw: "30 June 2026", cue: "As at [date] (header)" },
};

function pair(statement, passage, extra = {}) {
  return {
    statementFigures: collectBackstopFigures(statement),
    sourceFigures: collectBackstopFigures(passage),
    passage,
    ...extra,
  };
}

describe("extractClaimPeriod", () => {
  test("maps FY, year-end phrasing, H1, Q2, and as-at dates", () => {
    assert.equal(extractClaimPeriod("Adjusted EBITDA for FY2024 was EUR 45 million."), "2024");
    assert.equal(
      extractClaimPeriod("Revenue for the twelve months to 31 December 2025 was EUR 200 million."),
      "2025"
    );
    assert.equal(extractClaimPeriod("Financial highlights for the year ended 31 December 2019."), "2019");
    assert.equal(extractClaimPeriod("Volume in H1 2025 rose."), "H1 2025");
    assert.equal(extractClaimPeriod("Bookings in Q2 2026 were flat."), "Q2 2026");
    assert.equal(extractClaimPeriod("Headcount as at 30 June 2026 was 720."), "2026");
    assert.equal(extractClaimPeriod("The company employs 720 people."), null);
  });
});

describe("extractSourcePeriodForFigure", () => {
  test("reads FY2019 from the window around the matched figure", () => {
    const passage = "Revenue for FY2019 was EUR 100 million, up from EUR 82 million the prior year.";
    const matched = collectBackstopFigures(passage).find((f) => f.value === 1e8);
    assert.equal(extractSourcePeriodForFigure(passage, matched), "2019");
  });
});

describe("resolveSupersession", () => {
  test("demotes a different-period older conflict when the draft matches the newest covering source", () => {
    const statement = "Revenue for the twelve months to 31 December 2025 was EUR 200 million.";
    const older = "Revenue for FY2019 was EUR 100 million.";
    const newer = "Revenue for FY2025 was EUR 200 million.";
    const sourceMatches = [
      pair(statement, older, {
        sourceIndex: 0,
        sourceLabel: "MERIDIAN CAPITAL — FUND III ANNUAL REPORT",
        classification: "conflicting",
        periodAssessment: { statementPeriod: "FY2025", sourcePeriod: "FY2019" },
      }),
      pair(statement, newer, {
        sourceIndex: 2,
        sourceLabel: "fund update 2026",
        classification: "confirmed",
        periodAssessment: { statementPeriod: "FY2025", sourcePeriod: "FY2025" },
      }),
    ];
    const out = resolveSupersession({
      statement,
      aggregateVerdict: "confirmed",
      sourceMatches,
      asOfBySourceIndex: AS_OF,
      today: TODAY,
    });
    assert.deepEqual(out.demotedSourceIndices, [0]);
    assert.equal(out.verdictOverride, "confirmed");
    assert.equal(out.supersededNotes.length, 1);
    assert.match(out.supersededNotes[0], /EUR 100 million/);
    assert.match(out.supersededNotes[0], /FY2019/);
    assert.match(out.supersededNotes[0], /EUR 200 million/);
    assert.match(out.supersededNotes[0], /FY2025/);
    assert.doesNotMatch(out.supersededNotes[0], /[\u2014\u2013]/);
  });

  test("as-of fallback demotes an older headcount conflict when the claim has no explicit period", () => {
    const statement = "The company employs 720 people.";
    const older = "The underlying businesses employed 640 people in aggregate.";
    const newer = "The underlying businesses employ 720 people in aggregate.";
    const sourceMatches = [
      pair(statement, older, {
        sourceIndex: 0,
        sourceLabel: "annual report",
        classification: "conflicting",
        periodAssessment: null,
      }),
      pair(statement, newer, {
        sourceIndex: 2,
        sourceLabel: "fund update",
        classification: "confirmed",
        periodAssessment: null,
      }),
    ];
    const out = resolveSupersession({
      statement,
      aggregateVerdict: "confirmed",
      sourceMatches,
      asOfBySourceIndex: AS_OF,
      today: TODAY,
    });
    assert.deepEqual(out.demotedSourceIndices, [0]);
    assert.equal(out.verdictOverride, "confirmed");
    assert.match(out.supersededNotes[0], /640/);
    assert.match(out.supersededNotes[0], /12 March 2020/);
  });

  test("same-period restatement stays a conflict (newest restated figure, draft on the stale number)", () => {
    const statement = "Adjusted EBITDA for FY2024 was EUR 45 million.";
    const olderSame = "Adjusted EBITDA for FY2024 was EUR 45 million.";
    const restated = "Adjusted EBITDA for FY2024 has been restated to EUR 40 million.";
    const sourceMatches = [
      pair(statement, olderSame, {
        sourceIndex: 1,
        sourceLabel: "FY2024 results",
        classification: "confirmed",
        periodAssessment: { statementPeriod: "FY2024", sourcePeriod: "FY2024" },
      }),
      pair(statement, restated, {
        sourceIndex: 2,
        sourceLabel: "fund update",
        classification: "conflicting",
        periodAssessment: { statementPeriod: "FY2024", sourcePeriod: "FY2024" },
      }),
    ];
    const out = resolveSupersession({
      statement,
      aggregateVerdict: "confirmed",
      sourceMatches,
      asOfBySourceIndex: AS_OF,
      today: TODAY,
    });
    assert.equal(out.verdictOverride, null);
    assert.deepEqual(out.demotedSourceIndices, []);
  });

  test("draft-behind current-state figure is not supersession", () => {
    const statement = "The company employs 640 people.";
    const older = "The underlying businesses employed 640 people in aggregate.";
    const newer = "The underlying businesses employ 720 people in aggregate.";
    const sourceMatches = [
      pair(statement, older, {
        sourceIndex: 0,
        sourceLabel: "annual report",
        classification: "confirmed",
        periodAssessment: null,
      }),
      pair(statement, newer, {
        sourceIndex: 2,
        sourceLabel: "fund update",
        classification: "conflicting",
        periodAssessment: null,
      }),
    ];
    const out = resolveSupersession({
      statement,
      aggregateVerdict: "confirmed",
      sourceMatches,
      asOfBySourceIndex: AS_OF,
      today: TODAY,
    });
    assert.equal(out.verdictOverride, null);
    assert.deepEqual(out.demotedSourceIndices, []);
  });

  test("undated side is a no-op even when figures would otherwise supersede", () => {
    const statement = "The company employs 720 people.";
    const older = "The underlying businesses employed 640 people in aggregate.";
    const newer = "The underlying businesses employ 720 people in aggregate.";
    const sourceMatches = [
      pair(statement, older, {
        sourceIndex: 0,
        sourceLabel: "annual report",
        classification: "conflicting",
        periodAssessment: null,
      }),
      pair(statement, newer, {
        sourceIndex: 2,
        sourceLabel: "fund update",
        classification: "confirmed",
        periodAssessment: null,
      }),
    ];
    const out = resolveSupersession({
      statement,
      aggregateVerdict: "confirmed",
      sourceMatches,
      asOfBySourceIndex: { 0: null, 2: AS_OF[2] },
      today: TODAY,
    });
    assert.equal(out.verdictOverride, null);
    assert.deepEqual(out.demotedSourceIndices, []);
  });
});

describe("assembleCard supersededSourceNotes", () => {
  test("emits the notes array without changing the evidence verdict", async () => {
    const statement = "Revenue for the twelve months to 31 December 2025 was EUR 200 million.";
    const notes = [
      "An older source (annual report, 12 March 2020) reports EUR 100 million for FY2019. The current figure of EUR 200 million (FY2025) is more recent.",
    ];
    const card = await assembleCard(
      {
        statementText: statement,
        startChar: 0,
        endChar: statement.length,
        sourceMatches: [{ sourceIndex: 2, classification: "confirmed", sourceLabel: "update" }],
        verdictResult: {
          verdict: "confirmed",
          hasConflict: false,
          confirmingMatches: [{ sourceIndex: 2, sourceLabel: "update" }],
          contributingSourceIndices: [2],
        },
        excerptResult: { primaryExcerpt: { passage: "Revenue for FY2025 was EUR 200 million.", sourceLabel: "update" } },
        supersededSourceNotes: notes,
        editorialResult: {
          editorialVerdict: "clean",
          editorialConcerns: [],
          complianceVerdict: "clean",
          complianceConcerns: [],
        },
      },
      0,
      { pipelineRoute: "v4", today: TODAY }
    );
    assert.equal(card.supportState, "supported");
    assert.equal(card.hasConflict, false);
    assert.deepEqual(card.supersededSourceNotes, notes);
  });
});
