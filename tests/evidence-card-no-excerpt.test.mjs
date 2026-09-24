/**
 * B322. A supported card with no locatable excerpt must not read as Confirmed.
 * Input is the recorded d17 card from the extractor-swap outputs, not a hand-built object.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";
import { assembleCard } from "../lib/qc/pipeline-v3/stage7-assemble-card.mjs";
import {
  CHECK_NOT_CHECKED_LABEL,
  classifyCard,
  cleanLineFromNames,
  evidenceRowLabel,
  turnedOffLineFromClass,
} from "../lib/qc/review-summary.mjs";
import { evidenceDisplayVerdictLabel } from "../lib/qc/evidence-display-verdict.mjs";
import { renderCanonicalExportText } from "../lib/qc/export-review-data.mjs";
import { NOT_REVIEWED_REASONS } from "../lib/qc/not-reviewed-reason.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GATE7 = path.join(ROOT, "scripts/diagnostic/extractor-swap/outputs/d17-gate7.json");
const RECHECK = path.join(ROOT, "scripts/diagnostic/extractor-swap/outputs/d17-recheck.json");

const EXCERPT_NOT_LOCATABLE_COPY =
  "The matching passage could not be located in the named source.";

const REVIEWS_ON = {
  evidenceEnabled: true,
  editorialEnabled: true,
  complianceEnabled: true,
};

function loadRecordedD17() {
  const gate7 = JSON.parse(readFileSync(GATE7, "utf8"));
  const recheck = JSON.parse(readFileSync(RECHECK, "utf8"));
  const newVerdict = gate7.newVerdict && typeof gate7.newVerdict === "object" ? gate7.newVerdict : {};
  return {
    gate7,
    recheck,
    statement: typeof newVerdict.statement === "string" ? newVerdict.statement : "",
    quote: typeof newVerdict.quote === "string" ? newVerdict.quote : "",
    filename: typeof gate7.filename === "string" ? gate7.filename : "d17.pdf",
    recordedCard: {
      statement: typeof newVerdict.statement === "string" ? newVerdict.statement : "",
      supportState: recheck.supportState,
      displayVerdict: recheck.displayVerdict,
      hasRealExcerpt: recheck.hasRealExcerpt === true,
      excerptNotLocatable: recheck.excerptNotLocatable === true,
      primaryExcerpt:
        typeof recheck.primaryExcerpt === "string" && recheck.primaryExcerpt.trim()
          ? recheck.primaryExcerpt
          : null,
      primaryExcerptText:
        typeof recheck.primaryExcerpt === "string" && recheck.primaryExcerpt.trim()
          ? recheck.primaryExcerpt
          : null,
      editorialVerdict: "clean",
      editorialConcerns: [],
      complianceVerdict: "clean",
      complianceConcerns: [],
      sourceRecencyConcerns: [],
      framingFidelityConcerns: [],
    },
  };
}

function screenView(card, reviewOptions = REVIEWS_ON) {
  const cls = classifyCard(card, reviewOptions);
  const badgeText = evidenceDisplayVerdictLabel(card.displayVerdict);
  const evidenceRow = evidenceRowLabel(cls.evidence, card.displayVerdict, badgeText);
  const evidenceRequested = cls.evidence != null;
  const evidenceUnread = cls.evidence === "notChecked";
  const evidenceSkippedOnRun = !evidenceRequested || evidenceUnread;
  let excerptSlot = null;
  if (!evidenceSkippedOnRun && card.excerptNotLocatable === true) {
    excerptSlot = EXCERPT_NOT_LOCATABLE_COPY;
  } else if (!evidenceSkippedOnRun && card.hasRealExcerpt === true) {
    const passage =
      typeof card.primaryExcerpt === "string"
        ? card.primaryExcerpt
        : typeof card.primaryExcerptText === "string"
          ? card.primaryExcerptText
          : "";
    excerptSlot = passage.trim() || null;
  }
  const sourceRecencyRan = evidenceRequested && !evidenceUnread;
  const framingFidelityRan = evidenceRequested && !evidenceUnread;
  const sourceRecencyCount = Array.isArray(card.sourceRecencyConcerns)
    ? card.sourceRecencyConcerns.length
    : 0;
  const framingFidelityCount = Array.isArray(card.framingFidelityConcerns)
    ? card.framingFidelityConcerns.length
    : 0;
  const cleanSecondary = [
    cls.editorial === "clean" ? "Editorial" : null,
    cls.compliance === "clean" ? "Compliance" : null,
    sourceRecencyRan && sourceRecencyCount === 0 ? "Source recency" : null,
    framingFidelityRan && framingFidelityCount === 0 ? "Framing" : null,
  ].filter(Boolean);
  const exportText = renderCanonicalExportText({
    qcResult: { statements: [{ qcCard: card }] },
    reviewOptions,
  });
  const exportVerdictMatch = exportText.match(/^Verdict: (.+)$/m);
  return {
    badgeText,
    evidenceRow,
    excerptSlot,
    cleanLine: cleanLineFromNames(cleanSecondary),
    turnedOffLine: turnedOffLineFromClass(cls),
    exportLine: exportVerdictMatch ? exportVerdictMatch[0] : null,
    exportText,
    cls,
  };
}

async function assembleFromRecordedD17({ withLocatableExcerpt }) {
  const { statement, quote, filename } = loadRecordedD17();
  const passage = withLocatableExcerpt
    ? quote
    : quote;
  const sourceText = withLocatableExcerpt
    ? quote
    : "Unrelated source text that does not contain the recorded passage.";
  return assembleCard(
    {
      statementText: statement,
      startChar: 0,
      endChar: statement.length,
      sourceMatches: [
        {
          sourceIndex: 0,
          sourceLabel: filename,
          classification: "confirmed",
          passage: withLocatableExcerpt ? quote : "",
          passageRejected: withLocatableExcerpt ? false : true,
        },
      ],
      verdictResult: {
        verdict: "confirmed",
        hasConflict: false,
        confirmingMatches: [{ sourceIndex: 0, sourceLabel: filename }],
        contributingSourceIndices: [0],
      },
      excerptResult: {
        primaryExcerpt: { passage, sourceLabel: filename },
      },
      supportSpans: withLocatableExcerpt
        ? [{ passage: quote, classification: "confirmed" }]
        : [],
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
      sources: [{ text: sourceText, label: filename }],
      reviewOptions: REVIEWS_ON,
      skipEditorialDuplicationJudge: true,
    }
  );
}

describe("B322 evidence card with no excerpt", () => {
  test("recorded d17 card is the extractor-swap artefact, not a hand-built object", () => {
    const { recordedCard, recheck, gate7 } = loadRecordedD17();
    assert.equal(gate7.id, "d17");
    assert.equal(recheck.id, "d17");
    assert.equal(recordedCard.displayVerdict, "supported_full");
    assert.equal(recordedCard.hasRealExcerpt, false);
    assert.equal(recordedCard.excerptNotLocatable, true);
    assert.equal(recordedCard.primaryExcerpt, null);
  });

  test("supported with a real excerpt stays Confirmed on screen and export", async () => {
    const card = await assembleFromRecordedD17({ withLocatableExcerpt: true });
    assert.equal(card.displayVerdict, "supported_full");
    assert.equal(card.hasRealExcerpt, true);
    assert.equal(card.excerptNotLocatable, false);
    assert.equal(card.evidenceNotReviewedReason, null);
    const view = screenView(card);
    assert.equal(view.badgeText, "Confirmed");
    assert.equal(view.evidenceRow, "Confirmed");
    assert.equal(view.exportLine, "Verdict: Confirmed");
    assert.equal(view.evidenceRow, view.exportLine.replace(/^Verdict: /, ""));
  });

  test("supported with an empty or not-locatable excerpt does not read as Confirmed", async () => {
    const card = await assembleFromRecordedD17({ withLocatableExcerpt: false });
    assert.equal(card.supportState, "supported");
    assert.equal(card.hasRealExcerpt, false);
    assert.equal(card.excerptNotLocatable, true);
    assert.equal(card.displayVerdict, "not reviewed");
    assert.equal(card.evidenceNotReviewedReason, NOT_REVIEWED_REASONS.EXCERPT_NOT_LOCATABLE);
    const view = screenView(card);
    assert.notEqual(view.badgeText, "Confirmed");
    assert.notEqual(view.evidenceRow, "Confirmed");
    assert.equal(view.evidenceRow, CHECK_NOT_CHECKED_LABEL);
    assert.equal(view.exportLine, `Verdict: ${CHECK_NOT_CHECKED_LABEL}`);
    assert.equal(view.evidenceRow, view.exportLine.replace(/^Verdict: /, ""));
    assert.equal(view.exportText.includes("Verdict: Confirmed"), false);
  });

  test("the recorded d17 card through the live display path is the false green B322 closes", () => {
    const { recordedCard } = loadRecordedD17();
    const view = screenView(recordedCard);
    assert.equal(view.badgeText, "Confirmed");
    assert.equal(view.evidenceRow, "Confirmed");
    assert.equal(view.excerptSlot, EXCERPT_NOT_LOCATABLE_COPY);
    assert.equal(view.exportLine, "Verdict: Confirmed");
  });
});
