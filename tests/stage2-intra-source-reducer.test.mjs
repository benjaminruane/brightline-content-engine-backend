import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";

import { collectBackstopFigures } from "../lib/qc/pipeline-v4/stage2-match-sources.mjs";
import { aggregateVerdict } from "../lib/qc/pipeline-v4/stage3-aggregate-verdict.mjs";
import { applyIntraSourceReducer, spanVotes } from "../lib/qc/pipeline-v4/intra-source-reducer.mjs";
import { resolveSupersession } from "../lib/qc/supersession.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PIPELINE_INDEX = path.join(ROOT, "lib/qc/pipeline-v4/index.mjs");

const SOURCE_TEXT = "The Company employs 320 people in London. The total team of 285 people is split across offices.";

function applyThenAggregate({ sourceMatches, supportSpans, sources, statement, asOfBySourceIndex, today }) {
  const originals = (Array.isArray(sourceMatches) ? sourceMatches : []).map((m) => ({ ...m }));
  const reduced = applyIntraSourceReducer({
    sourceMatches: originals,
    supportSpans,
    sources,
  });
  let agg = aggregateVerdict({ statementMatches: reduced });
  const resolved = resolveSupersession({
    statement,
    aggregateVerdict: agg.verdict,
    sourceMatches: reduced,
    asOfBySourceIndex,
    today,
  });
  if (resolved.verdictOverride) {
    const demoted = new Set((resolved.demotedSourceIndices || []).map(Number));
    for (const m of reduced) {
      if (!demoted.has(Number(m.sourceIndex))) continue;
      m.originalClassification = m.classification;
      m.classification = "superseded";
    }
    agg = aggregateVerdict({ statementMatches: reduced });
    agg = { ...agg, verdict: resolved.verdictOverride };
  }
  return { originals, reduced, agg, resolved };
}

describe("intra-source most-serious-wins reducer", () => {
  test("one source, single-pick confirmed plus a conflicting span, becomes conflicting", () => {
    const sourceMatches = [{ sourceIndex: 0, classification: "confirmed", passage: "The Company employs 320 people in London." }];
    const supportSpans = [
      {
        sourceRefId: 0,
        classification: "conflicting",
        passage: "The total team of 285 people is split across offices.",
        start: 43,
        end: SOURCE_TEXT.length,
      },
    ];
    const reduced = applyIntraSourceReducer({
      sourceMatches,
      supportSpans,
      sources: [{ text: SOURCE_TEXT }],
    });
    const agg = aggregateVerdict({ statementMatches: reduced });
    assert.equal(reduced[0].classification, "conflicting");
    assert.equal(agg.verdict, "conflicting");
    assert.equal(agg.hasConflict, true);
  });

  test("one source, single-pick confirmed plus a confirmed span, stays confirmed", () => {
    const sourceMatches = [{ sourceIndex: 0, classification: "confirmed", passage: "The Company employs 320 people in London." }];
    const supportSpans = [
      {
        sourceRefId: 0,
        classification: "confirmed",
        passage: "The Company employs 320 people in London.",
        start: 0,
        end: 42,
      },
    ];
    const reduced = applyIntraSourceReducer({
      sourceMatches,
      supportSpans,
      sources: [{ text: SOURCE_TEXT }],
    });
    const agg = aggregateVerdict({ statementMatches: reduced });
    assert.equal(reduced[0].classification, "confirmed");
    assert.equal(agg.verdict, "confirmed");
    assert.equal(agg.hasConflict, false);
  });

  test("a span with an empty or unlocatable passage does not vote", () => {
    const sourceMatches = [{ sourceIndex: 0, classification: "confirmed", passage: "The Company employs 320 people in London." }];
    const supportSpans = [
      {
        sourceRefId: 0,
        classification: "conflicting",
        passage: "",
        start: null,
        end: null,
      },
      {
        sourceRefId: 0,
        classification: "conflicting",
        passage: "   ",
        start: null,
        end: null,
      },
      {
        sourceRefId: 0,
        classification: "conflicting",
        passage: "This sentence is not in the source at all.",
        start: null,
        end: null,
      },
    ];
    assert.equal(spanVotes({ passage: "", classification: "conflicting" }, SOURCE_TEXT), false);
    assert.equal(
      spanVotes({ passage: "This sentence is not in the source at all.", classification: "conflicting" }, SOURCE_TEXT),
      false
    );
    const reduced = applyIntraSourceReducer({
      sourceMatches,
      supportSpans,
      sources: [{ text: SOURCE_TEXT }],
    });
    const agg = aggregateVerdict({ statementMatches: reduced });
    assert.equal(reduced[0].classification, "confirmed");
    assert.equal(agg.verdict, "confirmed");
  });

  test("the reducer runs before Stage 3 and does not bypass supersession", () => {
    const pipelineSrc = readFileSync(PIPELINE_INDEX, "utf8");
    const reduceAt = pipelineSrc.indexOf("applyIntraSourceReducer");
    const aggNeedle = "aggregateVerdictV4({ statementMatches: reducedMatches })";
    const aggAt = pipelineSrc.indexOf(aggNeedle);
    assert.ok(reduceAt > 0, "pipeline must call applyIntraSourceReducer");
    assert.ok(aggAt > reduceAt, "pipeline must aggregate the reduced pair classifications, not the raw single-pick rows");
    assert.match(pipelineSrc, /resolveSupersession\(/);
    const superAt = pipelineSrc.indexOf("resolveSupersession({", aggAt);
    assert.ok(superAt > aggAt, "resolveSupersession still runs after the aggregate");

    const statement = "Revenue for the twelve months to 31 December 2025 was EUR 200 million.";
    const older = "Revenue for FY2019 was EUR 100 million.";
    const newer = "Revenue for FY2025 was EUR 200 million.";
    const sources = [{ text: older }, { text: newer }];
    const sourceMatches = [
      {
        sourceIndex: 0,
        sourceLabel: "MERIDIAN CAPITAL FUND III ANNUAL REPORT",
        classification: "confirmed",
        passage: older,
        statementFigures: collectBackstopFigures(statement),
        sourceFigures: collectBackstopFigures(older),
        periodAssessment: { statementPeriod: "FY2025", sourcePeriod: "FY2019" },
      },
      {
        sourceIndex: 1,
        sourceLabel: "fund update 2026",
        classification: "confirmed",
        passage: newer,
        statementFigures: collectBackstopFigures(statement),
        sourceFigures: collectBackstopFigures(newer),
        periodAssessment: { statementPeriod: "FY2025", sourcePeriod: "FY2025" },
      },
    ];
    const supportSpans = [
      {
        sourceRefId: 0,
        classification: "conflicting",
        passage: older,
        start: 0,
        end: older.length,
      },
    ];
    const asOfBySourceIndex = {
      0: { date: new Date("2020-03-12T00:00:00Z"), raw: "12 March 2020", cue: "Date: label" },
      1: { date: new Date("2026-06-30T00:00:00Z"), raw: "30 June 2026", cue: "As at [date] (header)" },
    };
    const reducedOnly = applyIntraSourceReducer({ sourceMatches, supportSpans, sources });
    const beforeSuper = aggregateVerdict({ statementMatches: reducedOnly });
    assert.equal(reducedOnly[0].classification, "conflicting");
    assert.equal(beforeSuper.verdict, "conflicting");

    const after = applyThenAggregate({
      sourceMatches,
      supportSpans,
      sources,
      statement,
      asOfBySourceIndex,
      today: new Date("2026-08-18T00:00:00Z"),
    });
    assert.equal(after.agg.verdict, "confirmed");
    assert.deepEqual(after.resolved.demotedSourceIndices, [0]);
    assert.equal(after.resolved.verdictOverride, "confirmed");
    assert.equal(after.reduced[0].classification, "superseded");
  });

  test("widened spans are still absent from sourceMatches", () => {
    const sourceMatches = [{ sourceIndex: 0, classification: "confirmed", passage: "The Company employs 320 people in London." }];
    const supportSpans = [
      {
        sourceRefId: 0,
        classification: "conflicting",
        passage: "The total team of 285 people is split across offices.",
        start: 43,
        end: SOURCE_TEXT.length,
      },
    ];
    const snapshot = JSON.stringify(sourceMatches);
    const reduced = applyIntraSourceReducer({
      sourceMatches,
      supportSpans,
      sources: [{ text: SOURCE_TEXT }],
    });
    assert.equal(JSON.stringify(sourceMatches), snapshot, "reducer must not mutate the single-pick sourceMatches array");
    assert.equal(sourceMatches.length, 1);
    assert.equal(sourceMatches[0].classification, "confirmed");
    assert.equal(reduced.length, 1);
    const pipelineSrc = readFileSync(PIPELINE_INDEX, "utf8");
    assert.match(pipelineSrc, /Single-pick matches ONLY/);
    assert.equal(pipelineSrc.includes("sourceMatches.push("), false);
    assert.equal(pipelineSrc.includes("sourceMatches.concat"), false);
  });
});
