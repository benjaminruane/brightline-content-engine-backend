/**
 * B354 Part 3. Did this name do this.
 * Strings from tests/fixtures/real-runs-2026-09-29/. No paraphrases.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";

import {
  actorMismatch,
  applyActorOfTheAction,
  leadingActor,
  sourceNameVocabulary,
} from "../lib/qc/actor-of-the-action.mjs";
import { assembleCard } from "../lib/qc/pipeline-v3/stage7-assemble-card.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_DIR = path.join(ROOT, "tests/fixtures/real-runs-2026-09-29");
const CLEAN = JSON.parse(readFileSync(path.join(FIXTURE_DIR, "clean-review.json"), "utf8"));
const DOC = JSON.parse(readFileSync(path.join(FIXTURE_DIR, "doc-review.json"), "utf8"));

const SOURCES = CLEAN.sources;
const VOCAB = sourceNameVocabulary(SOURCES);

const MAIT_STATEMENT = DOC.statements[8].qcCard.statement;
const ACTION_STATEMENT = CLEAN.statements[8].qcCard.statement;
const ACTION_PASSAGE = DOC.statements[8].qcCard.primaryExcerpt;
const ELSEWHERE_STATEMENT = CLEAN.statements[10].qcCard.statement;
const ACTOR_SENTENCE =
  "The statement attributes this to MAIT; the source credits Action.";

const silentFramingJudge = async () => ({
  fire: false,
  evaluativePhrase: "",
  sourceStance: "",
  note: "",
  reason: "",
});

const REVIEWS_ON = {
  evidenceEnabled: true,
  editorialEnabled: true,
  complianceEnabled: true,
};

function editorialClean() {
  return {
    editorialVerdict: "clean",
    editorialConcerns: [],
    complianceVerdict: "clean",
    complianceConcerns: [],
  };
}

async function assembleActorCard({
  statement,
  passage,
  verdict = "confirmed",
  hasConflict = false,
  commentary = "The source confirms the redemption.",
}) {
  return assembleCard(
    {
      statementText: statement,
      startChar: 0,
      endChar: statement.length,
      supportSpans: [{ passage, sourceRefId: 0, classification: "confirmed" }],
      sourceMatches: [
        {
          sourceIndex: 0,
          classification: hasConflict ? "conflicting" : "confirmed",
          sourceLabel: SOURCES[0].label,
          passage,
        },
      ],
      verdictResult: {
        verdict,
        hasConflict,
        confirmingMatches: [{ sourceIndex: 0, sourceLabel: SOURCES[0].label }],
        contributingSourceIndices: [0],
      },
      excerptResult: {
        primaryExcerpt: { passage, sourceLabel: SOURCES[0].label },
        conflictExcerpt: null,
      },
      commentaryResult: { commentary },
      editorialResult: editorialClean(),
    },
    8,
    {
      pipelineRoute: "v4",
      skipEditorialDuplicationJudge: true,
      framingFidelityJudge: silentFramingJudge,
      reviewOptions: REVIEWS_ON,
      sources: SOURCES,
    }
  );
}

describe("B354 actor of the action", () => {
  test("FIRES on doctored S8 MAIT vs Action", async () => {
    assert.equal(MAIT_STATEMENT, "MAIT also completed a pro-rata redemption of shares, which generated significant proceeds for 3i.");
    assert.match(ACTION_PASSAGE, /Action completed a capital restructuring with a pro-rata redemption of/);
    assert.equal(VOCAB.has("MAIT"), true);
    assert.equal(VOCAB.has("Action"), true);
    const mismatch = actorMismatch({
      statement: MAIT_STATEMENT,
      confirmingPassage: ACTION_PASSAGE,
      sources: SOURCES,
    });
    assert.equal(mismatch.draftParty, "MAIT");
    assert.equal(mismatch.sourceParty, "Action");
    const card = await assembleActorCard({
      statement: MAIT_STATEMENT,
      passage: ACTION_PASSAGE,
      verdict: "confirmed",
    });
    assert.equal(card.displayVerdict, "conflict");
    assert.equal(card.concernLevel, "high");
    assert.equal(card.displayVerdictReason, "actor_mismatch");
    assert.equal(card.evidenceSummary.startsWith(ACTOR_SENTENCE), true);
    assert.equal(card.evidenceSummary.includes(ACTOR_SENTENCE), true);
  });

  test("doctored S8: actor sentence leads the recorded comment unaltered", () => {
    const recorded = DOC.statements[8].qcCard.evidenceSummary;
    assert.match(recorded, /The reviewer should consider whether the term 'significant' is necessary/);
    const applied = applyActorOfTheAction({
      statement: MAIT_STATEMENT,
      confirmingPassage: ACTION_PASSAGE,
      sources: SOURCES,
      hasConflict: false,
      displayVerdict: "supported_partial",
      commentaryNotReviewed: false,
      evidenceSummary: recorded,
    });
    assert.equal(applied.evidenceSummary.startsWith(ACTOR_SENTENCE), true);
    assert.equal(applied.evidenceSummary.slice(ACTOR_SENTENCE.length + 1), recorded);
    assert.equal(applied.evidenceSummary, `${ACTOR_SENTENCE} ${recorded}`);
    assert.equal(applied.evidenceSummary.startsWith(" "), false);
    assert.equal(applied.evidenceSummary.includes(`${ACTOR_SENTENCE}  `), false);
    assert.equal(applied.evidenceSummary.charAt(ACTOR_SENTENCE.length), " ");
    assert.equal(applied.evidenceSummary.charAt(ACTOR_SENTENCE.length + 1), recorded.charAt(0));
  });

  test("empty commentary: the result is the sentence alone", () => {
    const applied = applyActorOfTheAction({
      statement: MAIT_STATEMENT,
      confirmingPassage: ACTION_PASSAGE,
      sources: SOURCES,
      hasConflict: false,
      displayVerdict: "supported_full",
      commentaryNotReviewed: false,
      evidenceSummary: "",
    });
    assert.equal(applied.evidenceSummary, ACTOR_SENTENCE);
    const whitespace = applyActorOfTheAction({
      statement: MAIT_STATEMENT,
      confirmingPassage: ACTION_PASSAGE,
      sources: SOURCES,
      hasConflict: false,
      displayVerdict: "supported_full",
      commentaryNotReviewed: false,
      evidenceSummary: "   ",
    });
    assert.equal(whitespace.evidenceSummary, ACTOR_SENTENCE);
  });

  test("both fire: actor sentence first; match clause dropped on conflict; reviewer instruction last", async () => {
    const recorded = DOC.statements[8].qcCard.evidenceSummary;
    const statement = "MAIT also completed a 2.2% stake purchase.";
    const card = await assembleActorCard({
      statement,
      passage: ACTION_PASSAGE,
      verdict: "confirmed",
      commentary: recorded,
    });
    assert.equal(card.evidenceSummary.startsWith(ACTOR_SENTENCE), true);
    assert.equal(/\b2\.2% matches the source\./.test(card.evidenceSummary), false);
    assert.equal(
      card.evidenceSummary.includes(
        "The reviewer should consider whether the term 'significant' is necessary or if additional context is needed to support this characterization."
      ),
      true
    );
    assert.equal(card.evidenceSummary.endsWith("2.2% matches the source."), false);
    assert.equal(card.evidenceSummary.endsWith(ACTOR_SENTENCE), false);
    assert.equal(/The source also states/.test(card.evidenceSummary), false);
  });

  test("STANDS DOWN on the clean S8 where both sides are Action", async () => {
    assert.equal(ACTION_STATEMENT, "Action also completed a pro-rata redemption of shares, which generated significant proceeds for 3i.");
    const mismatch = actorMismatch({
      statement: ACTION_STATEMENT,
      confirmingPassage: ACTION_PASSAGE,
      sources: SOURCES,
    });
    assert.equal(mismatch, null);
    const card = await assembleActorCard({
      statement: ACTION_STATEMENT,
      passage: ACTION_PASSAGE,
    });
    assert.equal(card.displayVerdictReason, null);
    assert.equal(card.evidenceSummary.includes("The statement attributes this to"), false);
  });

  test("STANDS DOWN on Elsewhere... because no vocabulary name is in the first six words", () => {
    assert.match(ELSEWHERE_STATEMENT, /^Elsewhere, within the private equity portfolio, 3i completed the sale of MPM/);
    const hit = leadingActor(ELSEWHERE_STATEMENT, VOCAB);
    assert.equal(hit.standDown, "no_actor");
    const mismatch = actorMismatch({
      statement: ELSEWHERE_STATEMENT,
      confirmingPassage: ACTION_PASSAGE,
      sources: SOURCES,
    });
    assert.equal(mismatch, null);
  });

  test("STANDS DOWN on a first-person statement", () => {
    const statement = "We completed a pro-rata redemption of shares";
    const hit = leadingActor(statement, VOCAB);
    assert.equal(hit.standDown, "first_person");
    const mismatch = actorMismatch({
      statement,
      confirmingPassage: ACTION_PASSAGE,
      sources: SOURCES,
    });
    assert.equal(mismatch, null);
  });

  test("STANDS DOWN on two names in the opening", () => {
    const statement = "Following Action's refinancing, 3i received £944 million";
    const hit = leadingActor(statement, VOCAB);
    assert.equal(hit.standDown, "ambiguous_actor");
    const mismatch = actorMismatch({
      statement,
      confirmingPassage: ACTION_PASSAGE,
      sources: SOURCES,
    });
    assert.equal(mismatch, null);
  });

  test("STANDS DOWN on a conflict card", async () => {
    const applied = applyActorOfTheAction({
      statement: MAIT_STATEMENT,
      confirmingPassage: ACTION_PASSAGE,
      sources: SOURCES,
      hasConflict: true,
      displayVerdict: "conflict",
      commentaryNotReviewed: false,
      evidenceSummary: "The source contradicts the party.",
    });
    assert.equal(applied, null);
    const card = await assembleActorCard({
      statement: MAIT_STATEMENT,
      passage: ACTION_PASSAGE,
      verdict: "conflicting",
      hasConflict: true,
    });
    assert.equal(card.hasConflict, true);
    assert.equal(card.displayVerdictReason, null);
    assert.equal(card.evidenceSummary.includes(ACTOR_SENTENCE), false);
  });

  test("STANDS DOWN when the draft name is not in the source vocabulary", () => {
    const statement = "AcmeHoldings completed a pro-rata redemption of shares";
    assert.equal(VOCAB.has("AcmeHoldings"), false);
    const hit = leadingActor(statement, VOCAB);
    assert.equal(hit.standDown, "no_actor");
    const mismatch = actorMismatch({
      statement,
      confirmingPassage: ACTION_PASSAGE,
      sources: SOURCES,
    });
    assert.equal(mismatch, null);
  });
});
