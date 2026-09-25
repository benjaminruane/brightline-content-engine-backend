#!/usr/bin/env node
/**
 * B329. Print the four client bodies. No model calls.
 *   node scripts/diagnostic/review-deadline/print-responses.mjs
 */
import { preflightReview } from "../../../lib/qc/preflight-guard.mjs";
import { INCOMPLETE_CAUSES } from "../../../lib/qc/not-reviewed-reason.mjs";
import {
  buildIncompleteReviewResponse,
  reviewOutcomeFromPipeline,
} from "../../../lib/qc/review-deadline.mjs";

const SYS = {
  editorialSystemTokens: 9088,
  complianceSystemTokens: 3000,
  stage2SystemTokens: 4000,
  stage5SystemTokens: 1600,
};

function huge(words, stem) {
  return Array.from({ length: words }, (_, i) => `${stem}${i}`).join(" ");
}

const completeCards = [
  {
    index: 0,
    statement: "Revenue grew to EUR 92 million.",
    editorialVerdict: "clean",
    complianceVerdict: "clean",
    displayVerdict: "supported_full",
  },
  {
    index: 1,
    statement: "Costs fell year on year.",
    editorialVerdict: "clean",
    complianceVerdict: "clean",
    displayVerdict: "supported_full",
  },
];

const gappedCards = [
  { ...completeCards[0], editorialVerdict: "not_reviewed" },
  completeCards[1],
];

function asAnalyseBody(cards) {
  return {
    ok: true,
    error: null,
    statements: cards.map((card) => ({
      id: String(card.index),
      text: card.statement,
      qcCard: card,
    })),
    references: [],
    meta: {
      pipelineVersion: "v4",
      reviewSummary: {
        version: 1,
        statements: cards.length,
        notChecked: cards.filter((c) => c.editorialVerdict === "not_reviewed").length,
      },
    },
  };
}

const complete = asAnalyseBody(completeCards);
const completeWithGaps = asAnalyseBody(gappedCards);

const cutPipeline = {
  stage1: { statements: [{ text: completeCards[0].statement }, { text: completeCards[1].statement }] },
  qcCards: [gappedCards[0]],
};
const cutOutcome = reviewOutcomeFromPipeline(cutPipeline);
const cutOff = buildIncompleteReviewResponse({
  cause: INCOMPLETE_CAUSES.DEADLINE,
  expectedSentences: cutOutcome.expectedSentences,
  reachedSentences: cutOutcome.reachedSentences,
});

const gate = preflightReview({
  draftText: huge(80_000, "d"),
  sources: [{ text: huge(80_000, "s"), label: "source" }],
  ...SYS,
});
const refused = buildIncompleteReviewResponse({
  cause: INCOMPLETE_CAUSES.TOO_LARGE,
  expectedSentences: gate.estimate.statementCount,
  reachedSentences: 0,
  extraMeta: {
    preflight: {
      wordCount: gate.estimate.wordCount,
      statementCount: gate.estimate.statementCount,
      totalTokens: gate.estimate.totalTokens,
      tpmFloorMs: gate.estimate.tpmFloorMs,
      idleWallMs: gate.estimate.idleWallMs,
      capMs: gate.capMs,
    },
  },
});

process.stdout.write(
  JSON.stringify(
    {
      complete,
      completeWithGaps,
      cutOff,
      refused,
    },
    null,
    2
  ) + "\n"
);
