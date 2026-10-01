/**
 * B358 Part 1. The shown quote is the part of the held passage that bears
 * on the statement. Strings from tests/fixtures/real-runs-2026-09-29/.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";

import { assembleCard } from "../lib/qc/pipeline-v3/stage7-assemble-card.mjs";
import { selectExcerpts, trimExcerptTo300 } from "../lib/qc/pipeline-v4/stage4-select-excerpts.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_DIR = path.join(ROOT, "tests/fixtures/real-runs-2026-09-29");
const CLEAN = JSON.parse(readFileSync(path.join(FIXTURE_DIR, "clean-review.json"), "utf8"));
const DOC = JSON.parse(readFileSync(path.join(FIXTURE_DIR, "doc-review.json"), "utf8"));

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

function excerptText(card) {
  const p = card.primaryExcerpt;
  if (p == null) return null;
  if (typeof p === "string") return p;
  if (typeof p.passage === "string") return p.passage;
  return null;
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
  const card = payload.statements[index].qcCard;
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

describe("B358 excerpt window shows the relevant part", () => {
  test("stake sentence: shown quote contains redeployed to acquire a and 62.3%", async () => {
    const span = CLEAN.statements[9].qcCard.supportSpans[1].passage;
    assert.match(span, /redeployed to acquire a/);
    assert.match(span, /62\.3%/);
    const statement = CLEAN.statements[9].text;
    const trimmed = trimExcerptTo300(span, statement);
    assert.match(trimmed, /redeployed to acquire a/);
    assert.match(trimmed, /62\.3%/);
    assert.equal(/In October 2025, Action successfully completed two financing transactions\.\s*$/.test(trimmed), false);
    const card = await replayCard(CLEAN, 9);
    const shown = excerptText(card);
    assert.match(shown, /redeployed to acquire a/);
    assert.match(shown, /62\.3%/);
  });

  test("October transactions sentence: shown quote contains the capital restructuring", async () => {
    const span = CLEAN.statements[6].qcCard.supportSpans[0].passage;
    const statement = CLEAN.statements[6].text;
    assert.equal(span.length, 363);
    const trimmed = trimExcerptTo300(span, statement);
    assert.match(trimmed, /capital restructuring/);
    const card = await replayCard(CLEAN, 6);
    assert.match(excerptText(card), /capital restructuring/);
    const s8 = await replayCard(CLEAN, 8);
    assert.match(excerptText(s8), /capital restructuring/);
  });

  test("net sales sentence: shown quote contains 6.3%", async () => {
    const span = CLEAN.statements[5].qcCard.supportSpans[0].passage;
    const statement = CLEAN.statements[5].text;
    assert.equal(span.length, 305);
    const recorded = excerptText(CLEAN.statements[5].qcCard);
    assert.equal(/6\.3%/.test(recorded), false);
    const trimmed = trimExcerptTo300(span, statement);
    assert.match(trimmed, /6\.3%/);
    const card = await replayCard(CLEAN, 5);
    assert.match(excerptText(card), /6\.3%/);
    const doc = await replayCard(DOC, 5);
    assert.match(excerptText(doc), /6\.3%/);
  });

  test("a passage shorter than the budget is byte-identical to today", () => {
    const span = CLEAN.statements[2].qcCard.supportSpans[0].passage;
    assert.equal(span.length <= 300, true);
    assert.equal(trimExcerptTo300(span, CLEAN.statements[2].text), span.trim());
    assert.equal(trimExcerptTo300(span), span.trim());
  });

  test("a passage with no relevant part falls back to today's behaviour", () => {
    const span = CLEAN.statements[8].qcCard.supportSpans[0].passage;
    const unrelated = "The weather in Reykjavik stayed mild.";
    const withStatement = trimExcerptTo300(span, unrelated);
    const leading = trimExcerptTo300(span);
    assert.equal(withStatement, leading);
  });

  test("no quote is ever cut inside a figure such as 2.2%", () => {
    const span = CLEAN.statements[9].qcCard.supportSpans[1].passage;
    const trimmed = trimExcerptTo300(span, CLEAN.statements[9].text);
    assert.equal(/2\.\s*2%/.test(trimmed.replace(/2\.2%/g, "")), false);
    assert.equal(trimmed.includes("2. 2%"), false);
    assert.equal(trimmed.includes("6. 3%"), false);
    const sales = trimExcerptTo300(
      CLEAN.statements[5].qcCard.supportSpans[0].passage,
      CLEAN.statements[5].text
    );
    assert.equal(sales.includes("6.3%"), true);
    assert.equal(sales.endsWith("6."), false);
    assert.equal(sales.endsWith("6...."), false);
  });
});
