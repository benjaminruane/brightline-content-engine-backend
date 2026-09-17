import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test, vi } from "vitest";
import * as observability from "../lib/observability.js";
import { finalizeEvidenceSkippedReview } from "../lib/qc/evidence-skipped-fast-path.mjs";

const CLEAN_VIOLATIONS = JSON.stringify({ violations: [] });

function makeStatements(n) {
  const statements = [];
  const parts = [];
  for (let i = 0; i < n; i += 1) {
    const text = `Sentence number ${i + 1} reports a figure of ${100 + i} million.`;
    parts.push(text);
    statements.push({ text, id: `stmt_${i}` });
  }
  return { statements, draftText: parts.join(" ") };
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

describe("B206 editorial and compliance check every sentence", () => {
  test("evidence-skipped batch of 25 gives statements 21 to 25 real verdicts", async () => {
    vi.spyOn(observability, "hasProviderApiKey").mockReturnValue(true);
    vi.spyOn(observability, "callLLM").mockResolvedValue({ text: CLEAN_VIOLATIONS });

    const { statements, draftText } = makeStatements(25);
    const result = await finalizeEvidenceSkippedReview({
      statements,
      draftText,
      body: {
        outputType: "reporting_commentary",
        visibility: "complete",
        editorialEnabled: true,
        complianceEnabled: true,
        authoringOrganisation: "Brightline",
      },
      unifiedReferences: [],
      webObs: { enabled: false, used: false },
      webEnabled: false,
      webMode: "OFF",
      runId: "b206",
      reqSig: null,
      selectionUsed: false,
      selectionHash: null,
      selectedText: "",
      llmClaimExtractionMeta: { fallback_mode: true },
      sourceIngestionWarnings: null,
      sourceIngestionWarningMessage: null,
      totalTextLowWarning: false,
      extractionGuardrailResults: null,
      sources: [],
    });

    assert.equal(result.statements.length, 25);
    for (let i = 20; i < 25; i += 1) {
      const card = result.statements[i].qcCard;
      assert.equal(typeof card.editorialVerdict, "string", `statement ${i + 1} editorialVerdict`);
      assert.notEqual(card.editorialVerdict, "", `statement ${i + 1} editorialVerdict empty`);
      assert.equal(typeof card.complianceVerdict, "string", `statement ${i + 1} complianceVerdict`);
      assert.notEqual(card.complianceVerdict, "", `statement ${i + 1} complianceVerdict empty`);
    }
  });
});
