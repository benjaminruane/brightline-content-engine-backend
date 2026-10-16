/**
 * B395. Re-run Stage 7 on the stored stage outputs. Flag off, then flag on.
 * No model call. The Stage 3 verdict is aggregated from the stored
 * fingerprints, which is the result recovery used to override.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assembleCard } from "../../../lib/qc/pipeline-v3/stage7-assemble-card.mjs";
import { selectExcerpts } from "../../../lib/qc/pipeline-v4/stage4-select-excerpts.mjs";
import { aggregateVerdict } from "../../../lib/qc/pipeline-v4/stage3-aggregate-verdict.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const OUT_DIR = path.join(ROOT, "scripts/diagnostic/b395/runs");

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

const PAYLOADS = [
  ["3i-doc", "tests/fixtures/real-runs-2026-09-29/doc-review.json", "eight"],
  ["3i-clean", "tests/fixtures/real-runs-2026-09-29/clean-review.json", "eight"],
  ["hicl-doc", "tests/fixtures/real-runs-2026-10-04-hicl/doc-review.json", "eight"],
  ["hicl-clean", "tests/fixtures/real-runs-2026-10-04-hicl/clean-review.json", "eight"],
  ["gpi-doc", "tests/fixtures/real-runs-2026-10-06-gpi/doc-review.json", "eight"],
  ["gpi-clean", "tests/fixtures/real-runs-2026-10-06-gpi/clean-run2-review.json", "eight"],
  ["cp-doc", "tests/fixtures/real-runs-2026-10-06-clearpoint/dirty1-review.json", "eight"],
  ["cp-clean", "tests/fixtures/real-runs-2026-10-06-clearpoint/clean1-review.json", "eight"],
  ["gpi-clean-run3", "tests/fixtures/real-runs-2026-10-06-gpi/clean-run3-review.json", "recovery-run"],
  ["gpi-clean-run4", "tests/fixtures/real-runs-2026-10-06-gpi/clean-run4-review.json", "recovery-run"],
  ["gpi-clean-run5", "tests/fixtures/real-runs-2026-10-06-gpi/clean-run5-review.json", "recovery-run"],
];

function load(rel) {
  return JSON.parse(readFileSync(path.join(ROOT, rel), "utf8"));
}

function passageOf(card) {
  const text = card?.primaryExcerptText;
  if (typeof text === "string" && text.trim()) return text;
  const p = card?.primaryExcerpt;
  if (typeof p === "string") return p;
  if (p && typeof p.passage === "string") return p.passage;
  return "";
}

function matchesFromCard(card, sources) {
  const label = sources[0]?.label || sources[0]?.name || "";
  const fps = Array.isArray(card.stage2SourceFingerprints) ? card.stage2SourceFingerprints : [];
  return fps.map((fp) => ({
    sourceIndex: Number.isFinite(fp.sourceIndex) ? fp.sourceIndex : 0,
    sourceLabel: fp.sourceLabel || label,
    classification: fp.classification,
    passage: "",
    emptyConfirmationRefused: fp.emptyConfirmationRefused === true,
    matchNotReviewed: fp.matchNotReviewed === true,
  }));
}

function face(card) {
  const passage = passageOf(card);
  return {
    displayVerdict: card.displayVerdict ?? null,
    supportState: card.supportState ?? null,
    concernLevel: card.concernLevel ?? null,
    evidenceSummary: card.evidenceSummary || "",
    passage,
    passageChars: passage.length,
  };
}

function changed(off, on) {
  return (
    off.displayVerdict !== on.displayVerdict ||
    off.supportState !== on.supportState ||
    off.evidenceSummary !== on.evidenceSummary ||
    off.passage !== on.passage
  );
}

async function reassembleOne(payload, index, flagOn) {
  const card = payload.statements[index].qcCard;
  const sources = payload.sources;
  const sourceMatches = matchesFromCard(card, sources);
  const aggregated = aggregateVerdict({ statementMatches: sourceMatches });
  const excerpts = selectExcerpts({
    statementMatches: sourceMatches,
    verdict: aggregated.verdict,
    hasConflict: aggregated.hasConflict === true,
    supportSpans: card.supportSpans,
    sources,
    statementText: card.statement,
  });
  const prev = process.env.QC_RECOVERY_MAY_NOT_GREEN;
  process.env.QC_RECOVERY_MAY_NOT_GREEN = flagOn ? "1" : "0";
  try {
    const built = await assembleCard(
      {
        statementText: card.statement,
        startChar: card.charStart,
        endChar: card.charEnd,
        supportSpans: card.supportSpans,
        sourceMatches,
        verdictResult: {
          verdict: aggregated.verdict,
          hasConflict: aggregated.hasConflict === true,
          confirmingMatches: [],
          contributingSourceIndices: aggregated.contributingSourceIndices,
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
        draftStatements: payload.statements.map((s) => s.text),
        reviewOptions: payload.reviewOptions || REVIEWS_ON,
        skipEditorialDuplicationJudge: true,
        framingFidelityJudge: silentFramingJudge,
        today: new Date("2026-10-06T00:00:00.000Z"),
      }
    );
    return { aggregatedVerdict: aggregated.verdict, ...face(built) };
  } finally {
    if (prev == null) delete process.env.QC_RECOVERY_MAY_NOT_GREEN;
    else process.env.QC_RECOVERY_MAY_NOT_GREEN = prev;
  }
}

function refused(card) {
  const fps = Array.isArray(card.stage2SourceFingerprints) ? card.stage2SourceFingerprints : [];
  return fps.some((fp) => fp.emptyConfirmationRefused === true);
}

async function main() {
  const rows = [];
  for (const [name, rel, set] of PAYLOADS) {
    const payload = load(rel);
    for (let i = 0; i < payload.statements.length; i += 1) {
      const card = payload.statements[i].qcCard;
      const off = await reassembleOne(payload, i, false);
      const on = await reassembleOne(payload, i, true);
      rows.push({
        name,
        set,
        index: i,
        storedVerdict: card.displayVerdict,
        storedSupport: card.supportState,
        recoveryFlag: refused(card),
        off,
        on,
        changed: changed(off, on),
      });
    }
  }
  mkdirSync(OUT_DIR, { recursive: true });
  const diffs = rows.filter((r) => r.changed);
  writeFileSync(path.join(OUT_DIR, "diff.json"), JSON.stringify({ rows, diffs }, null, 2));
  console.log(`cards ${rows.length} changed ${diffs.length}`);
  for (const r of diffs) {
    console.log(
      [
        r.set,
        r.name,
        `S${r.index}`,
        `stored ${r.storedVerdict}`,
        `off ${r.off.displayVerdict}/${r.off.supportState}`,
        `on ${r.on.displayVerdict}/${r.on.supportState}`,
        `passage ${r.off.passageChars}->${r.on.passageChars}`,
        `comment ${r.off.evidenceSummary.length}->${r.on.evidenceSummary.length}`,
      ].join(" | ")
    );
  }
}

main();
