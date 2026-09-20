/**
 * B259: do not display a passage with no locatable position.
 * Recorded state: tests/fixtures/b247/r6-unsupported.json
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";
import { assembleCard } from "../lib/qc/pipeline-v3/stage7-assemble-card.mjs";
import { excerptHasLocatablePosition, gateExcerpt } from "../lib/qc/excerpt-locate.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const R6 = path.join(ROOT, "tests/fixtures/b247/r6-unsupported.json");

function loadR6() {
  return JSON.parse(readFileSync(R6, "utf8"));
}

const REVIEWS_ON = {
  evidenceEnabled: true,
  editorialEnabled: true,
  complianceEnabled: true,
};

describe("B259 unlocatable excerpt (recorded r6-unsupported)", () => {
  test("recorded conflict card quotes the unrelated Oakfield source with no spans", () => {
    const payload = loadR6();
    const card = payload.statements[0].qcCard;
    assert.match(card.statement, /Northaven Logistics/);
    assert.match(String(card.primaryExcerpt), /Oakfield Partners/);
    assert.equal(Array.isArray(card.supportSpans) && card.supportSpans.length, 0);
    assert.equal(
      excerptHasLocatablePosition({
        passage: card.primaryExcerpt,
        supportSpans: card.supportSpans,
      }),
      false
    );
  });

  test("gateExcerpt refuses that recorded passage", () => {
    const payload = loadR6();
    const card = payload.statements[0].qcCard;
    const gated = gateExcerpt({
      passage: card.primaryExcerpt,
      sourceLabel: card.primaryRefTitle,
      sources: payload.sources,
      supportSpans: card.supportSpans,
    });
    assert.equal(gated, null);
  });

  test("assembleCard does not store that passage", async () => {
    const payload = loadR6();
    const card = payload.statements[0].qcCard;
    const sourceText = payload.sources[0].text;
    const assembled = await assembleCard(
      {
        statementText: card.statement,
        startChar: card.charStart,
        endChar: card.charEnd,
        sourceMatches: [
          {
            sourceIndex: 0,
            sourceLabel: "oakfield-close.txt",
            classification: "conflicting",
            passage: sourceText,
          },
        ],
        verdictResult: {
          verdict: "conflicting",
          hasConflict: true,
          contributingSourceIndices: [0],
        },
        excerptResult: {
          primaryExcerpt: { passage: sourceText, sourceLabel: "oakfield-close.txt" },
        },
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
        sources: payload.sources,
        reviewOptions: REVIEWS_ON,
        skipEditorialDuplicationJudge: true,
      }
    );
    assert.equal(assembled.primaryExcerpt, null);
    assert.equal(assembled.primaryExcerptText, null);
    assert.equal(assembled.hasRealExcerpt, false);
    assert.equal(assembled.excerptNotLocatable, true);
  });

  test("D9: a rejected passage keeps the classification and stores no quote", async () => {
    const assembled = await assembleCard(
      {
        statementText: "Oakfield Partners closed Fund III at EUR 400 million in March 2025.",
        startChar: 0,
        endChar: 67,
        sourceMatches: [
          {
            sourceIndex: 0,
            sourceLabel: "memo",
            classification: "confirmed",
            passage: "",
            passageRejected: true,
          },
        ],
        verdictResult: {
          verdict: "confirmed",
          hasConflict: false,
          contributingSourceIndices: [0],
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
        sources: [{ text: "Oakfield Partners closed Fund III at EUR 400 million in March 2025.", label: "memo" }],
        reviewOptions: REVIEWS_ON,
        skipEditorialDuplicationJudge: true,
      }
    );
    assert.equal(assembled.displayVerdict, "supported_full");
    assert.equal(assembled.primaryExcerpt, null);
    assert.equal(assembled.hasRealExcerpt, false);
    assert.equal(assembled.excerptNotLocatable, true);
  });
});
