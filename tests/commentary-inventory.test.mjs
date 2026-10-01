/**
 * B354 Part 2. The comment must account for every claim in the sentence.
 * Strings from tests/fixtures/real-runs-2026-09-29/ where a passage is used.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";

import {
  appendSourceStatedClauses,
  buildClaimInventory,
  unaddressedInventory,
} from "../lib/qc/commentary-inventory.mjs";
import { assembleCard } from "../lib/qc/pipeline-v3/stage7-assemble-card.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_DIR = path.join(ROOT, "tests/fixtures/real-runs-2026-09-29");
const CLEAN = JSON.parse(readFileSync(path.join(FIXTURE_DIR, "clean-review.json"), "utf8"));

const TCR_PASSAGE = CLEAN.statements[12].qcCard.supportSpans[0].passage;
const AGGREGATION_STATEMENT = "3i reported meaningful gains across essentially all of its investments";

const silentFramingJudge = async () => ({
  fire: false,
  evaluativePhrase: "",
  sourceStance: "",
  note: "",
  reason: "",
});

const REVIEWS_ON = {
  evidenceEnabled: true,
  editorialEnabled: true,
  complianceEnabled: true,
};

function editorialClean() {
  return {
    editorialVerdict: "clean",
    editorialConcerns: [],
    complianceVerdict: "clean",
    complianceConcerns: [],
  };
}

describe("B354 commentary inventory", () => {
  test("aggregation: overclaim against a TCR-only passage appends nothing", () => {
    assert.match(TCR_PASSAGE, /significant valuation uplift in\nTCR/);
    const inventory = buildClaimInventory(AGGREGATION_STATEMENT);
    const result = appendSourceStatedClauses({
      commentary: "The source notes a significant valuation uplift in TCR.",
      inventory,
      confirmingPassages: [TCR_PASSAGE],
    });
    assert.equal(result.appended.length, 0);
    assert.equal(/The source also states/.test(result.commentary), false);
    assert.equal(
      inventory.some((item) => /essentially all/i.test(item)),
      true,
      `scale lexicon should name the aggregation claim, got ${JSON.stringify(inventory)}`
    );
    assert.deepEqual(result.unaddressed, inventory);
  });

  test("an item present verbatim in the confirming passage gets exactly one clause", () => {
    const statement = "Gross investment return was 9% for the period.";
    const inventory = buildClaimInventory(statement);
    assert.deepEqual(inventory, ["9%"]);
    const result = appendSourceStatedClauses({
      commentary: "The source confirms the infrastructure return.",
      inventory,
      confirmingPassages: [TCR_PASSAGE],
    });
    assert.deepEqual(result.appended, ["9%"]);
    assert.equal(result.unaddressed.length, 0);
    assert.equal(/The source also states/.test(result.commentary), false);
    assert.equal(result.commentary.endsWith("9% matches the source."), true);
    const again = appendSourceStatedClauses({
      commentary: result.commentary,
      inventory,
      confirmingPassages: [TCR_PASSAGE],
    });
    assert.equal(again.appended.length, 0);
    assert.equal((result.commentary.match(/9% matches the source\./g) || []).length, 1);
  });

  test("an item already mentioned in the commentary gets no clause", () => {
    const inventory = buildClaimInventory("Gross investment return was 9% for the period.");
    const result = appendSourceStatedClauses({
      commentary: "The source confirms the 9% gross investment return.",
      inventory,
      confirmingPassages: [TCR_PASSAGE],
    });
    assert.deepEqual(unaddressedInventory("The source confirms the 9% gross investment return.", inventory), []);
    assert.equal(result.appended.length, 0);
    assert.equal(/The source also states/.test(result.commentary), false);
  });

  test("conflictExcerpt content never produces a clause", async () => {
    const statement = "Gross investment return was 9% for the period.";
    const primary = "Action completed a capital restructuring with a pro-rata redemption of shares.";
    const conflict = TCR_PASSAGE;
    const card = await assembleCard(
      {
        statementText: statement,
        startChar: 0,
        endChar: statement.length,
        supportSpans: [{ passage: primary, sourceRefId: 0, classification: "confirmed" }],
        sourceMatches: [
          {
            sourceIndex: 0,
            classification: "conflicting",
            sourceLabel: CLEAN.sources[0].label,
            passage: primary,
          },
        ],
        verdictResult: {
          verdict: "conflicting",
          hasConflict: true,
          confirmingMatches: [{ sourceIndex: 0, sourceLabel: CLEAN.sources[0].label }],
          contributingSourceIndices: [0],
        },
        excerptResult: {
          primaryExcerpt: { passage: primary, sourceLabel: CLEAN.sources[0].label },
          conflictExcerpt: { passage: conflict, sourceLabel: CLEAN.sources[0].label },
        },
        commentaryResult: { commentary: "The source contradicts the stated return." },
        editorialResult: editorialClean(),
      },
      0,
      {
        pipelineRoute: "v4",
        skipEditorialDuplicationJudge: true,
        framingFidelityJudge: silentFramingJudge,
        reviewOptions: REVIEWS_ON,
        sources: CLEAN.sources,
      }
    );
    assert.equal(/The source also states 9%/.test(card.evidenceSummary), false);
    assert.equal(/9% matches the source/.test(card.evidenceSummary), false);
    assert.equal((card.commentaryUnaddressed || []).includes("9%"), true);
  });

  test("at most two clauses appended", () => {
    const statement =
      "Net sales for the nine months to 28 September 2025 amounted to EUR 11.2 billion, with like-for-like sales growth of 6.3%.";
    const inventory = buildClaimInventory(statement);
    assert.equal(inventory.length >= 3, true);
    const passage = inventory.join(" ");
    const result = appendSourceStatedClauses({
      commentary: "The source confirms the trading update.",
      inventory,
      confirmingPassages: [passage],
    });
    assert.equal(result.appended.length, 2);
    assert.equal(result.commentary.includes(`${result.appended[0]} and ${result.appended[1]} match the source.`), true);
    assert.equal(/matches the source/.test(result.commentary), false);
    assert.equal(/The source also states /.test(result.commentary), false);
    assert.equal(result.unaddressed.length, inventory.length - 2);
  });

  test("empty or not-reviewed commentary is untouched", async () => {
    const inventory = buildClaimInventory("Gross investment return was 9% for the period.");
    const empty = appendSourceStatedClauses({
      commentary: "",
      inventory,
      confirmingPassages: [TCR_PASSAGE],
    });
    assert.equal(empty.commentary, "");
    assert.equal(empty.appended.length, 0);

    const card = await assembleCard(
      {
        statementText: "Gross investment return was 9% for the period.",
        startChar: 0,
        endChar: 40,
        supportSpans: [{ passage: TCR_PASSAGE, sourceRefId: 0, classification: "confirmed" }],
        sourceMatches: [
          {
            sourceIndex: 0,
            classification: "confirmed",
            sourceLabel: CLEAN.sources[0].label,
            passage: TCR_PASSAGE,
          },
        ],
        verdictResult: {
          verdict: "confirmed",
          hasConflict: false,
          confirmingMatches: [{ sourceIndex: 0, sourceLabel: CLEAN.sources[0].label }],
          contributingSourceIndices: [0],
        },
        excerptResult: {
          primaryExcerpt: { passage: TCR_PASSAGE, sourceLabel: CLEAN.sources[0].label },
          conflictExcerpt: null,
        },
        commentaryResult: { commentary: "", schemaValid: false, notReviewed: true },
        editorialResult: editorialClean(),
      },
      0,
      {
        pipelineRoute: "v4",
        skipEditorialDuplicationJudge: true,
        framingFidelityJudge: silentFramingJudge,
        reviewOptions: REVIEWS_ON,
        sources: CLEAN.sources,
      }
    );
    assert.equal(card.commentaryNotReviewed, true);
    assert.equal(card.evidenceSummary, "");
    assert.deepEqual(card.commentaryUnaddressed, []);
  });
});
