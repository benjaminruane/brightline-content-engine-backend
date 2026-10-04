/**
 * B369. Recovered October S10 card, and a sweep of both fixture sets
 * for quote-without-comment fills. Deterministic. No model calls.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { claimAnchors } from "../../../lib/qc/excerpt-sentences.mjs";
import { extractVerifiableAnchors } from "../../../lib/qc/claim-spans.mjs";
import { assembleCard } from "../../../lib/qc/pipeline-v3/stage7-assemble-card.mjs";
import { selectExcerpts } from "../../../lib/qc/pipeline-v4/stage4-select-excerpts.mjs";
import { namedClaimTermsInPassages } from "../../../lib/qc/commentary-inventory.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SEPT_DIR = path.join(ROOT, "tests/fixtures/real-runs-2026-09-29");
const OCT_DIR = path.join(ROOT, "tests/fixtures/real-runs-2026-10-02");
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "card-display.json");

function loadJson(dir, name) {
  return JSON.parse(readFileSync(path.join(dir, name), "utf8"));
}

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

async function replayCard(payload, index, flags = {}) {
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
      reviewOptions: REVIEWS_ON,
      skipEditorialDuplicationJudge: true,
      framingFidelityJudge: silentFramingJudge,
      today: new Date("2026-10-02T00:00:00.000Z"),
    }
  );
}

function cardFace(card) {
  return {
    statement: card.statement || "",
    displayVerdict: card.displayVerdict,
    supportState: card.supportState,
    concernLevel: card.concernLevel,
    commentaryNotReviewed: card.commentaryNotReviewed === true,
    quote: excerptText(card),
    conflictQuote: conflictText(card) || null,
    evidenceSummary: card.evidenceSummary || "",
  };
}

async function sweep(name, payload, flagsByIndex = {}) {
  const fills = [];
  const emptyQuote = [];
  for (let i = 0; i < payload.statements.length; i++) {
    const flags = flagsByIndex[i] || {};
    const card = await replayCard(payload, i, flags);
    const quote = excerptText(card).trim() || conflictText(card).trim();
    const comment = String(card.evidenceSummary || "").trim();
    if (quote && !comment) emptyQuote.push(i);
    fills.push({
      index: i,
      quoteChars: excerptText(card).length,
      commentChars: comment.length,
      displayVerdict: card.displayVerdict,
    });
  }
  return { name, emptyQuote, fills };
}

const SEPT_CLEAN = loadJson(SEPT_DIR, "clean-review.json");
const SEPT_DOC = loadJson(SEPT_DIR, "doc-review.json");
const OCT_DOC = loadJson(OCT_DIR, "doc-review.json");

const fillLogs = [];
const origInfo = console.info;
console.info = (...args) => {
  const line = String(args[0] || "");
  if (line.includes("[stage7] quote-without-comment")) fillLogs.push(line);
  origInfo(...args);
};

const s10 = await replayCard(OCT_DOC, 10, { emptyConfirmationRefused: true });
const septClean = await sweep("sept-clean-review.json", SEPT_CLEAN);
const septDoc = await sweep("sept-doc-review.json", SEPT_DOC);
const octDoc = await sweep("oct-doc-review.json", OCT_DOC);
const octDocInjected = await sweep("oct-doc-review.json+S10-flag", OCT_DOC, {
  10: { emptyConfirmationRefused: true },
});

console.info = origInfo;

const statement = OCT_DOC.statements[10].qcCard.statement;
const out = {
  s10Recovered: cardFace(s10),
  anchors: {
    extractVerifiableAnchors: extractVerifiableAnchors(statement).map((a) => a.text),
    claimAnchors: claimAnchors(statement),
    namedInQuote: namedClaimTermsInPassages(statement, [excerptText(s10)]),
  },
  fillLogs,
  sweeps: {
    septClean: { emptyQuote: septClean.emptyQuote },
    septDoc: { emptyQuote: septDoc.emptyQuote },
    octDoc: { emptyQuote: octDoc.emptyQuote },
    octDocInjected: { emptyQuote: octDocInjected.emptyQuote },
  },
};

writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(`wrote ${OUT}`);
console.log("S10 verdict", s10.displayVerdict, "comment", JSON.stringify(s10.evidenceSummary));
console.log("fillLogs", fillLogs);
console.log("emptyQuote sweeps", out.sweeps);
