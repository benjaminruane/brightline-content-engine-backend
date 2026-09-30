/**
 * B351. Excerpt selection among stored passages, and the 300-character trim.
 * Strings from tests/fixtures/real-runs-2026-09-29/.
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

function loadJson(name) {
  return JSON.parse(readFileSync(path.join(FIXTURE_DIR, name), "utf8"));
}

const CLEAN = loadJson("clean-review.json");
const DOC = loadJson("doc-review.json");

const REVIEWS_ON = {
  evidenceEnabled: true,
  editorialEnabled: true,
  complianceEnabled: true,
};

const silentFramingJudge = async () => ({ fire: false, evaluativePhrase: "", sourceStance: "", note: "", reason: "" });

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

function excerptText(card) {
  const p = card.primaryExcerpt;
  if (p == null) return null;
  if (typeof p === "string") return p;
  if (typeof p.passage === "string") return p.passage;
  return null;
}

const MILLION_139 = "£139 million";
const GROUP_13 = "The total return of 13% represents a very good first half for the Group.";

describe("B351 excerpt selection", () => {
  test("T7 S11 displayed excerpt is the outperformed-expected-returns passage, not £139 million; verdict unchanged", async () => {
    const recorded = cardAt(CLEAN, 11);
    assert.equal(recorded.displayVerdict, "supported_full");
    assert.match(excerptText(recorded), /£139 million/);
    assert.match(recorded.supportSpans[1].passage, /outperformed its expected returns for the six-month/);

    const s11 = await replayCard(CLEAN, 11);
    assert.equal(s11.displayVerdict, "supported_full");
    const shown = excerptText(s11);
    assert.match(shown.replace(/\s+/g, " "), /outperformed its expected returns for the six-month period/);
    assert.equal(shown.includes(MILLION_139), false);

    const s11doc = await replayCard(DOC, 11);
    assert.equal(s11doc.displayVerdict, "supported_full");
    assert.match(excerptText(s11doc).replace(/\s+/g, " "), /outperformed its expected returns for the six-month period/);
    assert.equal(excerptText(s11doc).includes(MILLION_139), false);
  });

  test("T8 S1 displayed excerpt is the 14% private equity passage, not the 13% total return", async () => {
    const recorded = cardAt(CLEAN, 1);
    assert.equal(recorded.displayVerdict, "supported_partial");
    assert.equal(excerptText(recorded), GROUP_13);
    assert.match(recorded.supportSpans[0].passage, /gross investment return of £3,234 million or 14%/);

    const s1 = await replayCard(CLEAN, 1);
    assert.equal(s1.displayVerdict, "supported_partial");
    const shown = excerptText(s1);
    assert.match(shown, /gross investment return of £3,234 million or 14%/);
    assert.equal(shown.includes("The total return of 13%"), false);
  });

  test("trimExcerptTo300 does not cut mid-word on the recorded S8 fragment", () => {
    const recorded = cardAt(CLEAN, 8);
    const span = recorded.supportSpans[0].passage;
    assert.ok(span.length > 300);
    const trimmed = trimExcerptTo300(span);
    assert.ok(trimmed);
    assert.equal(/Su$/.test(trimmed.replace(/\.\.\.$/, "").trim()), false);
    const withoutEllipsis = trimmed.replace(/\.\.\.$/, "").trim();
    assert.match(withoutEllipsis, /[.!?]$|\w$/);
    const last = withoutEllipsis.split(/\s+/).pop();
    assert.notEqual(last, "Su");
  });
});
