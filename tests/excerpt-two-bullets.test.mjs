/**
 * B359 Part 2. Two non-contiguous source sentences for one statement.
 * Confirms the B358 S10 hypothesis with no model calls, then shows the
 * joined quote on the card.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";

import { locatePassageInSource, recoverExcerptFromSource } from "../lib/qc/excerpt-from-source.mjs";
import { locateClaimSentencesInSource, QUOTE_GAP_MARK } from "../lib/qc/excerpt-sentences.mjs";
import { assembleCard } from "../lib/qc/pipeline-v3/stage7-assemble-card.mjs";
import { selectExcerpts } from "../lib/qc/pipeline-v4/stage4-select-excerpts.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_DIR = path.join(ROOT, "tests/fixtures/real-runs-2026-09-29");
const CLEAN = JSON.parse(readFileSync(path.join(FIXTURE_DIR, "clean-review.json"), "utf8"));
const DOC = JSON.parse(readFileSync(path.join(FIXTURE_DIR, "doc-review.json"), "utf8"));
const SOURCE = readFileSync(path.join(FIXTURE_DIR, "source-3i-hy25-extracted.txt"), "utf8");

const BULLET_REALISATION =
  "Our Private Equity team completed the realisation of MPM and signed the realisation of MAIT in the period.";
const BULLET_MULTIPLES = "The sales achieved sterling money multiples of 3.2x and 2.8x respectively.";
const CONCAT = `${BULLET_REALISATION} ${BULLET_MULTIPLES}`;

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

async function replayCard(payload, index) {
  const card = payload.statements[index].qcCard;
  const sources = payload.sources;
  const verdict = supportStateToVerdict(card.supportState);
  const fps = Array.isArray(card.stage2SourceFingerprints) ? card.stage2SourceFingerprints : [];
  const sourceMatches = fps.map((fp) => ({
    sourceIndex: Number.isFinite(fp.sourceIndex) ? fp.sourceIndex : 0,
    sourceLabel: fp.sourceLabel || sources[0]?.label || sources[0]?.name,
    classification: fp.classification,
    passage: "",
  }));
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

describe("B359 two bullets as one passage", () => {
  test("S10 hypothesis CONFIRMED: concat of the two bullets is not one source stretch; each bullet locates", () => {
    const a = locatePassageInSource(SOURCE, BULLET_REALISATION);
    const b = locatePassageInSource(SOURCE, BULLET_MULTIPLES);
    assert.equal(Number.isFinite(a.start), true);
    assert.equal(Number.isFinite(a.end), true);
    assert.equal(Number.isFinite(b.start), true);
    assert.equal(Number.isFinite(b.end), true);
    const both = locatePassageInSource(SOURCE, CONCAT);
    assert.equal(both.start, null);
    assert.equal(both.end, null);
    assert.equal(a.end < b.start, true);
    const between = SOURCE.slice(a.end, b.start);
    assert.match(between, /542 million/);
    assert.equal(between.includes("3.2x"), false);
  });

  test("recover of the concatenated pointer joins the two source sentences with a visible gap", () => {
    const recovered = recoverExcerptFromSource({
      pointer: CONCAT,
      sourceText: SOURCE,
      statementIndex: 10,
    });
    assert.equal(recovered.miss, false);
    assert.equal(recovered.step, "segments");
    assert.equal(recovered.runCount, 2);
    assert.match(recovered.passage, /realisation of MPM/);
    assert.match(recovered.passage, /realisation of MAIT/);
    assert.match(recovered.passage, /3\.2x/);
    assert.match(recovered.passage, /2\.8x/);
    assert.equal(recovered.passage.includes(QUOTE_GAP_MARK.trim()), true);
    assert.equal(recovered.passage.includes("£542 million"), false);
  });

  test("S10 of both payloads shows MPM, MAIT, 3.2x and 2.8x", async () => {
    for (const payload of [CLEAN, DOC]) {
      const card = await replayCard(payload, 10);
      const shown = excerptText(card);
      assert.equal(card.displayVerdict, "supported_full");
      assert.equal(card.hasRealExcerpt, true);
      assert.match(shown, /realisation of MPM/);
      assert.match(shown, /MAIT/);
      assert.match(shown, /3\.2x/);
      assert.match(shown, /2\.8x/);
      assert.equal(card.displayVerdict === "unverifiable", false);
    }
  }, 20000);

  test("source search on the S10 statement finds the same two sentences", () => {
    const hit = locateClaimSentencesInSource({
      statement: CLEAN.statements[10].qcCard.statement,
      sourceText: SOURCE,
      sourceLabel: "3i",
    });
    assert.ok(hit?.passage);
    assert.match(hit.passage, /realisation of MPM/);
    assert.match(hit.passage, /3\.2x/);
    assert.match(hit.passage, /2\.8x/);
    assert.equal(hit.runCount, 2);
  });
});
