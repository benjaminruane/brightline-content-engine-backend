/**
 * B351. A card may not say it cannot find what it is holding.
 * Strings from tests/fixtures/real-runs-2026-09-29/. No paraphrases.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";

import {
  applyOmissionConflictInvariant,
  stripContrastiveOnConfirmingSentences,
} from "../lib/qc/card-honesty.mjs";
import { assembleCard } from "../lib/qc/pipeline-v3/stage7-assemble-card.mjs";
import { applyEmptyConfirmationRefusal } from "../lib/qc/pipeline-v4/stage2-match-sources.mjs";
import { selectExcerpts } from "../lib/qc/pipeline-v4/stage4-select-excerpts.mjs";

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

const silentFramingJudge = async () => ({ fire: false, evaluativePhrase: "", sourceStance: "", note: "", reason: "" });

function cardAt(payload, index) {
  return payload.statements[index].qcCard;
}

function sourcesOf(payload) {
  return payload.sources;
}

function supportStateToVerdict(supportState) {
  if (supportState === "supported") return "confirmed";
  if (supportState === "partial") return "partially_confirmed";
  if (supportState === "conflicting") return "conflicting";
  if (supportState === "skipped") return "not_reviewed";
  return "not_supported";
}

function excerptPointer(card, sources) {
  const label =
    card.primaryRefTitle ||
    sources[0]?.label ||
    sources[0]?.name ||
    "";
  const p = card.primaryExcerpt;
  if (p == null) return null;
  if (typeof p === "string") return { passage: p, sourceLabel: label };
  if (typeof p.passage === "string") {
    return { passage: p.passage, sourceLabel: p.sourceLabel || label };
  }
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
  return (Array.isArray(card.supportSpans) ? card.supportSpans : []).map((span) => ({
    sourceIndex: Number.isFinite(Number(span.sourceRefId)) ? Number(span.sourceRefId) : 0,
    sourceLabel: label,
    classification: span.classification,
    passage: span.passage,
    start: span.start,
    end: span.end,
  }));
}

async function replayCard(payload, index) {
  const card = cardAt(payload, index);
  const sources = sourcesOf(payload);
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
        editorialNotReviewedReason: card.editorialNotReviewedReason,
        complianceNotReviewedReason: card.complianceNotReviewedReason,
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

function excerptText(card) {
  const p = card.primaryExcerpt;
  if (p == null) return null;
  if (typeof p === "string") return p;
  if (typeof p.passage === "string") return p.passage;
  return null;
}

const GIC_SLICE = "In September 2025, 3i acquired 2.2% of Action equity from GIC";
const RECORDED_SU_TAIL = "Su";

describe("B351 card honesty invariant", () => {
  test("T1 S6 and S7 from the clean fixture are no longer Unverifiable and show the October financing span", async () => {
    const s6Before = cardAt(CLEAN, 6);
    const s7Before = cardAt(CLEAN, 7);
    assert.equal(s6Before.displayVerdict, "unverifiable");
    assert.equal(s7Before.displayVerdict, "unverifiable");
    assert.match(s6Before.supportSpans[0].passage, /In October 2025, Action successfully completed two financing transactions/);
    assert.match(s7Before.supportSpans[0].passage, /In October 2025, Action successfully completed two financing transactions/);

    const s6 = await replayCard(CLEAN, 6);
    const s7 = await replayCard(CLEAN, 7);
    assert.notEqual(s6.displayVerdict, "unverifiable");
    assert.notEqual(s7.displayVerdict, "unverifiable");
    assert.equal(s6.displayVerdict, "supported_full");
    assert.equal(s7.displayVerdict, "supported_full");
    assert.equal(s6.supportState, "supported");
    assert.equal(s7.supportState, "supported");
    assert.match(excerptText(s6), /capital restructuring/);
    assert.match(excerptText(s7), /€3\.1 billion/);
    assert.equal(s6.hasRealExcerpt, true);
    assert.equal(s7.hasRealExcerpt, true);
  });

  test("T2 S10 empty confirmation is refused at the matcher; assembly still shows the held bullets", async () => {
    const recorded = cardAt(CLEAN, 10);
    assert.equal(recorded.displayVerdict, "unverifiable");
    assert.equal(recorded.supportState, "supported");
    assert.equal(recorded.supportSpans[0].passage, "");
    assert.equal(recorded.supportSpans[0].start, null);
    assert.equal(recorded.supportSpans[0].end, null);

    const refused = applyEmptyConfirmationRefusal({
      classification: "confirmed",
      passage: recorded.supportSpans[0].passage,
      sourceLabel: "3i-hy25-highlights.pdf",
    });
    assert.equal(refused.classification, "not_reviewed");
    assert.equal(refused.emptyConfirmationRefused, true);

    const s10 = await replayCard(CLEAN, 10);
    assert.equal(s10.displayVerdict, "supported_full");
    assert.equal(s10.supportState, "supported");
    assert.equal(s10.hasRealExcerpt, true);
    const shown = excerptText(s10);
    assert.match(shown, /realisation of MPM/);
    assert.match(shown, /realisation of MAIT/);
    assert.match(shown, /3\.2x/);
    assert.match(shown, /2\.8x/);
  });

  test("T3 S9 from the clean fixture is not a conflict", async () => {
    const recorded = cardAt(CLEAN, 9);
    assert.equal(recorded.displayVerdict, "conflict");
    assert.match(recorded.evidenceSummary, /does not mention an earlier 2\.2% stake purchase from GIC/);
    assert.match(recorded.supportSpans[0].passage, /In September 2025, 3i acquired 2\.2% of Action equity from GIC/);

    const s9 = await replayCard(CLEAN, 9);
    assert.equal(s9.displayVerdict, "supported_full");
    assert.equal(s9.supportState, "supported");
    assert.equal(s9.hasConflict, false);
    assert.match(s9.supportSpans[0].passage, new RegExp(GIC_SLICE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });

  test("T4 S9 from the doctored fixture is still a conflict because AGIC is absent", async () => {
    const recorded = cardAt(DOC, 9);
    assert.equal(recorded.displayVerdict, "conflict");
    assert.match(recorded.statement, /AGIC/);
    assert.match(recorded.evidenceSummary, /does not mention an earlier 2\.2% stake purchase from AGIC/);
    assert.equal(/AGIC/.test(recorded.supportSpans.map((s) => s.passage).join("\n")), false);

    const s9 = await replayCard(DOC, 9);
    assert.equal(s9.displayVerdict, "conflict");
    assert.equal(s9.supportState, "conflicting");
    assert.equal(s9.hasConflict, true);
  });

  test("T5 S8 from the clean fixture does not end mid-word and is not the fragment ending Su", async () => {
    const recorded = cardAt(CLEAN, 8);
    const recordedExcerpt = excerptText(recorded);
    assert.equal(recordedExcerpt.slice(-2), RECORDED_SU_TAIL);

    const s8 = await replayCard(CLEAN, 8);
    const shown = excerptText(s8);
    assert.ok(shown);
    assert.notEqual(shown.slice(-2), RECORDED_SU_TAIL);
    assert.equal(/Su$/.test(shown.trim()), false);
    const lastWord = shown.replace(/\.\.\.$/, "").trim().split(/\s+/).pop();
    assert.ok(lastWord);
    assert.match(lastWord, /[a-zA-Z0-9.€£]$/);
    assert.equal(/[A-Za-z]$/.test(shown.replace(/\.\.\.$/, "").trim()) && lastWord.length === 2 && lastWord === "Su", false);
  });

  test("T6 a confirming sentence in assembled commentary is not introduced by However", async () => {
    const recorded = cardAt(CLEAN, 9);
    assert.match(recorded.evidenceSummary, /^The statement[\s\S]*However, the source indicates/);
    const stripped = stripContrastiveOnConfirmingSentences(recorded.evidenceSummary);
    assert.equal(/\bHowever, the source indicates/.test(stripped), false);
    assert.match(stripped, /the source indicates that £755 million of proceeds were redeployed/i);

    const s9 = await replayCard(CLEAN, 9);
    assert.equal(/\bHowever,/.test(s9.evidenceSummary), false);
    const omission = applyOmissionConflictInvariant({
      commentary: recorded.evidenceSummary,
      spans: recorded.supportSpans,
      supportState: "conflicting",
      hasConflict: true,
      displayVerdict: "conflict",
    });
    assert.equal(omission.applied, true);
    assert.equal(omission.displayVerdict, "supported_full");
  });

  test("T9 control: only S6, S7, S9 and S10 may change verdict; no new findings on the other eleven", async () => {
    const allowed = new Set([6, 7, 9, 10]);
    const editorialDropAllowed = new Set([3, 12]);
    for (let i = 0; i < 15; i++) {
      const before = cardAt(CLEAN, i);
      const after = await replayCard(CLEAN, i);
      if (!allowed.has(i)) {
        assert.equal(
          after.displayVerdict,
          before.displayVerdict,
          `S${i} displayVerdict moved from ${before.displayVerdict} to ${after.displayVerdict}`
        );
        assert.equal(after.supportState, before.supportState, `S${i} supportState moved`);
        const beforeN = (before.editorialConcerns || []).length;
        const afterN = (after.editorialConcerns || []).length;
        if (editorialDropAllowed.has(i)) {
          assert.equal(afterN <= beforeN, true, `S${i} gained editorial concerns`);
        } else {
          assert.equal(afterN, beforeN, `S${i} gained or lost editorial concerns`);
        }
        assert.equal((after.framingFidelityConcerns || []).length, 0);
      }
    }
  }, 20000);

  test("T10 no regression on catches, paraphrase, pence-to-pounds, or B338 derived rows on the doctored fixture", async () => {
    const cleanS0 = await replayCard(CLEAN, 0);
    const cleanS5 = await replayCard(CLEAN, 5);
    assert.equal(cleanS0.displayVerdict, "conflict");
    assert.equal(cleanS5.displayVerdict, "supported_full");

    const docS0 = await replayCard(DOC, 0);
    const docS5 = await replayCard(DOC, 5);
    assert.equal(docS0.displayVerdict, "conflict");
    assert.equal(docS5.displayVerdict, "conflict");

    const s4 = await replayCard(CLEAN, 4);
    assert.equal(s4.displayVerdict, "supported_full");
    assert.match(excerptText(s4), /Year to date LFL\ntrading remains good despite weakening consumer confidence since the summer/);

    const s13 = await replayCard(CLEAN, 13);
    assert.equal(s13.displayVerdict, "supported_full");
    assert.match(excerptText(s13), /36\.5 pence per share/);
    assert.match(s13.evidenceSummary, /GBP 0\.365/);

    const derived = (DOC_ACTIONS.entries || []).filter((e) => e.provenance === "derived");
    assert.equal(derived.length >= 2, true);
    const ids = derived.map((e) => e.id);
    assert.equal(ids.some((id) => String(id).startsWith("S0:")), true);
    assert.equal(ids.some((id) => String(id).startsWith("S5:")), true);
  });
});
