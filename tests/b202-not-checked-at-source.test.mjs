import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test, vi } from "vitest";
import * as observability from "../lib/observability.js";
import { runEditorialComplianceReview } from "../lib/qc/editorial-compliance-reviewer.mjs";
import { assembleCard } from "../lib/qc/pipeline-v3/stage7-assemble-card.mjs";
import { classifyCard, summariseReview } from "../lib/qc/review-summary.mjs";

const STATEMENT = "The company generated EUR 92 million of revenue in FY2024.";

const REVIEWS_ON = {
  evidenceEnabled: true,
  editorialEnabled: true,
  complianceEnabled: true,
};

const COMPLIANCE_OFF = {
  evidenceEnabled: true,
  editorialEnabled: true,
  complianceEnabled: false,
};

const CLEAN_EDITORIAL_JSON = JSON.stringify({
  verdict: "clean",
  concerns: [],
  verdictNote: "No editorial or style concerns identified under the listed rules.",
});

function emptyQcCard() {
  return {
    suppressInQcWorkbench: false,
    editorialVerdict: null,
    editorialConcerns: null,
    editorialNote: null,
    editorialSuggestedDirection: null,
    editorialSuggestedRewrite: null,
    complianceVerdict: null,
    complianceConcerns: null,
    complianceNote: null,
    complianceSuggestedDirection: null,
    complianceSuggestedRewrite: null,
  };
}

function statementEntry(editorialResult) {
  return {
    statementText: STATEMENT,
    startChar: 0,
    endChar: STATEMENT.length,
    sourceMatches: [
      { sourceIndex: 0, classification: "confirmed", sourceLabel: "memo" },
    ],
    verdictResult: {
      verdict: "confirmed",
      hasConflict: false,
      confirmingMatches: [{ sourceIndex: 0, sourceLabel: "memo" }],
      contributingSourceIndices: [0],
    },
    excerptResult: {
      primaryExcerpt: { passage: STATEMENT, sourceLabel: "memo" },
    },
    editorialResult,
  };
}

function assemblyContext(reviewOptions) {
  return {
    pipelineRoute: "v4",
    skipEditorialDuplicationJudge: true,
    reviewOptions,
  };
}

function reviewContext(toggles) {
  return {
    pipelineRoute: "v4",
    outputType: "reporting_commentary",
    requiredVersion: "complete",
    draftText: STATEMENT,
    sources: [{ text: STATEMENT, label: "memo" }],
    editorialEnabled: toggles.editorialEnabled,
    complianceEnabled: toggles.complianceEnabled,
    authoringOrganisation: "Brightline",
  };
}

async function reviewThenAssemble({ toggles, stubCallLLM }) {
  const qcCard = emptyQcCard();
  const reviewStatement = { text: STATEMENT, qcCard };
  vi.spyOn(observability, "hasProviderApiKey").mockReturnValue(true);
  vi.spyOn(observability, "callLLM").mockImplementation(stubCallLLM);
  await runEditorialComplianceReview([reviewStatement], reviewContext(toggles));
  const card = await assembleCard(
    statementEntry(reviewStatement.qcCard),
    0,
    assemblyContext(toggles)
  );
  return { qcCard: reviewStatement.qcCard, card };
}

const prevGate = process.env.BRIGHTLINE_EDITORIAL_REVIEW;

beforeEach(() => {
  process.env.BRIGHTLINE_EDITORIAL_REVIEW = "1";
});

afterEach(() => {
  if (prevGate === undefined) delete process.env.BRIGHTLINE_EDITORIAL_REVIEW;
  else process.env.BRIGHTLINE_EDITORIAL_REVIEW = prevGate;
  vi.restoreAllMocks();
});

describe("B202 a check that did not run is not_reviewed, never clean", () => {
  test("(a) unparseable compliance reply is not_reviewed and not Ready", async () => {
    const { card } = await reviewThenAssemble({
      toggles: REVIEWS_ON,
      stubCallLLM: async (args) => {
        if (args?.spanName === "qc-compliance-review") {
          return { text: "this is not json at all" };
        }
        return { text: CLEAN_EDITORIAL_JSON };
      },
    });
    const cls = classifyCard(card, REVIEWS_ON);
    const summary = summariseReview([card], REVIEWS_ON);
    assert.equal(card.complianceVerdict, "not_reviewed");
    assert.equal(cls.compliance, "notChecked");
    assert.notEqual(summary.readiness, "Ready");
  });

  test("(b) thrown editorial/compliance review marks both not_reviewed", async () => {
    const { card } = await reviewThenAssemble({
      toggles: REVIEWS_ON,
      stubCallLLM: async () => {
        throw new Error("provider down");
      },
    });
    assert.equal(card.editorialVerdict, "not_reviewed");
    assert.equal(card.complianceVerdict, "not_reviewed");
  });

  test("compliance OFF keeps today's assembled output", async () => {
    const { card } = await reviewThenAssemble({
      toggles: COMPLIANCE_OFF,
      stubCallLLM: async () => ({ text: CLEAN_EDITORIAL_JSON }),
    });
    const cls = classifyCard(card, COMPLIANCE_OFF);
    const summary = summariseReview([card], COMPLIANCE_OFF);
    assert.equal(card.editorialVerdict, "clean");
    assert.equal(card.complianceVerdict, "clean");
    assert.equal(cls.compliance, null);
    assert.equal(summary.compliance, null);
    assert.equal(summary.readiness, "Ready");
  });

  test("classifySignal: null with the review ON is notChecked; null with OFF is null", () => {
    assert.equal(
      classifyCard({ complianceVerdict: null }, { complianceEnabled: true }).compliance,
      "notChecked"
    );
    assert.equal(
      classifyCard({ editorialVerdict: null }, { editorialEnabled: true }).editorial,
      "notChecked"
    );
    assert.equal(
      classifyCard({ complianceVerdict: null }, { complianceEnabled: false }).compliance,
      null
    );
    assert.equal(
      classifyCard({ editorialVerdict: null }, { editorialEnabled: false }).editorial,
      null
    );
  });

  test("unrecognised verdict with the review ON is notChecked / not_reviewed; OFF is unchanged", async () => {
    assert.equal(
      classifyCard({ editorialVerdict: "mystery" }, { editorialEnabled: true }).editorial,
      "notChecked"
    );
    const onCard = await assembleCard(
      statementEntry({
        editorialVerdict: "mystery",
        editorialConcerns: [],
        complianceVerdict: "clean",
        complianceConcerns: [],
      }),
      0,
      assemblyContext(REVIEWS_ON)
    );
    assert.equal(onCard.editorialVerdict, "not_reviewed");
    assert.equal(classifyCard(onCard, REVIEWS_ON).editorial, "notChecked");

    const editorialOff = { ...REVIEWS_ON, editorialEnabled: false };
    assert.equal(
      classifyCard({ editorialVerdict: "mystery" }, editorialOff).editorial,
      null
    );
    const offCard = await assembleCard(
      statementEntry({
        editorialVerdict: "mystery",
        editorialConcerns: [],
        complianceVerdict: "clean",
        complianceConcerns: [],
      }),
      0,
      assemblyContext(editorialOff)
    );
    assert.equal(offCard.editorialVerdict, "mystery");
    assert.equal(classifyCard(offCard, editorialOff).editorial, null);
  });
});
