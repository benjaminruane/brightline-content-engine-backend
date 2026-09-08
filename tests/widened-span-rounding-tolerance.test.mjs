import assert from "node:assert/strict";
import { describe, test } from "vitest";

import { applyIntraSourceReducer } from "../lib/qc/pipeline-v4/intra-source-reducer.mjs";
import { applyRoundingToleranceBackstop, classifyNumericRelationship } from "../lib/qc/pipeline-v4/stage2-match-sources.mjs";
import { aggregateVerdict } from "../lib/qc/pipeline-v4/stage3-aggregate-verdict.mjs";

const CAGR_SOURCE =
  "Revenue has grown from GBP 187 million at the time of our investment to GBP 312 million for the financial year ended 31 December 2025, representing a compound annual growth rate of 18.6 percent.";
const CAGR_STATEMENT =
  "Revenue grew to GBP 312 million for the year, up from GBP 187 million at the time of our investment in March 2022, a compound annual growth rate of approximately 19 percent.";

const HEADCOUNT_SOURCE =
  "The Company employs 320 people in London. The total team of 285 people is split across offices.";
const HEADCOUNT_STATEMENT = "The Company employs 320 people across offices in London, Hamburg, Lisbon, and Bangalore.";

describe("widened span rounding tolerance", () => {
  test("existing backstop still lifts 18.6 versus approximately 19 on a single-pick passage", () => {
    assert.equal(classifyNumericRelationship(CAGR_STATEMENT, CAGR_SOURCE), "within_rounding");
    const out = applyRoundingToleranceBackstop(
      { classification: "conflicting", passage: CAGR_SOURCE, explanation: "CAGR differs." },
      { statementText: CAGR_STATEMENT }
    );
    assert.equal(out.classification, "confirmed");
  });

  test("a conflicting span inside tolerance does not vote as conflicting", () => {
    const sourceMatches = [{ sourceIndex: 0, classification: "confirmed", passage: CAGR_SOURCE }];
    const supportSpans = [
      {
        sourceRefId: 0,
        classification: "conflicting",
        passage: CAGR_SOURCE,
        start: 0,
        end: CAGR_SOURCE.length,
      },
    ];
    const reduced = applyIntraSourceReducer({
      sourceMatches,
      supportSpans,
      sources: [{ text: CAGR_SOURCE }],
      statementText: CAGR_STATEMENT,
    });
    const agg = aggregateVerdict({ statementMatches: reduced });
    assert.equal(reduced[0].classification, "confirmed");
    assert.equal(agg.verdict, "confirmed");
    assert.equal(agg.hasConflict, false);
  });

  test("17% versus 17.1% on a span does not vote as conflicting", () => {
    const statement = "Revenue has grown from EUR 312 million in 2020 to EUR 587 million in 2024, a compound annual rate of 17%.";
    const passage =
      "HPC has grown revenue from EUR 312 million in 2020 to EUR 587 million in 2024, a compound annual growth rate of 17.1%.";
    assert.equal(classifyNumericRelationship(statement, passage), "within_rounding");
    const reduced = applyIntraSourceReducer({
      sourceMatches: [{ sourceIndex: 0, classification: "confirmed", passage }],
      supportSpans: [
        { sourceRefId: 0, classification: "conflicting", passage, start: 0, end: passage.length },
      ],
      sources: [{ text: passage }],
      statementText: statement,
    });
    assert.equal(aggregateVerdict({ statementMatches: reduced }).verdict, "confirmed");
  });

  test("320 versus 285 still votes as conflicting", () => {
    const passage = "The total team of 285 people is split across offices.";
    const reduced = applyIntraSourceReducer({
      sourceMatches: [
        { sourceIndex: 0, classification: "confirmed", passage: "The Company employs 320 people in London." },
      ],
      supportSpans: [
        { sourceRefId: 0, classification: "conflicting", passage, start: 43, end: HEADCOUNT_SOURCE.length },
      ],
      sources: [{ text: HEADCOUNT_SOURCE }],
      statementText: HEADCOUNT_STATEMENT,
    });
    const agg = aggregateVerdict({ statementMatches: reduced });
    assert.equal(reduced[0].classification, "conflicting");
    assert.equal(agg.verdict, "conflicting");
  });

  test("a confirmed span is not forced to conflicting by the magnitude arm", () => {
    const statement =
      "Total Company revenue grew from SEK 4.2 billion at entry to SEK 11.4 billion at exit, with EBITDA expanding from SEK 480 million to SEK 2.08 billion and margins from 11.4 percent to 18.2 percent.";
    const passage =
      "At the time of our investment, the Company generated revenue of SEK 4.2 billion and EBITDA of SEK 480 million, representing an EBITDA margin of 11.4%.";
    const forced = applyRoundingToleranceBackstop(
      { classification: "confirmed", passage, explanation: "" },
      { statementText: statement }
    );
    assert.equal(forced.classification, "conflicting", "the full backstop still forces on a confirmed pick");
    const reduced = applyIntraSourceReducer({
      sourceMatches: [{ sourceIndex: 0, classification: "confirmed", passage }],
      supportSpans: [
        { sourceRefId: 0, classification: "confirmed", passage, start: 0, end: passage.length },
      ],
      sources: [{ text: passage }],
      statementText: statement,
    });
    assert.equal(reduced[0].classification, "confirmed");
    assert.equal(aggregateVerdict({ statementMatches: reduced }).verdict, "confirmed");
  });
});
