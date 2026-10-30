/**
 * B451. No model call.
 *   node scripts/diagnostic/b451/scan.mjs
 *
 * Counts the census's ten on scripts/diagnostic/b446/pass-1.json.
 * The file is the compact card. reasoningParagraph is restored from
 * evidenceSummary, because assembly stores that same string and the
 * compact row dropped the field. Unsupported spans are restored as
 * { text }, because the compact row kept the phrase and dropped the object.
 * Fact status is not on the file. The attention line is counted without it.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evidenceFindingForExport, EVIDENCE_FINDING_NOT_RECORDED } from "../../../lib/qc/export-review-data.mjs";
import { PARTIAL_LABEL, PARTIAL_UNRECORDED, partialSentence } from "../../../lib/qc/partial-sentence.mjs";
import { shownLabel, shownState } from "../../../lib/qc/shown-verdict.mjs";
import { summariseReview } from "../../../lib/qc/review-summary.mjs";
import { isGenericCompanySubject } from "../../../lib/qc/generic-company.mjs";
import { attentionHeader } from "../../../../brightline-content-engine-frontend/src/modules/reading/attentionHeader.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PASS = path.join(__dirname, "../b446/pass-1.json");
const CAUSAL = "overreach_unsupported_causal";
const DROP_IDS = new Set([
  "fidelity",
  "style_backstop",
  "no_op",
  "no_change",
  "evidence_language",
  "narrative_coherence",
  "linkedin_credit_line",
  "source_awareness",
  "forward_looking",
  "duplicate_merge",
]);
const UNAVAILABLE = /Specific commentary is unavailable from the system/;

function liveShape(card) {
  const spans = Array.isArray(card.unsupportedSpans) ? card.unsupportedSpans : [];
  return {
    ...card,
    reasoningParagraph: typeof card.evidenceSummary === "string" && card.evidenceSummary.trim()
      ? card.evidenceSummary
      : null,
    commentaryNotReviewed: typeof card.commentaryNotReviewedReason === "string" && card.commentaryNotReviewedReason.trim()
      ? true
      : card.commentaryNotReviewed === true,
    unsupportedSpans: spans.map((span) => (typeof span === "string" ? { text: span } : span)),
  };
}

function silenceIds(card) {
  return (Array.isArray(card.silences) ? card.silences : [])
    .map((row) => (typeof row?.id === "string" ? row.id : ""))
    .filter(Boolean);
}

function concernCodes(card) {
  const rows = [
    ...(Array.isArray(card.editorialConcerns) ? card.editorialConcerns : []),
    ...(Array.isArray(card.complianceConcerns) ? card.complianceConcerns : []),
  ];
  return rows.map((row) => String(row?.concernCode || row?.rule || "")).filter(Boolean);
}

function isPartial(card) {
  if (card.supportState === "partial" || card.displayVerdict === "supported_partial") return true;
  if (card.sentenceState === "partial" || shownState(card) === "partial") return true;
  return false;
}

function partialClassExplanations(card) {
  return (Array.isArray(card.matchExplanations) ? card.matchExplanations : []).filter((row) => {
    if (String(row?.classification || "") !== "partially_confirmed") return false;
    const text = typeof row.explanation === "string" ? row.explanation.trim() : "";
    if (!text || text === "No explanation provided.") return false;
    const written = String(row.writtenFor || "").toLowerCase();
    if (written && written !== "partially_confirmed") return false;
    return true;
  });
}

function bump(map, key) {
  map[key] = (map[key] || 0) + 1;
}

const pass = JSON.parse(readFileSync(PASS, "utf8"));
const cards = Array.isArray(pass.cards) ? pass.cards : null;
if (!cards) throw new Error("b451: pass-1.json has no cards");
if (cards.length !== 261) throw new Error(`b451: expected 261 cards, found ${cards.length}`);

const fixtures = Array.isArray(pass.fixtures) ? pass.fixtures : [];
const byFixture = new Map();
for (const card of cards) {
  const id = String(card.fixtureId || "");
  if (!byFixture.has(id)) byFixture.set(id, []);
  byFixture.get(id).push(card);
}

const silenceHist = {};
const dropAndClean = {};
let noteRefused = 0;
let noteRefusedNothingRaised = 0;
let partialLabelNothing = 0;
let partialCountedConfirmed = 0;
let partialCards = 0;
let partialNoFinding = 0;
let partialUnrecorded = 0;
let partialStage2 = 0;
let partialSpanOnly = 0;
let partialSummaryOnly = 0;
let partialEmptySummary = 0;
let partialUnavailable = 0;
const partialStatements = new Set();
const partialNoReasonStatements = new Set();
let beyondEmpty = 0;
let beyondCausal = 0;
let beyondCausalEmpty = 0;
let causalConcerns = 0;
let causalEditorialClean = 0;
const beyondSamples = [];
let exportVerdictDiffers = 0;
let exportEvidenceDiffers = 0;
let exportNotRecorded = 0;
let exportNotRecordedDespiteProse = 0;
const exportSamples = [];
let writtenForRows = 0;
let writtenForCards = 0;
const writtenForPairs = {};
let noSupportMatches = 0;
let noSupportEmptyExcerpt = 0;
let notSupportedEmptyExcerpt = 0;
let datelineReason = 0;
let genericSubject = 0;
let genericPartial = 0;
let genericFull = 0;
let gapStripped = 0;
let sourceAwareness = 0;
let sourceAwarenessEditorialClean = 0;
let wordingWithheld = 0;
let wordingNothingRaised = 0;
let linkedinSilence = 0;
let mechanicsConcerns = 0;
let mechanicsMultiSpan = 0;

const summary = summariseReview(cards.map(liveShape), {
  evidenceEnabled: true,
  editorialEnabled: true,
  complianceEnabled: true,
});

let beyondStates = 0;
let nothingRaisedStates = 0;

for (const card of cards) {
  const shaped = liveShape(card);
  const state = shownState(shaped);
  const label = card.sentenceLabel || "";
  const ids = silenceIds(card);
  for (const id of ids) bump(silenceHist, id);
  const dropped = ids.filter((id) => DROP_IDS.has(id));
  if (dropped.length && (card.editorialVerdict === "clean" || card.complianceVerdict === "clean")) {
    for (const id of dropped) bump(dropAndClean, id);
  }

  if (ids.includes("note_refused")) {
    noteRefused += 1;
    if (label === "Nothing raised" || state === "nothing_raised") noteRefusedNothingRaised += 1;
  }
  if (ids.includes("gap_sentences_stripped")) gapStripped += 1;
  if (ids.includes("source_awareness")) {
    sourceAwareness += 1;
    if (card.editorialVerdict === "clean") sourceAwarenessEditorialClean += 1;
  }
  if (ids.includes("wording_note_withheld") || card.readingNote?.bucket === "wording" || card.wordingNoteWithheld) {
    wordingWithheld += 1;
    if (label === "Nothing raised" || state === "nothing_raised") wordingNothingRaised += 1;
  }
  if (ids.includes("linkedin_credit_line")) linkedinSilence += 1;

  const codes = concernCodes(card);
  if (codes.includes(CAUSAL)) {
    causalConcerns += 1;
    if (card.editorialVerdict === "clean") causalEditorialClean += 1;
  }
  const mechanics = (Array.isArray(card.editorialConcerns) ? card.editorialConcerns : []).filter((row) =>
    ["percentage_notation", "em_dash", "first_person_plural", "voice_consistency"].includes(row?.concernCode)
  );
  mechanicsConcerns += mechanics.length;
  mechanicsMultiSpan += mechanics.filter((row) => Array.isArray(row.span) && row.span.length > 1).length;

  if (state === "beyond") beyondStates += 1;
  if (state === "nothing_raised" || state === "nothing_to_raise") nothingRaisedStates += 1;

  if (isPartial(card) && (label === "Nothing raised" || state === "nothing_raised")) partialLabelNothing += 1;

  if (label === "Goes beyond the source" || state === "beyond") {
    const prose = typeof card.displayedEvidenceProse === "string" ? card.displayedEvidenceProse.trim() : "";
    const findings = Array.isArray(card.evidenceFindings) ? card.evidenceFindings : [];
    const findingNote = findings.some((row) => typeof row?.note === "string" && row.note.trim());
    if (!prose && !findingNote) {
      beyondEmpty += 1;
      if (codes.includes(CAUSAL)) {
        beyondCausalEmpty += 1;
        if (beyondSamples.length < 5) {
          beyondSamples.push({
            fixtureId: card.fixtureId,
            index: card.index,
            statement: String(card.statement || "").slice(0, 140),
            editorialVerdict: card.editorialVerdict,
            concern: (card.editorialConcerns || []).find((row) => row.concernCode === CAUSAL)?.text?.slice(0, 180) || "",
          });
        }
      }
    }
    if (codes.includes(CAUSAL)) beyondCausal += 1;
  }

  if (isPartial(card)) {
    partialCards += 1;
    const statement = String(card.statement || "").replace(/\s+/g, " ").trim();
    partialStatements.add(statement);
    const explanations = partialClassExplanations(card);
    const sentence = partialSentence(shaped);
    const summaryText = typeof card.evidenceSummary === "string" ? card.evidenceSummary.trim() : "";
    if (!summaryText) partialEmptySummary += 1;
    if (UNAVAILABLE.test(summaryText)) partialUnavailable += 1;
    const spanSentence = sentence.startsWith("Not in the source:") && sentence.includes("was not recorded");
    if (explanations.length) partialStage2 += 1;
    else if (spanSentence) partialSpanOnly += 1;
    else if (summaryText && !UNAVAILABLE.test(summaryText) && sentence === PARTIAL_UNRECORDED) partialSummaryOnly += 1;
    if (!explanations.length && (sentence === PARTIAL_UNRECORDED || !sentence)) {
      partialNoFinding += 1;
      partialUnrecorded += sentence === PARTIAL_UNRECORDED ? 1 : 0;
      partialNoReasonStatements.add(statement);
    }
    const findings = Array.isArray(card.evidenceFindings) ? card.evidenceFindings : [];
    if (!findings.some((row) => row?.rule === "partial")) {
      /* counted below */
    }
  }

  const exportVerdict = shownLabel(shaped);
  const exported = evidenceFindingForExport(shaped, false);
  if (exportVerdict && label && exportVerdict !== label) {
    exportVerdictDiffers += 1;
    if (exportSamples.length < 5) {
      exportSamples.push({ kind: "verdict", fixtureId: card.fixtureId, index: card.index, label, exportVerdict, displayVerdict: card.displayVerdict });
    }
  }
  const prose = typeof card.displayedEvidenceProse === "string" ? card.displayedEvidenceProse.trim() : "";
  if (prose && exported !== prose && state !== "partial") {
    exportEvidenceDiffers += 1;
    if (exportSamples.length < 8) {
      exportSamples.push({ kind: "evidence", fixtureId: card.fixtureId, index: card.index, prose: prose.slice(0, 120), exported: String(exported || "").slice(0, 120) });
    }
  }
  if (exported === EVIDENCE_FINDING_NOT_RECORDED) {
    exportNotRecorded += 1;
    if (prose) exportNotRecordedDespiteProse += 1;
  }

  const matches = Array.isArray(card.matchExplanations) ? card.matchExplanations : [];
  const marked = matches.filter((row) => row?.writtenFor);
  if (marked.length) writtenForCards += 1;
  writtenForRows += marked.length;
  for (const row of marked) {
    const key = `${row.writtenFor} -> ${row.classification}`;
    writtenForPairs[key] = (writtenForPairs[key] || 0) + 1;
  }
  const noSupport = matches.filter((row) => row?.classification === "no_support");
  noSupportMatches += noSupport.length;
  if (noSupport.length && !String(card.primaryExcerpt || "").trim()) noSupportEmptyExcerpt += 1;
  if ((card.displayVerdict === "not_supported" || card.displayVerdict === "no_clear_support") && !String(card.primaryExcerpt || "").trim()) {
    notSupportedEmptyExcerpt += 1;
  }
  if (card.displayVerdictReason === "announcement_dateline") datelineReason += 1;

  if (isGenericCompanySubject(card.statement)) {
    genericSubject += 1;
    if (card.displayVerdict === "supported_partial" || card.sentenceState === "partial") genericPartial += 1;
    if (card.displayVerdict === "supported_full") genericFull += 1;
  }
}

let partialFindingsMissing = 0;
let partialStateUnrecorded = 0;
let partialReasonStored = 0;
for (const card of cards) {
  if (!isPartial(card)) continue;
  const findings = Array.isArray(card.evidenceFindings) ? card.evidenceFindings : [];
  if (!findings.some((row) => row?.rule === "partial")) partialFindingsMissing += 1;
  const ground = card.partialGround;
  const summaryText = typeof card.evidenceSummary === "string" ? card.evidenceSummary.trim() : "";
  const explanations = partialClassExplanations(card);
  const stored = explanations.length > 0
    || (ground?.recorded === true && typeof ground.text === "string" && ground.text.trim() && !UNAVAILABLE.test(ground.text))
    || (summaryText && !UNAVAILABLE.test(summaryText));
  if (stored) partialReasonStored += 1;
  const shaped = liveShape(card);
  if (shownState(shaped) === "partial" && partialSentence(shaped) === PARTIAL_UNRECORDED) {
    partialStateUnrecorded += 1;
  }
}

const evidence = summary.evidence || {};

const attention = [];
let attentionReplaces = 0;
let attentionOmitsConflict = 0;
let draftsWithConflictAndLight = 0;
for (const [fixtureId, rows] of byFixture) {
  const sentences = rows.map((card) => ({
    sentenceState: card.sentenceState,
    displayVerdict: card.displayVerdict,
    facts: [],
  }));
  const line = attentionHeader(sentences);
  const conflicts = rows.filter((card) => shownState(liveShape(card)) === "conflicts").length;
  const light = rows.filter((card) => {
    const state = shownState(liveShape(card));
    return state === "beyond" || state === "partial";
  }).length;
  if (line) attentionReplaces += 1;
  if (conflicts > 0 && light > 0) draftsWithConflictAndLight += 1;
  if (conflicts > 0 && line && !/conflict/i.test(line)) attentionOmitsConflict += 1;
  attention.push({ fixtureId, cards: rows.length, conflicts, light, line: line || "" });
}

const writerWithheld = fixtures.filter((row) => row.writerFeedbackStatus === "withheld").length;

const partialUnique = partialStatements.size;
const partialNoReasonUnique = partialNoReasonStatements.size;

const report = {
  cards: cards.length,
  fixtures: byFixture.size,
  site1: { noteRefused, noteRefusedNothingRaised },
  site2: {
    partialCards,
    partialUnique,
    partialLabelNothing,
    partialFindingsMissing,
    partialStage2,
    partialSpanOnly,
    partialSummaryOnly,
    partialFindingsMissing,
    partialReasonStored,
    partialStateUnrecorded,
    partialNoFinding,
    partialUnrecorded,
    partialUnrecordedSentence: partialNoReasonUnique,
    partialEmptySummary,
    partialUnavailable,
  },
  site3: { beyondEmpty, beyondCausal, beyondCausalEmpty, causalConcerns, causalEditorialClean, beyondSamples },
  site4: { silenceHist, dropAndClean, sourceAwareness, sourceAwarenessEditorialClean },
  site5: { attentionReplaces, attentionOmitsConflict, draftsWithConflictAndLight, attention },
  site6: {
    summaryEvidence: evidence,
    beyondStates,
    nothingRaisedStates,
    beyondInsidePartial: (evidence.beyond || 0) !== beyondStates,
    nothingInsideConfirmed: (evidence.confirmed || 0) !== 0 || (evidence.nothingRaised || 0) !== nothingRaisedStates,
    readiness: summary.readiness,
  },
  site7: { exportVerdictDiffers, exportEvidenceDiffers, exportNotRecorded, exportNotRecordedDespiteProse, exportSamples },
  site8: { gapStripped, genericSubject, genericPartial, genericFull },
  site9: { writtenForRows, writtenForCards, writtenForPairs, noSupportMatches, noSupportEmptyExcerpt, notSupportedEmptyExcerpt, datelineReason },
  site10: { rechecksInFile: 0 },
  since: { wordingWithheld, wordingNothingRaised, linkedinSilence, mechanicsConcerns, mechanicsMultiSpan, writerWithheld },
  labels: PARTIAL_LABEL,
};

console.log(JSON.stringify(report, null, 2));
