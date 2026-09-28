/**
 * B348. A card with an unsupported framing word is not fully confirmed.
 * Through assembleCard / selectExcerpts / the demote path. No model calls.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";

import editorialRules from "../lib/rulebook/editorialRules.js";
import { OUTPUT_TYPE } from "../lib/output-intent.js";
import {
  buildEditorialStyleSystemPrompt,
  editorialRulesForRun,
} from "../lib/qc/editorial-compliance-reviewer.mjs";
import { isNarrativeCoherenceEnabled } from "../lib/qc/narrative-coherence.mjs";
import { assembleCard } from "../lib/qc/pipeline-v3/stage7-assemble-card.mjs";
import {
  confirmingPassageDisagrees,
  demoteConfirmedClassifications,
} from "../lib/qc/pipeline-v4/confirming-passage-disagrees.mjs";
import { applyIntraSourceReducer } from "../lib/qc/pipeline-v4/intra-source-reducer.mjs";
import { aggregateVerdict } from "../lib/qc/pipeline-v4/stage3-aggregate-verdict.mjs";
import { selectExcerpts } from "../lib/qc/pipeline-v4/stage4-select-excerpts.mjs";
import { classifyCard } from "../lib/qc/review-summary.mjs";
import { resolveStyleGuide } from "../lib/qc/style-guide.mjs";
import { applyConflictProposal } from "../lib/revise-actions/conflict-engagement.mjs";

const SOURCE_LABEL = "Action H1 2024";

const S0_RECORD =
  "For the six months ending 30 June 2024, Action generated record net sales and operating EBITDA.";
const S0_MATCHED =
  "For the six months ending 30 June 2024, Action generated net sales and operating EBITDA ahead of budget and prior year.";
const FRAMING_NOTE = 'The statement uses "record" but the matched source does not.';

const S0_NO_RECORD =
  "For the six months ending 30 June 2024, Action generated net sales and operating EBITDA ahead of budget and prior year.";

const DOCTORED = [
  S0_RECORD,
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
  "Meanwhile, the company completed a EUR 2.1 billion refinancing, reflecting its robust growth and strong cash generation.",
  "Following the refinancing, 3i recycled a portion of its proceeds to acquire an additional holding in the company in July 2024, increasing its stake to 57.6%.",
  "On the commercial front, Action added 119 new stores over the period and remains on track to meet its target of 330 new stores for 2024.",
];

const HONEST_PASSAGES = [
  S0_MATCHED,
  "Like-for-like sales growth reached 9.0 percent, driven by overall high transaction volume and robust performance in everyday necessities.",
  "Performance for the period was achieved despite a continued focus on price reductions and the impact of softer seasonal sales.",
  "In July 2024, Action successfully completed a refinancing event, raising EUR 2.1 billion in total, including a second US dollar tranche",
  "In July 2024, 3i acquired an additional holding, increasing its stake to 57.6%.",
  "Action added 119 new stores over the period and remains on track to meet its target of 330 new stores for 2024.",
];

const EUR_PASSAGE =
  "In July 2024, Action successfully completed a refinancing event, raising EUR 2.1 billion in total, including a second US dollar tranche";
const PRICE_REDUCTION_PASSAGE =
  "Performance was achieved despite a continued focus on price reductions.";
const STAKE_PASSAGE = "In July 2024, 3i increased its stake to 57.6%.";
const STORES_PASSAGE =
  "Action added 119 new stores to the end of P6 (YTD P6 2023: 90) and remains on track to meet its target of 330 stores added this year.";
const NINE_PERCENT_PASSAGE = "Like-for-like sales growth reached 9.0 percent.";

const NARRATIVE_NOTE =
  "The statement lacks coherence with the surrounding context. It introduces new elements like price increases and adverse weather without connecting them to the previous or following sentences.";

const REVIEW_ON = {
  evidenceEnabled: true,
  editorialEnabled: true,
  complianceEnabled: true,
};

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

async function assembleEvidenceCard({
  statement,
  passage,
  verdict = "confirmed",
  hasConflict = false,
  editorialConcerns = [],
  editorialVerdict = "clean",
  editorialNotReviewedReason = null,
  framingFidelityJudge,
  conflictExcerpt = null,
}) {
  return assembleCard(
    {
      statementText: statement,
      startChar: 0,
      endChar: statement.length,
      supportSpans: [{ passage, sourceRefId: 0, classification: verdict === "conflicting" ? "conflicting" : "confirmed" }],
      sourceMatches: [
        {
          sourceIndex: 0,
          classification: verdict === "conflicting" ? "conflicting" : "confirmed",
          sourceLabel: SOURCE_LABEL,
          passage,
        },
      ],
      verdictResult: {
        verdict,
        hasConflict,
        confirmingMatches: [{ sourceIndex: 0, sourceLabel: SOURCE_LABEL }],
        contributingSourceIndices: [0],
      },
      excerptResult: {
        primaryExcerpt: { passage, sourceLabel: SOURCE_LABEL },
        conflictExcerpt,
      },
      commentaryResult: { commentary: "Source match for this statement." },
      editorialResult: {
        editorialVerdict,
        editorialConcerns,
        editorialNotReviewedReason,
        complianceVerdict: "clean",
        complianceConcerns: [],
      },
    },
    0,
    {
      pipelineRoute: "v4",
      skipEditorialDuplicationJudge: true,
      reviewOptions: REVIEW_ON,
      sources: [{ text: passage, label: SOURCE_LABEL }],
      framingFidelityJudge,
    }
  );
}

function assertEditorialStillRan(card) {
  const classified = classifyCard(card, REVIEW_ON);
  assert.equal(classified.turnedOffLine, null);
  assert.equal(card.editorialNotReviewedReason == null, true);
  assert.notEqual(card.editorialVerdict, "not_reviewed");
}

describe("B348 framing demotes a confirmed card", () => {
  test("T1 S0 record on a confirmed match is supported_partial, moderate, slug present, note unchanged", async () => {
    const card = await assembleEvidenceCard({
      statement: S0_RECORD,
      passage: S0_MATCHED,
    });
    assert.equal(card.statement, S0_RECORD);
    assert.equal(card.supportState, "supported");
    assert.equal(card.displayVerdict, "supported_partial");
    assert.equal(card.concernLevel, "moderate");
    assert.equal(card.displayVerdictReason, "framing_fidelity");
    assert.equal(card.framingFidelityConcerns.length, 1);
    assert.equal(card.framingFidelityConcerns[0].note, FRAMING_NOTE);
  });

  test("T2 a confirmed card with no framing concern is unchanged", async () => {
    const card = await assembleEvidenceCard({
      statement: S0_NO_RECORD,
      passage: S0_MATCHED,
      framingFidelityJudge: async () => ({
        fire: false,
        evaluativePhrase: "",
        sourceStance: "",
        note: "",
        reason: "",
      }),
    });
    assert.equal(card.displayVerdict, "supported_full");
    assert.equal(card.concernLevel, "none");
    assert.equal(card.displayVerdictReason, null);
    assert.equal(card.framingFidelityConcerns.length, 0);
  });

  test("T3 a card already partial or conflicting is unchanged", async () => {
    const partial = await assembleEvidenceCard({
      statement: S0_RECORD,
      passage: S0_MATCHED,
      verdict: "partially_confirmed",
      hasConflict: false,
    });
    assert.equal(partial.displayVerdict, "supported_partial");
    assert.equal(partial.concernLevel, "moderate");
    assert.equal(partial.displayVerdictReason, null);
    assert.equal(partial.framingFidelityConcerns.length, 1);
    assert.equal(partial.framingFidelityConcerns[0].note, FRAMING_NOTE);

    const conflicting = await assembleEvidenceCard({
      statement: DOCTORED[1],
      passage: NINE_PERCENT_PASSAGE,
      verdict: "conflicting",
      hasConflict: true,
      framingFidelityJudge: async () => {
        throw new Error("framing judge must not run on a conflicting card");
      },
    });
    assert.equal(conflicting.displayVerdict, "conflict");
    assert.equal(conflicting.concernLevel, "high");
    assert.equal(conflicting.displayVerdictReason, null);
    assert.equal(conflicting.framingFidelityConcerns.length, 0);
  });

  test("T7 narrative_coherence produces no concern when the flag is off", async () => {
    assert.equal(isNarrativeCoherenceEnabled(), false);
    const listed = editorialRulesForRun(editorialRules, "reporting_commentary", "complete");
    assert.equal(listed.some((r) => r.id === "narrative_coherence"), false);
    const prompt = buildEditorialStyleSystemPrompt({
      outputTypeLabel: "Reporting commentary",
      editorialRules,
      structuredStyleRules: resolveStyleGuide({
        outputType: OUTPUT_TYPE.REPORTING_COMMENTARY,
        promptHouseName: "Halden Group",
      }),
      outputSlug: "reporting_commentary",
      outputType: OUTPUT_TYPE.REPORTING_COMMENTARY,
      houseName: "Halden Group",
    });
    assert.equal(/\n\d+\. narrative_coherence:/.test(prompt), false);
    const card = await assembleEvidenceCard({
      statement: DOCTORED[2],
      passage: PRICE_REDUCTION_PASSAGE,
      verdict: "conflicting",
      hasConflict: true,
      editorialVerdict: "concern",
      editorialConcerns: [
        {
          concernCode: "narrative_coherence",
          note: NARRATIVE_NOTE,
          category: "editorial",
        },
      ],
    });
    assert.equal(card.editorialConcerns.some((c) => c.concernCode === "narrative_coherence"), false);
    assert.equal(card.editorialVerdict, "clean");
    assertEditorialStillRan(card);
  });

  test("T8 the six errors still raise with the same verdicts, and the two derived corrections still appear", async () => {
    const s0 = await assembleEvidenceCard({ statement: DOCTORED[0], passage: S0_MATCHED });
    assert.equal(s0.framingFidelityConcerns.length, 1);
    assert.equal(s0.framingFidelityConcerns[0].note, FRAMING_NOTE);
    assert.equal(s0.supportState, "supported");
    assert.equal(s0.displayVerdict, "supported_partial");

    const s1 = runPath({
      statement: DOCTORED[1],
      sourceMatches: [
        {
          sourceIndex: 0,
          sourceLabel: SOURCE_LABEL,
          classification: "conflicting",
          passage: NINE_PERCENT_PASSAGE,
        },
      ],
      supportSpans: [],
      sources: [{ text: NINE_PERCENT_PASSAGE, label: SOURCE_LABEL }],
    });
    assert.equal(s1.agg.verdict, "conflicting");

    const s2 = runPath({
      statement: DOCTORED[2],
      sourceMatches: [
        {
          sourceIndex: 0,
          sourceLabel: SOURCE_LABEL,
          classification: "conflicting",
          passage: PRICE_REDUCTION_PASSAGE,
        },
      ],
      supportSpans: [],
      sources: [{ text: PRICE_REDUCTION_PASSAGE, label: SOURCE_LABEL }],
    });
    assert.equal(s2.agg.verdict, "conflicting");

    const s3 = runPath({
      statement: DOCTORED[3],
      sourceMatches: [
        {
          sourceIndex: 0,
          sourceLabel: SOURCE_LABEL,
          classification: "confirmed",
          passage: EUR_PASSAGE,
        },
      ],
      supportSpans: [{ sourceRefId: 0, classification: "confirmed", passage: EUR_PASSAGE }],
      sources: [{ text: EUR_PASSAGE, label: SOURCE_LABEL }],
    });
    assert.equal(s3.agg.verdict, "conflicting");

    const s4 = runPath({
      statement: DOCTORED[4],
      sourceMatches: [
        {
          sourceIndex: 0,
          sourceLabel: SOURCE_LABEL,
          classification: "conflicting",
          passage: STAKE_PASSAGE,
        },
      ],
      supportSpans: [],
      sources: [{ text: STAKE_PASSAGE, label: SOURCE_LABEL }],
    });
    assert.equal(s4.agg.verdict, "conflicting");

    const s5 = runPath({
      statement: DOCTORED[5],
      sourceMatches: [
        {
          sourceIndex: 0,
          sourceLabel: SOURCE_LABEL,
          classification: "conflicting",
          passage: STORES_PASSAGE,
        },
      ],
      supportSpans: [],
      sources: [{ text: STORES_PASSAGE, label: SOURCE_LABEL }],
    });
    assert.equal(s5.agg.verdict, "conflicting");

    const twelve = applyConflictProposal(
      { statement: DOCTORED[1], primaryExcerpt: "Like-for-like sales growth was 9.0%", rule: "conflicting" },
      null
    );
    assert.equal(twelve.status, "replace");
    assert.equal(twelve.proposal.proposedChange, "Replace '12%' with '9.0%'.");

    const stake = applyConflictProposal(
      { statement: DOCTORED[4], primaryExcerpt: STAKE_PASSAGE, rule: "conflicting" },
      null
    );
    assert.equal(stake.status, "replace");
    assert.equal(String(stake.proposal?.proposedChange || "").includes("Replace '56.7%' with '57.6%'"), true);
  });

  test("T9 the honest draft produces no new finding", async () => {
    const findings = [];
    for (let i = 0; i < HONEST.length; i++) {
      const statement = HONEST[i];
      const passage = HONEST_PASSAGES[i];
      if (confirmingPassageDisagrees(statement, passage)) {
        findings.push(`demote: ${statement}`);
      }
      const out = demoteConfirmedClassifications({
        statementText: statement,
        sourceMatches: [
          {
            sourceIndex: 0,
            sourceLabel: SOURCE_LABEL,
            classification: "confirmed",
            passage,
          },
        ],
        supportSpans: [{ sourceRefId: 0, classification: "confirmed", passage }],
      });
      assert.equal(out.sourceMatches[0].classification, "confirmed", statement);
      const card = await assembleEvidenceCard({
        statement,
        passage,
        framingFidelityJudge: async () => ({
          fire: false,
          evaluativePhrase: "",
          sourceStance: "",
          note: "",
          reason: "",
        }),
      });
      if (card.displayVerdict !== "supported_full") {
        findings.push(`display ${card.displayVerdict}: ${statement}`);
      }
      if (card.framingFidelityConcerns.length > 0) {
        findings.push(`framing: ${statement}`);
      }
    }
    assert.deepEqual(findings, []);
  });
});
