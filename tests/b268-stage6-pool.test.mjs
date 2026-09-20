/**
 * B268: Stage 6 pool is 4 so a long memo can finish editorial and compliance.
 * Stage 2 and Stage 5 stay at 24. A miss is still not_reviewed, never clean.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, test, vi } from "vitest";
import { fileURLToPath } from "node:url";
import * as observability from "../lib/observability.js";
import { runEditorialComplianceReview } from "../lib/qc/editorial-compliance-reviewer.mjs";
import {
  STAGE5_CONCURRENCY,
  STAGE6_CONCURRENCY,
} from "../lib/qc/pipeline-v4/index.mjs";
import { STAGE2_CONCURRENCY } from "../lib/qc/pipeline-v4/stage2-match-sources.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PIPELINE_SRC = readFileSync(path.join(ROOT, "lib/qc/pipeline-v4/index.mjs"), "utf8");
const REVIEWER_SRC = readFileSync(
  path.join(ROOT, "lib/qc/editorial-compliance-reviewer.mjs"),
  "utf8"
);

const STATEMENT = "The company generated EUR 92 million of revenue in FY2024.";

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

const prevGate = process.env.BRIGHTLINE_EDITORIAL_REVIEW;

beforeEach(() => {
  process.env.BRIGHTLINE_EDITORIAL_REVIEW = "1";
});

afterEach(() => {
  if (prevGate === undefined) delete process.env.BRIGHTLINE_EDITORIAL_REVIEW;
  else process.env.BRIGHTLINE_EDITORIAL_REVIEW = prevGate;
  vi.restoreAllMocks();
});

describe("B268 Stage 6 pool is 4", () => {
  test("Stage 6 is 4; Stage 2 and Stage 5 stay 24", () => {
    assert.equal(STAGE6_CONCURRENCY, 4);
    assert.equal(STAGE5_CONCURRENCY, 24);
    assert.equal(STAGE2_CONCURRENCY, 24);
  });

  test("the v4 pipeline still pools Stage 6 with mapPool", () => {
    assert.equal(/stage2WithEditorial = await mapPool/.test(PIPELINE_SRC), true);
    assert.equal(PIPELINE_SRC.includes("STAGE6_CONCURRENCY"), true);
    assert.equal(PIPELINE_SRC.includes("export const STAGE6_CONCURRENCY = 4;"), true);
    assert.equal(PIPELINE_SRC.includes("export const STAGE5_CONCURRENCY = 24;"), true);
  });

  test("a thrown Stage 6 call is not_reviewed, never clean", async () => {
    const qcCard = emptyQcCard();
    vi.spyOn(observability, "hasProviderApiKey").mockReturnValue(true);
    vi.spyOn(observability, "callLLM").mockImplementation(async () => {
      throw new Error("429 Rate limit reached for gpt-4o (TPM)");
    });
    await runEditorialComplianceReview(
      [{ text: STATEMENT, qcCard }],
      {
        pipelineRoute: "v4",
        outputType: "reporting_commentary",
        requiredVersion: "complete",
        draftText: STATEMENT,
        sources: [{ text: STATEMENT, label: "memo" }],
        editorialEnabled: true,
        complianceEnabled: true,
        authoringOrganisation: "Brightline",
      }
    );
    assert.equal(qcCard.editorialVerdict, "not_reviewed");
    assert.equal(qcCard.complianceVerdict, "not_reviewed");
    assert.notEqual(qcCard.editorialVerdict, "clean");
    assert.notEqual(qcCard.complianceVerdict, "clean");
  });

  test("the not_reviewed stamp is still the writer on a rejected call", () => {
    assert.equal(REVIEWER_SRC.includes("function markEditorialNotReviewed"), true);
    assert.equal(REVIEWER_SRC.includes("function markComplianceNotReviewed"), true);
    assert.equal(REVIEWER_SRC.includes('qcCard.editorialVerdict = "not_reviewed"'), true);
    assert.equal(REVIEWER_SRC.includes('qcCard.complianceVerdict = "not_reviewed"'), true);
  });
});
