/**
 * B369. A card that shows a quote says something. Deterministic fill
 * when the comment is empty and a quote is present. Live must-passes
 * against tests/fixtures/real-runs-2026-10-02/. September 29 is the
 * older shape, swept the same way.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test, vi } from "vitest";

import {
  fillQuoteWithoutComment,
  namedClaimTermsInPassages,
  QUOTE_WITHOUT_COMMENT_FALLBACK,
} from "../lib/qc/commentary-inventory.mjs";
import { claimAnchors } from "../lib/qc/excerpt-sentences.mjs";
import { extractVerifiableAnchors } from "../lib/qc/claim-spans.mjs";
import { assembleCard } from "../lib/qc/pipeline-v3/stage7-assemble-card.mjs";
import { selectExcerpts } from "../lib/qc/pipeline-v4/stage4-select-excerpts.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SEPT_DIR = path.join(ROOT, "tests/fixtures/real-runs-2026-09-29");
const OCT_DIR = path.join(ROOT, "tests/fixtures/real-runs-2026-10-02");
const SEPT_CLEAN = JSON.parse(readFileSync(path.join(SEPT_DIR, "clean-review.json"), "utf8"));
const SEPT_DOC = JSON.parse(readFileSync(path.join(SEPT_DIR, "doc-review.json"), "utf8"));
const OCT_DOC = JSON.parse(readFileSync(path.join(OCT_DIR, "doc-review.json"), "utf8"));

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

const S10_NAMED_COMMENT =
  "3.2x and 2.8x match the source. The phrases 'MPM' and 'MAIT' match the source.";

function excerptText(card) {
  const p = card.primaryExcerpt;
  if (p == null) return "";
  if (typeof p === "string") return p;
  if (typeof p.passage === "string") return p.passage;
  return "";
}

function conflictText(card) {
  const p = card.conflictExcerpt;
  if (p && typeof p.passage === "string" && p.passage.trim()) return p.passage;
  return "";
}

function hasShownQuote(card) {
  return excerptText(card).trim().length > 0 || conflictText(card).trim().length > 0;
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

function matchesFromCard(card, sources, flags = {}) {
  const label = sources[0]?.label || sources[0]?.name || "";
  const fps = Array.isArray(card.stage2SourceFingerprints) ? card.stage2SourceFingerprints : [];
  const pointer = excerptPointer(card, sources);
  if (fps.length === 0) return [];
  return fps.map((fp) => ({
    sourceIndex: Number.isFinite(fp.sourceIndex) ? fp.sourceIndex : 0,
    sourceLabel: fp.sourceLabel || label,
    classification: fp.classification,
    passage: pointer?.passage || "",
    emptyConfirmationRefused: flags.emptyConfirmationRefused === true,
    matchNotReviewed: flags.matchNotReviewed === true,
  }));
}

async function replayCard(payload, index, flags = {}, reviewOptions = REVIEWS_ON) {
  const card = payload.statements[index].qcCard;
  const sources = payload.sources;
  const verdict = supportStateToVerdict(card.supportState);
  const sourceMatches = matchesFromCard(card, sources, flags);
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
      reviewOptions,
      skipEditorialDuplicationJudge: true,
      framingFidelityJudge: silentFramingJudge,
      today: new Date("2026-10-02T00:00:00.000Z"),
    }
  );
}

async function sweepPayload(payload, flagsByIndex = {}) {
  const emptyQuote = [];
  const fills = [];
  for (let i = 0; i < payload.statements.length; i++) {
    const flags = flagsByIndex[i] || {};
    const card = await replayCard(payload, i, flags);
    const comment = String(card.evidenceSummary || "").trim();
    if (hasShownQuote(card) && !comment) {
      emptyQuote.push(i);
    }
    fills.push({ index: i, card });
  }
  return { emptyQuote, fills };
}

describe("B369 quote without comment", () => {
  test("extractVerifiableAnchors still does not take 3.2x; claimAnchors does", () => {
    const statement = OCT_DOC.statements[10].qcCard.statement;
    assert.deepEqual(
      extractVerifiableAnchors(statement).map((a) => a.text),
      ["3", "2"]
    );
    assert.deepEqual(claimAnchors(statement), ["3.2x", "2.8x", "MPM", "MAIT"]);
  });

  test("namedClaimTermsInPassages names the recovered S10 terms", () => {
    const statement = OCT_DOC.statements[10].qcCard.statement;
    const passage =
      "Our Private Equity team completed the realisation of MPM and signed the realisation of MAIT in the period. The sales achieved sterling money multiples of 3.2x and 2.8x respectively.";
    assert.deepEqual(namedClaimTermsInPassages(statement, [passage]), [
      "3.2x",
      "2.8x",
      "MPM",
      "MAIT",
    ]);
  });

  test("fillQuoteWithoutComment names terms on a green card and leaves a written comment alone", () => {
    const statement = OCT_DOC.statements[10].qcCard.statement;
    const passage =
      "Our Private Equity team completed the realisation of MPM and signed the realisation of MAIT in the period. The sales achieved sterling money multiples of 3.2x and 2.8x respectively.";
    const filled = fillQuoteWithoutComment({
      commentary: "",
      statement,
      passages: [passage],
      allowMatchSentences: true,
    });
    assert.equal(filled.filled, true);
    assert.equal(filled.fallback, false);
    assert.equal(filled.commentary, S10_NAMED_COMMENT);
    const kept = fillQuoteWithoutComment({
      commentary: "The source confirms the sale.",
      statement,
      passages: [passage],
      allowMatchSentences: true,
    });
    assert.equal(kept.filled, false);
    assert.equal(kept.commentary, "The source confirms the sale.");
  });

  test("no quote and no comment stays empty; a quote with no named term uses the fallback", () => {
    const none = fillQuoteWithoutComment({
      commentary: "",
      statement: "Revenue grew 12% year on year.",
      passages: [],
      allowMatchSentences: true,
    });
    assert.equal(none.filled, false);
    assert.equal(none.commentary, "");
    const fallback = fillQuoteWithoutComment({
      commentary: "",
      statement: "Revenue grew 12% year on year.",
      passages: ["The board met in London during the period."],
      allowMatchSentences: true,
    });
    assert.equal(fallback.filled, true);
    assert.equal(fallback.fallback, true);
    assert.equal(fallback.commentary, QUOTE_WITHOUT_COMMENT_FALLBACK);
    const nonGreen = fillQuoteWithoutComment({
      commentary: "",
      statement: OCT_DOC.statements[10].qcCard.statement,
      passages: [
        "Our Private Equity team completed the realisation of MPM and signed the realisation of MAIT in the period. The sales achieved sterling money multiples of 3.2x and 2.8x respectively.",
      ],
      allowMatchSentences: false,
    });
    assert.equal(nonGreen.commentary, QUOTE_WITHOUT_COMMENT_FALLBACK);
    assert.equal(/matches the source/.test(nonGreen.commentary), false);
  });

  test("October S10 with the empty-confirmation flag is Confirmed with quote and named comment", async () => {
    const logs = [];
    const spy = vi.spyOn(console, "info").mockImplementation((...args) => {
      logs.push(String(args[0] || ""));
    });
    const s10 = await replayCard(OCT_DOC, 10, { emptyConfirmationRefused: true });
    spy.mockRestore();
    const quote = excerptText(s10);
    assert.match(quote, /MPM/);
    assert.match(quote, /MAIT/);
    assert.match(quote, /3\.2x/);
    assert.match(quote, /2\.8x/);
    assert.equal(s10.supportState, "supported");
    assert.equal(s10.displayVerdict, "supported_full");
    assert.equal(s10.evidenceSummary, S10_NAMED_COMMENT);
    assert.equal(/no source addresses/i.test(s10.evidenceSummary), false);
    assert.equal(s10.commentaryNotReviewed, false);
    const fillLog = logs.find((line) => line.includes("[stage7] quote-without-comment"));
    assert.match(fillLog, /statementIndex=10/);
    assert.match(fillLog, /route=empty_confirmation_cleared/);
    assert.match(fillLog, /named=4/);
    assert.match(fillLog, /fallback=false/);
  }, 20000);

  test("no card in either fixture set ends with a quote and an empty comment", async () => {
    const septClean = await sweepPayload(SEPT_CLEAN);
    const septDoc = await sweepPayload(SEPT_DOC);
    const octDoc = await sweepPayload(OCT_DOC);
    const octS10 = await sweepPayload(OCT_DOC, { 10: { emptyConfirmationRefused: true } });
    assert.deepEqual(septClean.emptyQuote, []);
    assert.deepEqual(septDoc.emptyQuote, []);
    assert.deepEqual(octDoc.emptyQuote, []);
    assert.deepEqual(octS10.emptyQuote, []);
  }, 60000);

  test("a card with no quote and no comment is unchanged", async () => {
    const card = await assembleCard(
      {
        statementText: "Revenue grew 12% year on year.",
        startChar: 0,
        endChar: 30,
        sourceMatches: [{ sourceIndex: 0, classification: "no_support", sourceLabel: "memo" }],
        verdictResult: {
          verdict: "not_supported",
          hasConflict: false,
          confirmingMatches: [],
          contributingSourceIndices: [],
        },
        excerptResult: { primaryExcerpt: null, conflictExcerpt: null },
        commentaryResult: { commentary: "", schemaValid: false, notReviewed: true },
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
        skipEditorialDuplicationJudge: true,
        reviewOptions: REVIEWS_ON,
        framingFidelityJudge: silentFramingJudge,
      }
    );
    assert.equal(excerptText(card).trim(), "");
    assert.equal(card.evidenceSummary, "");
    assert.equal(card.commentaryNotReviewed, true);
    assert.equal(card.displayVerdict, "not_supported");
  });
});
