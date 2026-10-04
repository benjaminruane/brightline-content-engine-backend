/**
 * B372. Dump cards in the four payloads whose verdict, comment or quotes
 * change under this spec. Deterministic replay. No model calls.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyEditorialSourceAwareness,
  matchedPassagesFromCard,
} from "../../../lib/qc/editorial-source-awareness.mjs";
import { appendDateSubjectSpans } from "../../../lib/qc/date-subject.mjs";
import { demoteConfirmedClassifications } from "../../../lib/qc/pipeline-v4/confirming-passage-disagrees.mjs";
import { assembleCard } from "../../../lib/qc/pipeline-v3/stage7-assemble-card.mjs";
import { selectExcerpts } from "../../../lib/qc/pipeline-v4/stage4-select-excerpts.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const OUT_DIR = path.join(ROOT, "scripts/diagnostic/b372");

const PAYLOADS = [
  ["hicl-clean", "tests/fixtures/real-runs-2026-10-04-hicl/clean-review.json"],
  ["hicl-doc", "tests/fixtures/real-runs-2026-10-04-hicl/doc-review.json"],
  ["sept-clean", "tests/fixtures/real-runs-2026-09-29/clean-review.json"],
  ["sept-doc", "tests/fixtures/real-runs-2026-09-29/doc-review.json"],
];

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

function load(rel) {
  return JSON.parse(readFileSync(path.join(ROOT, rel), "utf8"));
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
  if (fps.length === 0) return [];
  return fps.map((fp) => ({
    sourceIndex: Number.isFinite(fp.sourceIndex) ? fp.sourceIndex : 0,
    sourceLabel: fp.sourceLabel || label,
    classification: fp.classification,
    passage: pointer?.passage || "",
  }));
}

function quoteOf(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  return typeof value.passage === "string" ? value.passage : "";
}

function face(card) {
  return {
    displayVerdict: card.displayVerdict,
    concernLevel: card.concernLevel,
    editorialVerdict: card.editorialVerdict,
    codes: (card.editorialConcerns || []).map((c) => c.concernCode || c.code || "").filter(Boolean),
    evidenceSummary: card.evidenceSummary || "",
    primaryExcerpt: quoteOf(card.primaryExcerpt),
    conflictExcerpt: quoteOf(card.conflictExcerpt),
  };
}

function diffFace(before, after) {
  const keys = [
    "displayVerdict",
    "concernLevel",
    "editorialVerdict",
    "codes",
    "evidenceSummary",
    "primaryExcerpt",
    "conflictExcerpt",
  ];
  const changed = [];
  for (const key of keys) {
    const a = key === "codes" ? before[key].join(",") : before[key];
    const b = key === "codes" ? after[key].join(",") : after[key];
    if (a !== b) changed.push(key);
  }
  return changed;
}

async function replay(payload, index, { draftStatements, applyDate } = {}) {
  const card = payload.statements[index].qcCard;
  const sources = payload.sources;
  const dated = applyDate
    ? demoteConfirmedClassifications({
        statementText: card.statement,
        sourceMatches: matchesFromCard(card, sources),
        supportSpans: appendDateSubjectSpans({
          statementText: card.statement,
          supportSpans: card.supportSpans,
          sources,
        }),
      })
    : { supportSpans: card.supportSpans, sourceMatches: matchesFromCard(card, sources) };
  const addedConflict =
    applyDate &&
    dated.supportSpans.some((s) => s.dateSubjectAdded && s.classification === "conflicting");
  const storedVerdict = supportStateToVerdict(card.supportState);
  const verdict = addedConflict ? "conflicting" : storedVerdict;
  const hasConflict = verdict === "conflicting" || card.hasConflict === true;
  const excerpts = selectExcerpts({
    statementMatches: dated.sourceMatches,
    verdict,
    hasConflict,
    supportSpans: dated.supportSpans,
    sources,
    statementText: card.statement,
  });
  return assembleCard(
    {
      statementText: card.statement,
      startChar: card.charStart,
      endChar: card.charEnd,
      supportSpans: dated.supportSpans,
      sourceMatches: dated.sourceMatches,
      verdictResult: {
        verdict,
        hasConflict,
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
      draftStatements: draftStatements || payload.statements.map((s) => s.qcCard.statement),
      reviewOptions: REVIEWS_ON,
      skipEditorialDuplicationJudge: true,
      framingFidelityJudge: silentFramingJudge,
      today: new Date("2026-10-04T00:00:00.000Z"),
    }
  );
}

function editorialDelta(payload, index) {
  const card = payload.statements[index].qcCard;
  const after = applyEditorialSourceAwareness({
    statement: card.statement,
    concerns: Array.isArray(card.editorialConcerns) ? card.editorialConcerns : [],
    passages: matchedPassagesFromCard({
      primaryExcerpt: card.primaryExcerpt,
      supportSpans: card.supportSpans,
    }),
    editorialVerdict: card.editorialVerdict,
  });
  const beforeCodes = (card.editorialConcerns || []).map((c) => c.concernCode || c.code || "");
  const afterCodes = (after.concerns || []).map((c) => c.concernCode || c.code || "");
  if (beforeCodes.join() === afterCodes.join() && card.editorialVerdict === after.editorialVerdict) {
    return null;
  }
  return {
    beforeCodes,
    afterCodes,
    beforeEditorialVerdict: card.editorialVerdict,
    afterEditorialVerdict: after.editorialVerdict,
    dropped: after.dropped,
  };
}

const rows = [];
for (const [label, rel] of PAYLOADS) {
  const payload = load(rel);
  const draftStatements = payload.statements.map((s) => s.qcCard.statement);
  for (let i = 0; i < payload.statements.length; i += 1) {
    const stored = payload.statements[i].qcCard;
    const editorial = editorialDelta(payload, i);
    const off = await replay(payload, i, { draftStatements: [] });
    const on = await replay(payload, i, { draftStatements, applyDate: true });
    const companyChanged = diffFace(face(off), face(on));
    const dateSpansBefore = (stored.supportSpans || []).map((s) => `${s.classification}|${s.passage}`);
    const dated = demoteConfirmedClassifications({
      statementText: stored.statement,
      sourceMatches: matchesFromCard(stored, payload.sources),
      supportSpans: appendDateSubjectSpans({
        statementText: stored.statement,
        supportSpans: stored.supportSpans,
        sources: payload.sources,
      }),
    });
    const dateSpansAfter = dated.supportSpans.map((s) => `${s.classification}|${s.passage}`);
    const dateChanged = dateSpansBefore.join("\n") !== dateSpansAfter.join("\n");
    if (!editorial && companyChanged.length === 0 && !dateChanged) continue;
    rows.push({
      payload: label,
      statementIndex: i,
      statement: stored.statement,
      editorial,
      companyAndDateFields: companyChanged,
      dateSpansChanged: dateChanged,
      before: face(off),
      after: face(on),
    });
  }
}

mkdirSync(OUT_DIR, { recursive: true });
const outPath = path.join(OUT_DIR, "changed-cards.json");
writeFileSync(outPath, `${JSON.stringify({ generated: "B372 dump", rows }, null, 2)}\n`);
console.log(`wrote ${rows.length} changed cards to ${outPath}`);
for (const row of rows) {
  console.log(
    row.payload,
    `S${row.statementIndex}`,
    "editorial",
    Boolean(row.editorial),
    "fields",
    row.companyAndDateFields.join(",") || "-",
    "dateSpans",
    row.dateSpansChanged
  );
}
