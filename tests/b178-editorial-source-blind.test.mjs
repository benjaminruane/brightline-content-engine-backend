/**
 * B178: editorial and style payloads carry no source text.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import editorialRules from "../lib/rulebook/editorialRules.js";
import { OUTPUT_TYPE, VISIBILITY, getOutputTypeLabel } from "../lib/output-intent.js";
import { resolveStyleGuide } from "../lib/qc/style-guide.mjs";
import {
  buildEditorialStyleSystemPrompt,
  buildEditorialStyleUserPayload,
  buildEditorialUserPayload,
  verifyFidelity,
} from "../lib/qc/editorial-compliance-reviewer.mjs";

const SENTINEL = "ZZQQ_SOURCE_SENTINEL 14,000";
const STATEMENT = "The Company currently serves 412 property management companies.";
const OUTPUT_TYPE_VALUE = OUTPUT_TYPE.REPORTING_COMMENTARY;
const OUTPUT_LABEL = getOutputTypeLabel(OUTPUT_TYPE_VALUE);
const HOUSE_NAME = "Halden Group";

function combinedPayload() {
  return buildEditorialStyleUserPayload({
    sentenceText: STATEMENT,
    outputTypeLabel: OUTPUT_LABEL,
    requiredVersion: VISIBILITY.COMPLETE,
    draftText: STATEMENT,
    evidenceExcerpt: SENTINEL,
    contextBefore: null,
    contextAfter: null,
    evidenceBlock: SENTINEL,
    authoringOrganisation: HOUSE_NAME,
  });
}

function splitPayload() {
  return buildEditorialUserPayload(
    STATEMENT,
    STATEMENT,
    SENTINEL,
    { outputTypeLabel: OUTPUT_LABEL, requiredVersion: VISIBILITY.COMPLETE },
    null,
    null,
    SENTINEL
  );
}

describe("B178 editorial source-blind", () => {
  test("T1 neither payload contains the source sentinel", () => {
    assert.equal(combinedPayload().includes("ZZQQ_SOURCE_SENTINEL"), false);
    assert.equal(splitPayload().includes("ZZQQ_SOURCE_SENTINEL"), false);
  });

  test("T2 neither payload contains EVIDENCE EXCERPT", () => {
    assert.equal(combinedPayload().includes("EVIDENCE EXCERPT"), false);
    assert.equal(splitPayload().includes("EVIDENCE EXCERPT"), false);
  });

  test("T3 neither payload contains SOURCE EVIDENCE", () => {
    assert.equal(combinedPayload().includes("SOURCE EVIDENCE"), false);
    assert.equal(splitPayload().includes("SOURCE EVIDENCE"), false);
  });

  test("T4 both payloads still contain the CURRENT STATEMENT and FULL DRAFT", () => {
    for (const payload of [combinedPayload(), splitPayload()]) {
      assert.equal(payload.includes(STATEMENT), true);
      assert.equal(payload.includes("CURRENT STATEMENT"), true);
      assert.equal(payload.includes("FULL DRAFT"), true);
    }
  });

  test("T5 verifyFidelity drops a source-figure quote when the excerpt is null", () => {
    const check = verifyFidelity({
      concern: {
        note: "The source states '14,000'.",
        suggestedDirection: "Replace '14'000' with '14,000'.",
      },
      statementText: "The addressable market is 14'000 forwarders.",
      evidenceExcerpt: null,
    });
    assert.equal(check.pass, false);
  });

  test("T6 combined system prompt dropped the source-authority sentences", () => {
    const prompt = buildEditorialStyleSystemPrompt({
      outputTypeLabel: OUTPUT_LABEL,
      editorialRules,
      structuredStyleRules: resolveStyleGuide({
        outputType: OUTPUT_TYPE_VALUE,
        promptHouseName: HOUSE_NAME,
      }),
      outputSlug: "reporting_commentary",
      outputType: OUTPUT_TYPE_VALUE,
      houseName: HOUSE_NAME,
    });
    assert.equal(prompt.includes("Source documents are not written to them"), false);
    assert.equal(prompt.includes("The SOURCE EVIDENCE block below"), false);
  });
});
