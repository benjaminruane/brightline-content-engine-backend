/**
 * B247: when editorial or compliance is off, store not_reviewed, not clean.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";
import { assembleCard } from "../lib/qc/pipeline-v3/stage7-assemble-card.mjs";
import { classifyCard } from "../lib/qc/review-summary.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const R3 = path.join(ROOT, "tests/fixtures/b247/r3-evidence-only.json");

const STATEMENT = "Oakfield Partners closed Fund III at EUR 400 million in March 2025.";

function statementEntry(editorialResult) {
  return {
    statementText: STATEMENT,
    startChar: 0,
    endChar: STATEMENT.length,
    sourceMatches: [{ sourceIndex: 0, classification: "confirmed", sourceLabel: "memo", passage: STATEMENT }],
    verdictResult: {
      verdict: "confirmed",
      hasConflict: false,
      contributingSourceIndices: [0],
    },
    excerptResult: {
      primaryExcerpt: { passage: STATEMENT, sourceLabel: "memo" },
    },
    supportSpans: [{ passage: STATEMENT, classification: "confirmed" }],
    editorialResult,
  };
}

describe("B247 stored verdict honesty", () => {
  test("recorded r3 stores clean while editorial is off (before picture)", () => {
    const payload = JSON.parse(readFileSync(R3, "utf8"));
    assert.equal(payload.meta.reviewOptions.editorialEnabled, false);
    assert.equal(payload.meta.reviewOptions.complianceEnabled, false);
    for (const row of payload.statements) {
      assert.equal(row.qcCard.editorialVerdict, "clean");
      assert.equal(row.qcCard.complianceVerdict, "clean");
    }
  });

  test("assembleCard stamps not_reviewed when editorial and compliance are off", async () => {
    const off = {
      evidenceEnabled: true,
      editorialEnabled: false,
      complianceEnabled: false,
    };
    const card = await assembleCard(
      statementEntry({
        editorialVerdict: "clean",
        editorialConcerns: [],
        complianceVerdict: "clean",
        complianceConcerns: [],
      }),
      0,
      {
        pipelineRoute: "v4",
        reviewOptions: off,
        skipEditorialDuplicationJudge: true,
        sources: [{ text: STATEMENT, label: "memo" }],
      }
    );
    assert.equal(card.editorialVerdict, "not_reviewed");
    assert.equal(card.complianceVerdict, "not_reviewed");
    assert.equal(classifyCard(card, off).editorial, null);
    assert.equal(classifyCard(card, off).compliance, null);
  });
});
