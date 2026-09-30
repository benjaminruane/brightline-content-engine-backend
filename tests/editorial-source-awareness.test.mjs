/**
 * B352 Part 1. A concern the source already made is not a concern.
 * Strings from tests/fixtures/real-runs-2026-09-29/. No paraphrases.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";

import {
  applyEditorialSourceAwareness,
  EDITORIAL_PHRASE_IN_SOURCE,
  flaggedTextsFromConcern,
  matchedPassagesFromCard,
} from "../lib/qc/editorial-source-awareness.mjs";
import { assembleCard } from "../lib/qc/pipeline-v3/stage7-assemble-card.mjs";
import { selectExcerpts } from "../lib/qc/pipeline-v4/stage4-select-excerpts.mjs";
import { classifyCard, summariseReview } from "../lib/qc/review-summary.mjs";
import { NOT_REVIEWED_REASONS } from "../lib/qc/not-reviewed-reason.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_DIR = path.join(ROOT, "tests/fixtures/real-runs-2026-09-29");

function loadJson(name) {
  return JSON.parse(readFileSync(path.join(FIXTURE_DIR, name), "utf8"));
}

const CLEAN = loadJson("clean-review.json");
const DOC = loadJson("doc-review.json");
const DOC_ACTIONS = loadJson("doc-actions.json");

const REVIEWS_ON = {
  evidenceEnabled: true,
  editorialEnabled: true,
  complianceEnabled: true,
};

const silentFramingJudge = async () => ({
  fire: false,
  evaluativePhrase: "",
  sourceStance: "",
  note: "",
  reason: "",
});

function cardAt(payload, index) {
  return payload.statements[index].qcCard;
}

function supportStateToVerdict(supportState) {
  if (supportState === "supported") return "confirmed";
  if (supportState === "partial") return "partially_confirmed";
  if (supportState === "conflicting") return "conflicting";
  if (supportState === "skipped") return "not_reviewed";
  return "not_supported";
}

function excerptPointer(card, sources) {
  const label = card.primaryRefTitle || sources[0]?.label || sources[0]?.name || "";
  const p = card.primaryExcerpt;
  if (p == null) return null;
  if (typeof p === "string") return { passage: p, sourceLabel: label };
  if (typeof p.passage === "string") return { passage: p.passage, sourceLabel: p.sourceLabel || label };
  return null;
}

function matchesFromCard(card, sources) {
  const label = sources[0]?.label || sources[0]?.name || "";
  const fps = Array.isArray(card.stage2SourceFingerprints) ? card.stage2SourceFingerprints : [];
  const pointer = excerptPointer(card, sources);
  if (fps.length > 0) {
    return fps.map((fp) => ({
      sourceIndex: Number.isFinite(fp.sourceIndex) ? fp.sourceIndex : 0,
      sourceLabel: fp.sourceLabel || label,
      classification: fp.classification,
      passage: pointer?.passage || "",
    }));
  }
  return [];
}

async function replayCard(payload, index) {
  const card = cardAt(payload, index);
  const sources = payload.sources;
  const verdict = supportStateToVerdict(card.supportState);
  const sourceMatches = matchesFromCard(card, sources);
  const excerpts = selectExcerpts({
    statementMatches: sourceMatches,
    verdict,
    hasConflict: card.hasConflict === true,
    supportSpans: card.supportSpans,
    sources,
    statementText: card.statement,
  });
  return assembleCard(
    {
      statementText: card.statement,
      startChar: card.charStart,
      endChar: card.charEnd,
      supportSpans: card.supportSpans,
      sourceMatches,
      verdictResult: {
        verdict,
        hasConflict: card.hasConflict === true,
        confirmingMatches: [{ sourceIndex: 0, sourceLabel: sources[0]?.label || sources[0]?.name }],
        contributingSourceIndices: [0],
      },
      excerptResult: excerpts,
      commentaryResult: { commentary: card.evidenceSummary || "" },
      editorialResult: {
        editorialVerdict: card.editorialVerdict,
        editorialConcerns: Array.isArray(card.editorialConcerns) ? card.editorialConcerns : [],
        editorialNote: card.editorialNote,
        editorialSuggestedDirection: card.editorialSuggestedDirection,
        editorialSuggestedRewrite: card.editorialSuggestedRewrite,
        complianceVerdict: card.complianceVerdict,
        complianceConcerns: Array.isArray(card.complianceConcerns) ? card.complianceConcerns : [],
      },
    },
    index,
    {
      pipelineRoute: "v4",
      sources,
      reviewOptions: REVIEWS_ON,
      skipEditorialDuplicationJudge: true,
      framingFidelityJudge: silentFramingJudge,
      today: new Date("2026-09-29T00:00:00.000Z"),
    }
  );
}

function codes(card) {
  return (card.editorialConcerns || []).map((c) => c.concernCode);
}

function printPart0(index) {
  const card = cardAt(CLEAN, index);
  const passages = matchedPassagesFromCard({
    primaryExcerpt: card.primaryExcerpt,
    supportSpans: card.supportSpans,
  });
  const concern = (card.editorialConcerns || [])[0];
  return {
    flagged: flaggedTextsFromConcern(concern, card.statement),
    passages,
  };
}

describe("B352 editorial source-awareness", () => {
  test("T1 S3 record year is dropped", async () => {
    const recorded = cardAt(CLEAN, 3);
    assert.equal(recorded.editorialVerdict, "concern");
    assert.equal(codes(recorded).includes("marketing_language_excess"), true);
    assert.match(recorded.editorialConcerns[0].note, /record year/);
    assert.match(recorded.supportSpans[0].passage, /record year/);

    const after = await replayCard(CLEAN, 3);
    assert.equal(codes(after).includes("marketing_language_excess"), false);
    assert.equal((after.editorialConcerns || []).length, 0);
    assert.equal(after.editorialVerdict, "clean");
    assert.equal(after.displayVerdict, "supported_full");
  });

  test("T2 S12 driven primarily is dropped", async () => {
    const recorded = cardAt(CLEAN, 12);
    assert.equal(recorded.editorialVerdict, "concern");
    assert.equal(codes(recorded).includes("overreach_unsupported_causal"), true);
    assert.match(
      recorded.editorialConcerns[0].note,
      /Performance was driven primarily by share price gains at 3i Infrastructure plc/
    );
    assert.match(recorded.supportSpans[0].passage, /driven primarily by/);

    const after = await replayCard(CLEAN, 12);
    assert.equal(codes(after).includes("overreach_unsupported_causal"), false);
    assert.equal((after.editorialConcerns || []).length, 0);
    assert.equal(after.editorialVerdict, "clean");
    assert.equal(after.displayVerdict, "supported_full");
  });

  test("T3 S8 significant SURVIVES because the document hit is on another card", async () => {
    const recorded = cardAt(CLEAN, 8);
    assert.equal(recorded.editorialVerdict, "concern");
    assert.match(recorded.editorialConcerns[0].suggestedDirection, /Delete 'significant'/);
    const s8Passages = matchedPassagesFromCard({
      primaryExcerpt: recorded.primaryExcerpt,
      supportSpans: recorded.supportSpans,
    }).join("\n");
    assert.equal(/\bsignificant\b/i.test(s8Passages), false);
    const s12 = cardAt(CLEAN, 12);
    assert.match(s12.supportSpans[0].passage, /significant valuation uplift in\nTCR/);

    const after = await replayCard(CLEAN, 8);
    assert.equal(codes(after).includes("marketing_language_excess"), true);
    assert.equal(after.editorialVerdict, "concern");
    assert.match(after.editorialConcerns[0].suggestedDirection, /Delete 'significant'/);
  });

  test("T4 concern counts, needs-attention and card colour move when a concern is dropped", async () => {
    const beforeCard = cardAt(CLEAN, 3);
    const beforeCls = classifyCard(beforeCard, REVIEWS_ON);
    assert.equal(beforeCls.editorial, "concern");
    assert.equal(beforeCls.needsAttention, true);
    assert.equal(beforeCls.cardTone, "amber");

    const afterCard = await replayCard(CLEAN, 3);
    const afterCls = classifyCard(afterCard, REVIEWS_ON);
    assert.equal(afterCls.editorial, "clean");
    assert.equal(afterCls.needsAttention, false);
    assert.equal(afterCls.cardTone, "green");

    const beforeCards = CLEAN.statements.map((row) => row.qcCard);
    const afterCards = [];
    for (let i = 0; i < 15; i++) afterCards.push(await replayCard(CLEAN, i));
    const beforeSum = summariseReview(beforeCards, REVIEWS_ON);
    const afterSum = summariseReview(afterCards, REVIEWS_ON);
    assert.equal(beforeSum.editorial.concerns, 3);
    assert.equal(afterSum.editorial.concerns, 1);
    assert.equal(afterSum.needsAttention < beforeSum.needsAttention, true);

    const dropped = applyEditorialSourceAwareness({
      statement: beforeCard.statement,
      concerns: beforeCard.editorialConcerns,
      passages: matchedPassagesFromCard({
        primaryExcerpt: beforeCard.primaryExcerpt,
        supportSpans: beforeCard.supportSpans,
      }),
      editorialVerdict: beforeCard.editorialVerdict,
    });
    assert.equal(dropped.dropped[0].slug, EDITORIAL_PHRASE_IN_SOURCE);
  });

  test("C1 control: fifteen clean statements, no evidence verdict moves beyond B351", async () => {
    const expected = {
      0: "conflict",
      1: "supported_partial",
      2: "supported_full",
      3: "supported_full",
      4: "supported_full",
      5: "supported_full",
      6: "supported_full",
      7: "supported_full",
      8: "supported_full",
      9: "supported_full",
      10: "not reviewed",
      11: "supported_full",
      12: "supported_full",
      13: "supported_full",
      14: "supported_full",
    };
    const changes = [];
    for (let i = 0; i < 15; i++) {
      const before = cardAt(CLEAN, i);
      const after = await replayCard(CLEAN, i);
      assert.equal(after.displayVerdict, expected[i], `S${i} displayVerdict`);
      const beforeCodes = codes(before).slice().sort().join(",");
      const afterCodes = codes(after).slice().sort().join(",");
      if (before.displayVerdict !== after.displayVerdict || beforeCodes !== afterCodes) {
        changes.push({
          i,
          verdictBefore: before.displayVerdict,
          verdictAfter: after.displayVerdict,
          concernsBefore: beforeCodes,
          concernsAfter: afterCodes,
        });
      }
    }
    const concernMoves = changes.filter((c) => c.concernsBefore !== c.concernsAfter);
    assert.equal(concernMoves.length, 2);
    assert.equal(concernMoves[0].i, 3);
    assert.equal(concernMoves[1].i, 12);
  });

  test("C2 B351 corrected cards, catches, pence-to-pounds, B338 derived rows", async () => {
    const s6 = await replayCard(CLEAN, 6);
    const s7 = await replayCard(CLEAN, 7);
    const s9 = await replayCard(CLEAN, 9);
    const s10 = await replayCard(CLEAN, 10);
    assert.equal(s6.displayVerdict, "supported_full");
    assert.equal(s7.displayVerdict, "supported_full");
    assert.equal(s9.displayVerdict, "supported_full");
    assert.equal(s10.displayVerdict, "not reviewed");
    assert.equal(s10.evidenceNotReviewedReason, NOT_REVIEWED_REASONS.EXCERPT_NOT_LOCATABLE);

    const cleanS0 = await replayCard(CLEAN, 0);
    const cleanS5 = await replayCard(CLEAN, 5);
    assert.equal(cleanS0.displayVerdict, "conflict");
    assert.equal(cleanS5.displayVerdict, "supported_full");
    const docS0 = await replayCard(DOC, 0);
    const docS5 = await replayCard(DOC, 5);
    assert.equal(docS0.displayVerdict, "conflict");
    assert.equal(docS5.displayVerdict, "conflict");

    const s13 = await replayCard(CLEAN, 13);
    assert.equal(s13.displayVerdict, "supported_full");
    assert.match(s13.evidenceSummary, /GBP 0\.365/);

    const derived = (DOC_ACTIONS.entries || []).filter((e) => e.provenance === "derived");
    assert.equal(derived.length >= 2, true);
    const ids = derived.map((e) => e.id);
    assert.equal(ids.some((id) => String(id).startsWith("S0:")), true);
    assert.equal(ids.some((id) => String(id).startsWith("S5:")), true);
  });

  test("0A-2 print fixture: S3 S8 S12 flagged span vs matched passages", () => {
    const s3 = printPart0(3);
    assert.equal(s3.flagged.some((t) => /record year/i.test(t)), true);
    assert.equal(s3.passages.some((p) => /record year/i.test(p)), true);
    const s8 = printPart0(8);
    assert.equal(s8.flagged.some((t) => /significant/i.test(t)), true);
    assert.equal(s8.passages.every((p) => !/\bsignificant\b/i.test(p)), true);
    const s12 = printPart0(12);
    assert.equal(s12.flagged.some((t) => /driven primarily/i.test(t)), true);
    assert.equal(s12.passages.some((p) => /driven primarily by/i.test(p)), true);
  });
});
