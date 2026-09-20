/**
 * B250: a match that threw or came back malformed is not_reviewed, not no_support.
 */
import assert from "node:assert/strict";
import { afterEach, describe, test, vi } from "vitest";
import * as observability from "../lib/observability.js";
import { matchAllSources } from "../lib/qc/pipeline-v4/stage2-match-sources.mjs";
import { aggregateVerdict } from "../lib/qc/pipeline-v4/stage3-aggregate-verdict.mjs";
import { assembleCard } from "../lib/qc/pipeline-v3/stage7-assemble-card.mjs";

const STATEMENT = "Northaven Logistics sold its Scandinavian depot network for EUR 90 million.";
const SOURCE = {
  text: "Oakfield Partners closed Fund III at EUR 400 million in March 2025.",
  label: "oakfield-close.txt",
};

const REVIEWS_ON = {
  evidenceEnabled: true,
  editorialEnabled: true,
  complianceEnabled: true,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("B250 failed match is not no_support", () => {
  test("malformed Stage 2 JSON is not_reviewed", async () => {
    vi.spyOn(observability, "hasProviderApiKey").mockReturnValue(true);
    vi.spyOn(observability, "callLLM").mockResolvedValue({ text: "not-json" });
    const { matches } = await matchAllSources({
      statements: [{ text: STATEMENT, charStart: 0, charEnd: STATEMENT.length, index: 0 }],
      sources: [SOURCE],
      traceId: "b250-malformed",
    });
    assert.equal(matches.length, 1);
    assert.equal(matches[0].classification, "not_reviewed");
    assert.notEqual(matches[0].classification, "no_support");
  });

  test("a thrown match call is not_reviewed", async () => {
    vi.spyOn(observability, "hasProviderApiKey").mockReturnValue(true);
    vi.spyOn(observability, "callLLM").mockRejectedValue(new Error("boom"));
    const { matches } = await matchAllSources({
      statements: [{ text: STATEMENT, charStart: 0, charEnd: STATEMENT.length, index: 0 }],
      sources: [SOURCE],
      traceId: "b250-throw",
    });
    assert.equal(matches[0].classification, "not_reviewed");
  });

  test("Stage 3: only failed pairs become not_reviewed, not not_supported", () => {
    const agg = aggregateVerdict({
      statementMatches: [{ sourceIndex: 0, classification: "not_reviewed" }],
    });
    assert.equal(agg.verdict, "not_reviewed");
  });

  test("Stage 3: a consulted confirmed pair still wins over a failed pair", () => {
    const agg = aggregateVerdict({
      statementMatches: [
        { sourceIndex: 0, classification: "confirmed" },
        { sourceIndex: 1, classification: "not_reviewed" },
      ],
    });
    assert.equal(agg.verdict, "confirmed");
  });

  test("assembled card for an all-failed match is Not reviewed, not No support", async () => {
    const card = await assembleCard(
      {
        statementText: STATEMENT,
        startChar: 0,
        endChar: STATEMENT.length,
        sourceMatches: [
          {
            sourceIndex: 0,
            sourceLabel: SOURCE.label,
            classification: "not_reviewed",
            passage: "",
            matchNotReviewed: true,
          },
        ],
        verdictResult: {
          verdict: "not_reviewed",
          hasConflict: false,
          contributingSourceIndices: [],
        },
        excerptResult: { primaryExcerpt: null },
        supportSpans: [],
        editorialResult: {
          editorialVerdict: "clean",
          editorialConcerns: [],
          complianceVerdict: "clean",
          complianceConcerns: [],
        },
      },
      0,
      {
        pipelineRoute: "v4",
        reviewOptions: REVIEWS_ON,
        skipEditorialDuplicationJudge: true,
      }
    );
    assert.equal(card.supportState, "skipped");
    assert.equal(String(card.displayVerdict).toLowerCase(), "not reviewed");
    assert.notEqual(card.displayVerdict, "not_supported");
  });
});
