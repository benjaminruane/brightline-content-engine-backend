/**
 * B358. Recorded vs replayed display for both fixture payloads.
 * Deterministic. No model calls.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assembleCard } from "../../../lib/qc/pipeline-v3/stage7-assemble-card.mjs";
import { selectExcerpts } from "../../../lib/qc/pipeline-v4/stage4-select-excerpts.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const FIXTURE_DIR = path.join(ROOT, "tests/fixtures/real-runs-2026-09-29");
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "card-display.json");

function loadJson(name) {
  return JSON.parse(readFileSync(path.join(FIXTURE_DIR, name), "utf8"));
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

function editorialNotes(card) {
  return (Array.isArray(card.editorialConcerns) ? card.editorialConcerns : []).map((c) => ({
    code: c.concernCode || c.code || null,
    note: c.note || c.concernText || "",
    suggestedDirection: c.suggestedDirection || "",
  }));
}

function snapshot(card) {
  return {
    statement: card.statement,
    displayVerdict: card.displayVerdict,
    concernLevel: card.concernLevel,
    supportState: card.supportState,
    hasConflict: card.hasConflict === true,
    displayVerdictReason: card.displayVerdictReason || null,
    evidenceNotReviewedReason: card.evidenceNotReviewedReason || null,
    quote: excerptText(card),
    quoteChars: excerptText(card)?.length ?? 0,
    evidenceSummary: card.evidenceSummary || "",
    editorial: editorialNotes(card),
  };
}

function changed(before, after) {
  return (
    before.displayVerdict !== after.displayVerdict ||
    before.concernLevel !== after.concernLevel ||
    before.quote !== after.quote ||
    before.evidenceSummary !== after.evidenceSummary ||
    JSON.stringify(before.editorial) !== JSON.stringify(after.editorial) ||
    before.displayVerdictReason !== after.displayVerdictReason
  );
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

const CLEAN = loadJson("clean-review.json");
const DOC = loadJson("doc-review.json");
const clean = await dumpPayload("clean-review.json", CLEAN);
const doc = await dumpPayload("doc-review.json", DOC);
const out = { clean, doc };
writeFileSync(OUT, JSON.stringify(out, null, 2));
const moved = [...clean.rows, ...doc.rows].filter((r) => r.moved);
console.log(`wrote ${OUT}`);
console.log(`moved ${moved.length} cards`);
for (const r of clean.rows.filter((x) => x.moved)) {
  console.log(`CLEAN S${r.index} quote ${r.before.quoteChars}->${r.after.quoteChars} verdict ${r.before.displayVerdict}->${r.after.displayVerdict} colour ${r.before.concernLevel}->${r.after.concernLevel}`);
}
for (const r of doc.rows.filter((x) => x.moved)) {
  console.log(`DOC S${r.index} quote ${r.before.quoteChars}->${r.after.quoteChars} verdict ${r.before.displayVerdict}->${r.after.displayVerdict} colour ${r.before.concernLevel}->${r.after.concernLevel}`);
}
