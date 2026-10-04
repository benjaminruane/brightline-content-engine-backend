/**
 * B371. Wrong-company check default off. The detector is not narrowed.
 * Role-party and scale stay on. No model calls.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, test } from "vitest";
import { vi } from "vitest";

import {
  applyActorOfTheAction,
  isActorOfTheActionEnabled,
} from "../lib/qc/actor-of-the-action.mjs";
import { assembleCard } from "../lib/qc/pipeline-v3/stage7-assemble-card.mjs";
import { selectExcerpts } from "../lib/qc/pipeline-v4/stage4-select-excerpts.mjs";
import { rolePartyMismatch } from "../lib/qc/role-party.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OCT_DOC = JSON.parse(
  readFileSync(path.join(ROOT, "tests/fixtures/real-runs-2026-10-02/doc-review.json"), "utf8")
);

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

afterEach(() => {
  vi.unstubAllEnvs();
});

function supportStateToVerdict(supportState) {
  if (supportState === "supported") return "confirmed";
  if (supportState === "partial") return "partially_confirmed";
  if (supportState === "conflicting") return "conflicting";
  if (supportState === "skipped") return "not_reviewed";
  return "not_supported";
}

function asExcerpt(value, sources, fallbackLabel) {
  const label = fallbackLabel || sources[0]?.label || sources[0]?.name || "";
  if (value == null) return null;
  if (typeof value === "string") {
    return value.trim() ? { passage: value, sourceLabel: label } : null;
  }
  if (typeof value.passage === "string" && value.passage.trim()) {
    return { passage: value.passage, sourceLabel: value.sourceLabel || label };
  }
  return null;
}

function excerptPointer(card, sources) {
  return asExcerpt(card.primaryExcerpt, sources, card.primaryRefTitle);
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
    emptyConfirmationRefused: fp.emptyConfirmationRefused === true,
  }));
}

async function replayCard(payload, index) {
  const card = payload.statements[index].qcCard;
  const sources = payload.sources;
  const verdict = supportStateToVerdict(card.supportState);
  const sourceMatches = matchesFromCard(card, sources);
  const selected = selectExcerpts({
    statementMatches: sourceMatches,
    verdict,
    hasConflict: card.hasConflict === true,
    supportSpans: card.supportSpans,
    sources,
    statementText: card.statement,
  });
  const excerpts = {
    primaryExcerpt: excerptPointer(card, sources) || selected.primaryExcerpt,
    conflictExcerpt: asExcerpt(card.conflictExcerpt, sources) || selected.conflictExcerpt,
  };
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

describe("B371 actor of the action default off", () => {
  test("unset, empty, 0, false, off are off; 1, true, yes, on are on", () => {
    assert.equal(isActorOfTheActionEnabled({}), false);
    assert.equal(isActorOfTheActionEnabled({ QC_ACTOR_OF_THE_ACTION: "" }), false);
    assert.equal(isActorOfTheActionEnabled({ QC_ACTOR_OF_THE_ACTION: "0" }), false);
    assert.equal(isActorOfTheActionEnabled({ QC_ACTOR_OF_THE_ACTION: "false" }), false);
    assert.equal(isActorOfTheActionEnabled({ QC_ACTOR_OF_THE_ACTION: "off" }), false);
    assert.equal(isActorOfTheActionEnabled({ QC_ACTOR_OF_THE_ACTION: "1" }), true);
    assert.equal(isActorOfTheActionEnabled({ QC_ACTOR_OF_THE_ACTION: "true" }), true);
    assert.equal(isActorOfTheActionEnabled({ QC_ACTOR_OF_THE_ACTION: "yes" }), true);
    assert.equal(isActorOfTheActionEnabled({ QC_ACTOR_OF_THE_ACTION: "on" }), true);
  });

  test("off means applyActorOfTheAction does not run, even when a mismatch exists", () => {
    const statement = OCT_DOC.statements[14].qcCard.statement;
    const passage = OCT_DOC.statements[14].qcCard.primaryExcerpt;
    const applied = applyActorOfTheAction({
      statement,
      confirmingPassage: passage,
      sources: OCT_DOC.sources,
      hasConflict: false,
      displayVerdict: "supported_full",
      commentaryNotReviewed: false,
      evidenceSummary: "The source does not specifically mention the UK government.",
    });
    assert.equal(applied, null);
  });

  test("October S14 reverts from actor conflict when the check is off", async () => {
    const s14 = await replayCard(OCT_DOC, 14);
    assert.notEqual(s14.displayVerdictReason, "actor_mismatch");
    assert.equal(/The statement attributes this to the UK government/.test(s14.evidenceSummary), false);
    assert.notEqual(s14.displayVerdict, "conflict");
  }, 20000);

  test("role-party still fires on October S9", async () => {
    const stored = OCT_DOC.statements[9].qcCard;
    const passages = [
      excerptPointer(stored, OCT_DOC.sources)?.passage,
      asExcerpt(stored.conflictExcerpt, OCT_DOC.sources)?.passage,
    ].filter(Boolean);
    const liveHit = rolePartyMismatch({
      statement: stored.statement,
      displayedPassages: passages,
    });
    assert.equal(liveHit.draftParty, "AGIC");
    assert.equal(liveHit.sourceParty, "GIC");
    const s9 = await replayCard(OCT_DOC, 9);
    assert.equal(s9.displayVerdictReason, "role_party_mismatch");
    assert.match(s9.evidenceSummary, /The statement attributes this to AGIC; the source credits GIC\./);
    assert.notEqual(s9.displayVerdict, "supported_full");
  }, 20000);

  test("scale still fires on October S12", async () => {
    const s12 = await replayCard(OCT_DOC, 12);
    assert.equal(s12.displayVerdictReason, "scale_set_one_holding");
    assert.notEqual(s12.displayVerdict, "supported_full");
  }, 20000);

  test("the check still fires when the flag is on", async () => {
    vi.stubEnv("QC_ACTOR_OF_THE_ACTION", "1");
    const s14 = await replayCard(OCT_DOC, 14);
    assert.equal(s14.displayVerdict, "conflict");
    assert.equal(s14.displayVerdictReason, "actor_mismatch");
    assert.match(
      s14.evidenceSummary,
      /The statement attributes this to the UK government; the source credits 3i Group plc\./
    );
  }, 20000);
});
