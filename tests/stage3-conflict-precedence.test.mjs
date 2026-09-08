import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { collectBackstopFigures } from "../lib/qc/pipeline-v4/stage2-match-sources.mjs";
import { aggregateVerdict } from "../lib/qc/pipeline-v4/stage3-aggregate-verdict.mjs";
import { rollupClaimVerdicts } from "../lib/qc/claim-spans.mjs";
import { resolveSupersession } from "../lib/qc/supersession.mjs";

const TODAY = new Date("2026-08-18T00:00:00Z");

const AS_OF = {
  0: { date: new Date("2020-03-12T00:00:00Z"), raw: "12 March 2020", cue: "Date: label" },
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

function applySupersessionAfterAggregate({ statement, sourceMatches, asOfBySourceIndex, today }) {
  const matches = (Array.isArray(sourceMatches) ? sourceMatches : []).map((m) => ({ ...m }));
  let agg = aggregateVerdict({ statementMatches: matches });
  const resolved = resolveSupersession({
    statement,
    aggregateVerdict: agg.verdict,
    sourceMatches: matches,
    asOfBySourceIndex,
    today,
  });
  if (resolved.verdictOverride) {
    const demoted = new Set((resolved.demotedSourceIndices || []).map(Number));
    for (const m of matches) {
      if (!demoted.has(Number(m.sourceIndex))) continue;
      m.originalClassification = m.classification;
      m.classification = "superseded";
    }
    agg = aggregateVerdict({ statementMatches: matches });
    agg = { ...agg, verdict: resolved.verdictOverride };
  }
  return { agg, matches, resolved };
}

describe("stage3 conflict precedence", () => {
  test("confirm-plus-conflict now aggregates to conflict", () => {
    const out = aggregateVerdict({
      statementMatches: [
        { sourceIndex: 0, classification: "confirmed" },
        { sourceIndex: 1, classification: "conflicting" },
      ],
    });
    assert.equal(out.verdict, "conflicting");
    assert.equal(out.hasConflict, true);
    assert.ok(out.contributingSourceIndices.includes(1));
  });

  test("draft matches newest source, older source disagrees, still confirmed with the note", () => {
    const statement = "Revenue for the twelve months to 31 December 2025 was EUR 200 million.";
    const older = "Revenue for FY2019 was EUR 100 million.";
    const newer = "Revenue for FY2025 was EUR 200 million.";
    const sourceMatches = [
      pair(statement, older, {
        sourceIndex: 0,
        sourceLabel: "MERIDIAN CAPITAL FUND III ANNUAL REPORT",
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
    const before = aggregateVerdict({ statementMatches: sourceMatches });
    assert.equal(before.verdict, "conflicting");
    assert.equal(before.hasConflict, true);

    const { agg, resolved } = applySupersessionAfterAggregate({
      statement,
      sourceMatches,
      asOfBySourceIndex: AS_OF,
      today: TODAY,
    });
    assert.equal(agg.verdict, "confirmed");
    assert.deepEqual(resolved.demotedSourceIndices, [0]);
    assert.equal(resolved.verdictOverride, "confirmed");
    assert.equal(resolved.supersededNotes.length, 1);
    assert.match(resolved.supersededNotes[0], /EUR 100 million/);
    assert.match(resolved.supersededNotes[0], /FY2019/);
    assert.match(resolved.supersededNotes[0], /EUR 200 million/);
    assert.doesNotMatch(resolved.supersededNotes[0], /[\u2014\u2013]/);
  });

  test("confirm-plus-partial unchanged", () => {
    const out = aggregateVerdict({
      statementMatches: [
        { sourceIndex: 0, classification: "confirmed" },
        { sourceIndex: 1, classification: "partially_confirmed" },
      ],
    });
    assert.equal(out.verdict, "confirmed");
    assert.equal(out.hasConflict, false);
  });

  test("a whole-sentence conflict is not upgraded by claim-span rollup", () => {
    const out = rollupClaimVerdicts({
      vToday: "conflicting",
      claimVerdicts: ["confirmed", "confirmed"],
      residualBlocked: false,
      wholeSentenceHasConflict: true,
    });
    assert.equal(out.verdict, "conflicting");
    assert.equal(out.claimUpgrade, false);
    const partialBase = rollupClaimVerdicts({
      vToday: "partially_confirmed",
      claimVerdicts: ["confirmed", "confirmed"],
      residualBlocked: false,
      wholeSentenceHasConflict: true,
    });
    assert.equal(partialBase.verdict, "partially_confirmed");
    assert.equal(partialBase.claimUpgrade, false);
    assert.ok(partialBase.blockedBy.includes("d"));
  });
});
