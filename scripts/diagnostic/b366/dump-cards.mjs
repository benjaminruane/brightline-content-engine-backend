/**
 * B366. Recorded vs replayed display for September and October fixture
 * payloads. Deterministic. No model calls.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assembleCard } from "../../../lib/qc/pipeline-v3/stage7-assemble-card.mjs";
import { selectExcerpts } from "../../../lib/qc/pipeline-v4/stage4-select-excerpts.mjs";
import { buildClaimInventory } from "../../../lib/qc/commentary-inventory.mjs";
import { extractScaleCauseClaims } from "../../../lib/qc/scale-cause.mjs";

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
  if (p == null) return null;
  if (typeof p === "string") return p;
  if (typeof p.passage === "string") return p.passage;
  return null;
}

function conflictText(card) {
  const p = card.conflictExcerpt;
  if (p && typeof p.passage === "string" && p.passage.trim()) return p.passage;
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
    emptyConfirmationRefused: flags.emptyConfirmationRefused === true || fp.emptyConfirmationRefused === true,
    matchNotReviewed: flags.matchNotReviewed === true || fp.matchNotReviewed === true,
  }));
}

function editorialNotes(card) {
  return (Array.isArray(card.editorialConcerns) ? card.editorialConcerns : []).map((c) => ({
    code: c.concernCode || c.code || null,
    note: c.note || c.concernText || "",
    suggestedDirection: c.suggestedDirection || "",
  }));
}

function snapshot(card) {
  const statement = card.statement || "";
  return {
    statement,
    displayVerdict: card.displayVerdict,
    concernLevel: card.concernLevel,
    supportState: card.supportState,
    hasConflict: card.hasConflict === true,
    displayVerdictReason: card.displayVerdictReason || null,
    evidenceNotReviewedReason: card.evidenceNotReviewedReason || null,
    conflictExcerptEmptyReason: card.conflictExcerptEmptyReason || null,
    quote: excerptText(card),
    quoteChars: excerptText(card)?.length ?? 0,
    conflictQuote: conflictText(card),
    conflictQuoteChars: conflictText(card)?.length ?? 0,
    evidenceSummary: card.evidenceSummary || "",
    editorial: editorialNotes(card),
    lexicon: extractScaleCauseClaims(statement),
    inventory: buildClaimInventory(statement),
  };
}

function changed(before, after) {
  return (
    before.displayVerdict !== after.displayVerdict ||
    before.concernLevel !== after.concernLevel ||
    before.quote !== after.quote ||
    before.conflictQuote !== after.conflictQuote ||
    before.evidenceSummary !== after.evidenceSummary ||
    JSON.stringify(before.editorial) !== JSON.stringify(after.editorial) ||
    before.displayVerdictReason !== after.displayVerdictReason ||
    before.conflictExcerptEmptyReason !== after.conflictExcerptEmptyReason ||
    before.supportState !== after.supportState
  );
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

async function dumpPayload(name, payload) {
  const rows = [];
  for (let i = 0; i < payload.statements.length; i++) {
    const before = snapshot(payload.statements[i].qcCard);
    const afterCard = await replayCard(payload, i);
    const after = snapshot(afterCard);
    rows.push({ index: i, moved: changed(before, after), before, after });
  }
  return { name, rows };
}

function logMoved(tag, rows) {
  for (const r of rows.filter((x) => x.moved)) {
    console.log(
      `${tag} S${r.index} quote ${r.before.quoteChars}->${r.after.quoteChars} conflict ${r.before.conflictQuoteChars}->${r.after.conflictQuoteChars} verdict ${r.before.displayVerdict}->${r.after.displayVerdict} reason ${r.after.displayVerdictReason || ""} state ${r.before.supportState}->${r.after.supportState}`
    );
  }
}

const SEPT_CLEAN = loadJson(SEPT_DIR, "clean-review.json");
const SEPT_DOC = loadJson(SEPT_DIR, "doc-review.json");
const OCT_DOC = loadJson(OCT_DIR, "doc-review.json");
const septClean = await dumpPayload("sept-clean-review.json", SEPT_CLEAN);
const septDoc = await dumpPayload("sept-doc-review.json", SEPT_DOC);
const octDoc = await dumpPayload("oct-doc-review.json", OCT_DOC);

const octS10Recorded = snapshot(OCT_DOC.statements[10].qcCard);
const octS10InjectedCard = await replayCard(OCT_DOC, 10, { emptyConfirmationRefused: true });
const octS10Injected = snapshot(octS10InjectedCard);

const out = {
  septClean,
  septDoc,
  octDoc,
  octS10Injected: {
    moved: changed(octS10Recorded, octS10Injected),
    before: octS10Recorded,
    after: octS10Injected,
  },
};
writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(`wrote ${OUT}`);
logMoved("SEPT CLEAN", septClean.rows);
logMoved("SEPT DOC", septDoc.rows);
logMoved("OCT DOC", octDoc.rows);
console.log(
  `OCT S10 injected flag quote ${octS10Recorded.quoteChars}->${octS10Injected.quoteChars} verdict ${octS10Recorded.displayVerdict}->${octS10Injected.displayVerdict} state ${octS10Recorded.supportState}->${octS10Injected.supportState}`
);
