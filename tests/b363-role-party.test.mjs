/**
 * B363. Role-preposition party mismatch. Inventory phrase wording.
 * Real strings from tests/fixtures/real-runs-2026-09-29/.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";

import { actorMismatch, applyActorOfTheAction, leadingActor, sourceNameVocabulary } from "../lib/qc/actor-of-the-action.mjs";
import { splitSentences } from "../lib/qc/card-honesty.mjs";
import { assembleCard } from "../lib/qc/pipeline-v3/stage7-assemble-card.mjs";
import { selectExcerpts } from "../lib/qc/pipeline-v4/stage4-select-excerpts.mjs";
import { applyRolePartyCheck, rolePartyMismatch } from "../lib/qc/role-party.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_DIR = path.join(ROOT, "tests/fixtures/real-runs-2026-09-29");
const CLEAN = JSON.parse(readFileSync(path.join(FIXTURE_DIR, "clean-review.json"), "utf8"));
const DOC = JSON.parse(readFileSync(path.join(FIXTURE_DIR, "doc-review.json"), "utf8"));

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

const GIC_QUOTE = DOC.statements[9].qcCard.supportSpans[0].passage;
const DOC_S9_STATEMENT = DOC.statements[9].qcCard.statement;
const CLEAN_S9_STATEMENT = CLEAN.statements[9].qcCard.statement;

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

describe("B363 role party and inventory phrase wording", () => {
  test("doctored S9 names both AGIC and GIC and keeps the silence sentence", async () => {
    assert.match(DOC_S9_STATEMENT, /from AGIC/);
    assert.match(GIC_QUOTE, /from GIC/);
    const s9 = await replayCard(DOC, 9);
    assert.equal(s9.displayVerdict, "conflict");
    assert.match(s9.evidenceSummary, /AGIC/);
    assert.match(s9.evidenceSummary, /GIC/);
    assert.match(s9.evidenceSummary, /does not mention/);
    assert.match(
      s9.evidenceSummary,
      /The statement attributes this to AGIC; the source credits GIC\./
    );
  }, 20000);

  test("clean S9 does not fire", async () => {
    assert.match(CLEAN_S9_STATEMENT, /from GIC/);
    const s9 = await replayCard(CLEAN, 9);
    assert.equal(s9.displayVerdict, "supported_full");
    assert.equal(/The statement attributes this to/.test(s9.evidenceSummary), false);
    assert.equal(/\bdoes not mention\b/i.test(s9.evidenceSummary), false);
  }, 20000);

  test("the same name after the same preposition does not fire", () => {
    const hit = rolePartyMismatch({
      statement: "3i recycled proceeds from 3i.",
      displayedPassages: ["3i acquired equity from 3i in exchange for shares."],
    });
    assert.equal(hit, null);
  });

  test("two from-names in the quote stand down", () => {
    const hit = rolePartyMismatch({
      statement: "An earlier purchase from AGIC raised the stake.",
      displayedPassages: ["3i acquired equity from GIC and later from Action."],
    });
    assert.equal(hit, null);
  });

  test("two prepositions that would each fire stand down", () => {
    const hit = rolePartyMismatch({
      statement: "Proceeds from AGIC went to MAIT.",
      displayedPassages: ["Proceeds from GIC went to Action."],
    });
    assert.equal(hit, null);
  });

  test("a green card with a 1:1 role mismatch is displayed as conflict", () => {
    const hit = applyRolePartyCheck({
      statement: "An earlier purchase from AGIC raised the stake.",
      displayedPassages: ["3i acquired 2.2% of Action equity from GIC."],
      displayVerdict: "supported_full",
      commentaryNotReviewed: false,
      evidenceSummary: "The source confirms the stake.",
    });
    assert.equal(hit.displayVerdict, "conflict");
    assert.equal(hit.displayVerdictReason, "role_party_mismatch");
    assert.equal(hit.concernLevel, "high");
    assert.equal(hit.demoted, true);
    assert.match(hit.evidenceSummary, /^The statement attributes this to AGIC; the source credits GIC\./);
  });

  test("wrong-actor stand-downs still hold", () => {
    const sources = CLEAN.sources;
    const vocab = sourceNameVocabulary(sources);
    const actionPassage = DOC.statements[8].qcCard.primaryExcerpt;
    assert.equal(
      actorMismatch({
        statement: CLEAN.statements[8].qcCard.statement,
        confirmingPassage: actionPassage,
        sources,
      }),
      null
    );
    const elsewhere = leadingActor(CLEAN.statements[10].qcCard.statement, vocab);
    assert.equal(elsewhere.standDown, "no_actor");
    const firstPerson = applyActorOfTheAction({
      statement: "We completed a pro-rata redemption of shares",
      confirmingPassage: actionPassage,
      sources,
      hasConflict: false,
      displayVerdict: "supported_full",
      commentaryNotReviewed: false,
      evidenceSummary: "The source confirms the redemption.",
    });
    assert.equal(firstPerson, null);
    const twoNames = leadingActor("Following Action's refinancing, 3i received £944 million", vocab);
    assert.equal(twoNames.standDown, "ambiguous_actor");
    const conflictStandDown = applyActorOfTheAction({
      statement: DOC.statements[8].qcCard.statement,
      confirmingPassage: actionPassage,
      sources,
      hasConflict: true,
      displayVerdict: "conflict",
      commentaryNotReviewed: false,
      evidenceSummary: "The source contradicts the party.",
    });
    assert.equal(conflictStandDown, null);
  });

  test("doctored S12 still carries the scale finding and does not end on matches-the-source", async () => {
    const s12 = await replayCard(DOC, 12);
    assert.equal(s12.displayVerdict, "conflict");
    assert.equal(s12.displayVerdictReason, "scale_set_one_holding");
    assert.match(s12.evidenceSummary, /TCR/);
    assert.equal(/\bmatch(?:es)? the source\.\s*$/i.test(s12.evidenceSummary.trim()), false);
  }, 20000);

  test("clean S12 still carries the correctly worded phrase clause", async () => {
    const s12 = await replayCard(CLEAN, 12);
    assert.equal(s12.displayVerdict, "supported_full");
    assert.match(s12.evidenceSummary, /The phrase 'driven primarily by' matches the source\./);
    assert.equal(/driven primarily by matches the source/.test(s12.evidenceSummary), false);
  }, 20000);

  test("no comment in either payload starts a sentence with a lowercase word", async () => {
    for (const payload of [CLEAN, DOC]) {
      const tag = payload === CLEAN ? "CLEAN" : "DOC";
      for (let i = 0; i < payload.statements.length; i += 1) {
        const card = await replayCard(payload, i);
        for (const sentence of splitSentences(card.evidenceSummary || "")) {
          const t = sentence.trim();
          if (!t) continue;
          assert.equal(
            /^[a-z]/.test(t),
            false,
            `${tag} S${i} lowercase sentence: ${t.slice(0, 80)}`
          );
        }
      }
    }
  }, 30000);
});
