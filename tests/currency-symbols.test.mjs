/**
 * B347. Currency symbols resolve to codes. Bare $ stays unresolved.
 * Through annotateTokens and the real post-Stage-2 path. No model calls.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";

import {
  confirmingPassageVerdict,
  demoteConfirmedClassifications,
} from "../lib/qc/pipeline-v4/confirming-passage-disagrees.mjs";
import { applyIntraSourceReducer } from "../lib/qc/pipeline-v4/intra-source-reducer.mjs";
import { aggregateVerdict } from "../lib/qc/pipeline-v4/stage3-aggregate-verdict.mjs";
import { selectExcerpts } from "../lib/qc/pipeline-v4/stage4-select-excerpts.mjs";
import { annotateTokens, applyConflictProposal } from "../lib/revise-actions/conflict-engagement.mjs";

const SOURCE_LABEL = "Action H1 2024";

const HONEST_REFINANCE =
  "Meanwhile, the company completed a EUR 2.1 billion refinancing, reflecting its robust growth and strong cash generation.";
const CURRENCY_ERROR =
  "Meanwhile, the company completed a USD 2.1 billion refinancing, reflecting its robust growth and strong cash generation.";
const REAL_REFINANCE_PASSAGE =
  "In July 2024, Action successfully completed a refinancing event, raising €2.1 billion in total, including a second US dollar term loan issuance of $1.5 billion.";
const QUAL_PASSAGE =
  "The successful completion of another sizable refinancing reflects Action's impressive growth and strong cash generation.";

const DOCTORED = [
  "For the six months ending 30 June 2024, Action generated record net sales and operating EBITDA.",
  "Like-for-like sales growth reached 12% for the period, driven by overall high transaction volume and robust performance in luxury goods, which offset a decline in average selling prices.",
  "Performance for the period was achieved despite a continued focus on price increases and the impact of softer seasonal sales due to adverse weather in north western Europe.",
  "Meanwhile, the company completed a USD 1.5 billion refinancing, reflecting its robust growth and strong cash generation.",
  "Following the refinancing, 3i recycled a portion of its proceeds to acquire an additional holding in the company in April 2024, increasing its stake to 56.7%.",
  "On the commercial front, Action added 119 new stores in Denmark over the period and remains on track to meet its target of 330 new stores for by end-2025.",
];

const HONEST = [
  "For the six months ending 30 June 2024, Action generated net sales and operating EBITDA ahead of budget and prior year.",
  "Like-for-like sales growth reached 9% for the period, driven by overall high transaction volume and robust performance in everyday necessities, which offset a decline in average selling prices.",
  "Performance for the period was achieved despite a continued focus on price reductions and the impact of softer seasonal sales due to adverse weather in north western Europe.",
  HONEST_REFINANCE,
  "Following the refinancing, 3i recycled a portion of its proceeds to acquire an additional holding in the company in July 2024, increasing its stake to 57.6%.",
  "On the commercial front, Action added 119 new stores over the period and remains on track to meet its target of 330 new stores for 2024.",
];

const HONEST_PASSAGES = [
  "For the six months ending 30 June 2024, Action generated net sales and operating EBITDA ahead of budget and prior year.",
  "Like-for-like sales growth reached 9.0 percent, driven by overall high transaction volume and robust performance in everyday necessities.",
  "Performance for the period was achieved despite a continued focus on price reductions and the impact of softer seasonal sales.",
  REAL_REFINANCE_PASSAGE,
  "In July 2024, 3i acquired an additional holding, increasing its stake to 57.6%.",
  "Action added 119 new stores over the period and remains on track to meet its target of 330 new stores for 2024.",
];

function displayVerdict(pipelineVerdict) {
  if (pipelineVerdict === "confirmed") return "supported_full";
  if (pipelineVerdict === "partially_confirmed") return "supported_partial";
  if (pipelineVerdict === "conflicting") return "conflict";
  return pipelineVerdict;
}

function moneyBrief(text) {
  return annotateTokens(text).filter((t) => t.kind === "money")[0];
}

function twoConfirmedPassages(statement, figurePassage, qualitativePassage) {
  const sourceText = `${figurePassage} ${qualitativePassage}`;
  return {
    statement,
    sourceMatches: [
      {
        sourceIndex: 0,
        sourceLabel: SOURCE_LABEL,
        classification: "confirmed",
        passage: qualitativePassage,
      },
    ],
    supportSpans: [
      { sourceRefId: 0, classification: "confirmed", passage: figurePassage },
      { sourceRefId: 0, classification: "confirmed", passage: qualitativePassage },
    ],
    sources: [{ text: sourceText, label: SOURCE_LABEL }],
  };
}

function runPath({ statement, sourceMatches, supportSpans, sources }) {
  const demoted = demoteConfirmedClassifications({
    statementText: statement,
    sourceMatches,
    supportSpans,
  });
  const reduced = applyIntraSourceReducer({
    sourceMatches: demoted.sourceMatches,
    supportSpans: demoted.supportSpans,
    sources,
    statementText: statement,
  });
  const agg = aggregateVerdict({ statementMatches: reduced });
  const excerpts = selectExcerpts({
    statementMatches: demoted.sourceMatches,
    verdict: agg.verdict,
    hasConflict: agg.hasConflict,
    supportSpans: demoted.supportSpans,
    sources,
    statementText: statement,
  });
  return { demoted, reduced, agg, excerpts };
}

describe("B347 currency symbols", () => {
  test("T1 euro 2.1 billion resolves to EUR", () => {
    const token = moneyBrief("€2.1 billion");
    assert.equal(token.currency, "EUR");
    assert.equal(token.value, 2.1);
    assert.equal(token.scale, "billion");
    assert.equal(moneyBrief("£40 million").currency, "GBP");
    assert.equal(moneyBrief("¥500 million").currency, "JPY");
    assert.equal(moneyBrief("US$1.5 billion").currency, "USD");
    assert.equal(moneyBrief("$1.5 billion").currency, null);
  });

  test("T2 honest EUR 2.1 billion against the real passage stays supported_full", () => {
    const input = twoConfirmedPassages(HONEST_REFINANCE, REAL_REFINANCE_PASSAGE, QUAL_PASSAGE);
    const { demoted, agg, excerpts } = runPath(input);
    assert.equal(confirmingPassageVerdict(HONEST_REFINANCE, REAL_REFINANCE_PASSAGE).demoteTo, null);
    for (const span of demoted.supportSpans) {
      assert.equal(span.classification, "confirmed");
    }
    assert.equal(agg.verdict, "confirmed");
    assert.equal(displayVerdict(agg.verdict), "supported_full");
    assert.equal(excerpts.primaryExcerpt?.passage, QUAL_PASSAGE);
  });

  test("T3 USD 2.1 billion against the real passage is a total conflict", () => {
    const input = twoConfirmedPassages(CURRENCY_ERROR, REAL_REFINANCE_PASSAGE, QUAL_PASSAGE);
    const { demoted, agg, excerpts } = runPath(input);
    const verdict = confirmingPassageVerdict(CURRENCY_ERROR, REAL_REFINANCE_PASSAGE);
    assert.equal(verdict.rule, "a");
    assert.equal(verdict.demoteTo, "conflicting");
    const figureSpan = demoted.supportSpans.find((s) => String(s.passage).includes("€2.1 billion"));
    assert.equal(figureSpan.classification, "conflicting");
    assert.equal(agg.verdict, "conflicting");
    assert.equal(displayVerdict(agg.verdict), "conflict");
    assert.equal(String(excerpts.primaryExcerpt?.passage).includes("€2.1 billion"), true);
  });

  test("T4 a bare dollar of the same value as USD is not a disagreement", () => {
    const dollar = "The company raised $1.5 billion.";
    const usd = "The company raised USD 1.5 billion.";
    assert.equal(confirmingPassageVerdict(dollar, usd).demoteTo, null);
    assert.equal(confirmingPassageVerdict(usd, dollar).demoteTo, null);
    assert.equal(moneyBrief("$1.5 billion").currency, null);
    assert.equal(moneyBrief("USD 1.5 billion").currency, "USD");
  });

  test("T9 honest draft produces zero new demotions", () => {
    let demotions = 0;
    HONEST.forEach((statement, i) => {
      const passage = HONEST_PASSAGES[i];
      if (confirmingPassageVerdict(statement, passage).demoteTo) demotions += 1;
      const out = demoteConfirmedClassifications({
        statementText: statement,
        sourceMatches: [
          { sourceIndex: 0, sourceLabel: SOURCE_LABEL, classification: "confirmed", passage },
        ],
        supportSpans: [{ sourceRefId: 0, classification: "confirmed", passage }],
      });
      assert.equal(out.sourceMatches[0].classification, "confirmed", statement);
      assert.equal(out.supportSpans[0].classification, "confirmed", statement);
    });
    assert.equal(demotions, 0);
  });

  test("T10 the five existing errors still raise; B336 still withholds 119 to 330", () => {
    const already = [
      { statement: DOCTORED[1], classification: "conflicting", passage: "Like-for-like sales growth reached 9.0 percent." },
      { statement: DOCTORED[2], classification: "conflicting", passage: "Performance was achieved despite a continued focus on price reductions." },
      { statement: DOCTORED[4], classification: "conflicting", passage: "In July 2024, 3i increased its stake to 57.6%." },
      { statement: DOCTORED[4], classification: "conflicting", passage: "3i increased its stake to 57.6%." },
      {
        statement: DOCTORED[5],
        classification: "conflicting",
        passage:
          "Action added 119 new stores to the end of P6 (YTD P6 2023: 90) and remains on track to meet its target of 330 stores added this year.",
      },
    ];
    for (const row of already) {
      const out = demoteConfirmedClassifications({
        statementText: row.statement,
        sourceMatches: [
          {
            sourceIndex: 0,
            sourceLabel: SOURCE_LABEL,
            classification: row.classification,
            passage: row.passage,
          },
        ],
        supportSpans: [],
      });
      assert.equal(out.sourceMatches[0].classification, "conflicting");
    }
    const outcome = applyConflictProposal(
      {
        statement: DOCTORED[5],
        primaryExcerpt:
          "Action added 119 new stores to the end of P6 (YTD P6 2023: 90) and remains on track to meet its target of 330 stores added this year.",
        rule: "conflicting",
      },
      null
    );
    assert.equal(outcome.status === "acknowledge" || outcome.explain?.code === "conflict_suppressed_figure_agrees", true);
  });
});
