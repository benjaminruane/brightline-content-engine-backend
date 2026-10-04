/**
 * B366. A country is not a party. A refused empty confirmation can
 * recover its quote, and only that case.
 * Live must-passes against tests/fixtures/real-runs-2026-10-02/.
 * September 29 pins the older shape.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, test } from "vitest";
import { vi } from "vitest";

import {
  actorMismatch,
  applyActorOfTheAction,
  leadingActor,
  sourceNameVocabulary,
} from "../lib/qc/actor-of-the-action.mjs";
import {
  isBareNonParty,
  isCurrencyCode,
  isGeographyName,
  organisationSuffixRaw,
} from "../lib/qc/party-tokens.mjs";
import { assembleCard } from "../lib/qc/pipeline-v3/stage7-assemble-card.mjs";
import { selectExcerpts } from "../lib/qc/pipeline-v4/stage4-select-excerpts.mjs";
import { rolePartyMismatch } from "../lib/qc/role-party.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SEPT_DIR = path.join(ROOT, "tests/fixtures/real-runs-2026-09-29");
const OCT_DIR = path.join(ROOT, "tests/fixtures/real-runs-2026-10-02");
const SEPT_CLEAN = JSON.parse(readFileSync(path.join(SEPT_DIR, "clean-review.json"), "utf8"));
const SEPT_DOC = JSON.parse(readFileSync(path.join(SEPT_DIR, "doc-review.json"), "utf8"));
const OCT_DOC = JSON.parse(readFileSync(path.join(OCT_DIR, "doc-review.json"), "utf8"));

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

function excerptText(card) {
  const p = card.primaryExcerpt;
  if (p == null) return "";
  if (typeof p === "string") return p;
  if (typeof p.passage === "string") return p.passage;
  return "";
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

function matchesFromCard(card, sources, flags = {}) {
  const label = sources[0]?.label || sources[0]?.name || "";
  const fps = Array.isArray(card.stage2SourceFingerprints) ? card.stage2SourceFingerprints : [];
  const pointer = excerptPointer(card, sources);
  if (fps.length === 0) return [];
  return fps.map((fp) => ({
    sourceIndex: Number.isFinite(fp.sourceIndex) ? fp.sourceIndex : 0,
    sourceLabel: fp.sourceLabel || label,
    classification: fp.classification,
    passage: pointer?.passage || "",
    emptyConfirmationRefused: flags.emptyConfirmationRefused === true,
    matchNotReviewed: flags.matchNotReviewed === true,
  }));
}

async function replayCard(payload, index, flags = {}, reviewOptions = REVIEWS_ON) {
  const card = payload.statements[index].qcCard;
  const sources = payload.sources;
  const verdict = supportStateToVerdict(card.supportState);
  const sourceMatches = matchesFromCard(card, sources, flags);
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
      reviewOptions,
      skipEditorialDuplicationJudge: true,
      framingFidelityJudge: silentFramingJudge,
      today: new Date("2026-10-02T00:00:00.000Z"),
    }
  );
}

const FIRST_PERSON_PASSAGE =
  "We remain cautious in the deployment of capital into new investment, but will continue to allocate selectively.";
const ACTION_PASSAGE = OCT_DOC.statements[8].qcCard.primaryExcerpt;
const ACTOR_MAIT = "The statement attributes this to MAIT; the source credits Action.";
const ACTOR_UK =
  "The statement attributes this to the UK government; the source credits 3i Group plc.";

describe("B366 party tokens", () => {
  test("UK, US, Europe and GBP are not parties; UK government is", () => {
    assert.equal(isGeographyName("UK"), true);
    assert.equal(isGeographyName("US"), true);
    assert.equal(isGeographyName("Europe"), true);
    assert.equal(isBareNonParty("UK"), true);
    assert.equal(isBareNonParty("US"), true);
    assert.equal(isCurrencyCode("GBP"), true);
    assert.equal(isBareNonParty("GBP"), true);
    assert.equal(isBareNonParty("UK government"), false);
    assert.equal(organisationSuffixRaw(" government maintains"), " government");
  });
});

describe("B366 part one. A country is not a party", () => {
  test("October S14 names the UK government; the check is off so the card is not an actor conflict", async () => {
    const vocab = sourceNameVocabulary(OCT_DOC.sources);
    assert.equal(vocab.has("UK"), false);
    assert.equal(vocab.has("US"), false);
    assert.equal(vocab.has("Europe"), false);
    const hit = leadingActor(OCT_DOC.statements[14].qcCard.statement, vocab);
    assert.equal(hit.actor, "the UK government");
    const s14 = await replayCard(OCT_DOC, 14);
    assert.notEqual(s14.displayVerdictReason, "actor_mismatch");
    assert.equal(s14.evidenceSummary.startsWith(ACTOR_UK), false);
    vi.stubEnv("QC_ACTOR_OF_THE_ACTION", "1");
    const on = await replayCard(OCT_DOC, 14);
    assert.equal(on.displayVerdict, "conflict");
    assert.equal(on.displayVerdictReason, "actor_mismatch");
    assert.equal(on.evidenceSummary.startsWith(ACTOR_UK), true);
    assert.equal(/attributes this to UK;/.test(on.evidenceSummary), false);
  }, 20000);

  test("US sales against a first-person source produces no finding", () => {
    const statement = "US sales grew 5% in the period";
    const hit = actorMismatch({
      statement,
      confirmingPassage: FIRST_PERSON_PASSAGE,
      sources: OCT_DOC.sources,
    });
    assert.equal(hit, null);
    const applied = applyActorOfTheAction({
      statement,
      confirmingPassage: FIRST_PERSON_PASSAGE,
      sources: OCT_DOC.sources,
      hasConflict: false,
      displayVerdict: "supported_full",
      commentaryNotReviewed: false,
      evidenceSummary: "The source confirms the period.",
    });
    assert.equal(applied, null);
    assert.equal(leadingActor(statement, sourceNameVocabulary(OCT_DOC.sources)).standDown, "no_actor");
  });

  test("a real company in the opening still fires", () => {
    const statement = "Action sales grew 5% in the period";
    const hit = actorMismatch({
      statement,
      confirmingPassage: FIRST_PERSON_PASSAGE,
      sources: OCT_DOC.sources,
    });
    assert.equal(hit.draftParty, "Action");
    assert.equal(hit.sourceParty, "3i Group plc");
    const mait = actorMismatch({
      statement: OCT_DOC.statements[8].qcCard.statement,
      confirmingPassage: ACTION_PASSAGE,
      sources: OCT_DOC.sources,
    });
    assert.equal(mait.draftParty, "MAIT");
    assert.equal(mait.sourceParty, "Action");
  });

  test("MAIT and AGIC findings are unchanged on both payloads when the actor check is on", async () => {
    vi.stubEnv("QC_ACTOR_OF_THE_ACTION", "1");
    const sept8 = await replayCard(SEPT_DOC, 8);
    assert.equal(sept8.displayVerdict, "conflict");
    assert.equal(sept8.displayVerdictReason, "actor_mismatch");
    assert.equal(sept8.evidenceSummary.startsWith(ACTOR_MAIT), true);
    const oct8 = await replayCard(OCT_DOC, 8);
    assert.equal(oct8.displayVerdict, "conflict");
    assert.match(oct8.evidenceSummary, /MAIT/);
    assert.match(oct8.evidenceSummary, /Action/);
    const sept9 = await replayCard(SEPT_DOC, 9);
    assert.match(sept9.evidenceSummary, /The statement attributes this to AGIC; the source credits GIC\./);
    assert.notEqual(sept9.displayVerdict, "supported_full");
    const oct9 = OCT_DOC.statements[9].qcCard;
    assert.equal(oct9.displayVerdict, "conflict");
    assert.equal(oct9.displayVerdictReason, "role_party_mismatch");
    assert.match(oct9.evidenceSummary, /The statement attributes this to AGIC; the source credits GIC\./);
    const liveHit = rolePartyMismatch({
      statement: oct9.statement,
      displayedPassages: [oct9.primaryExcerpt, oct9.conflictExcerpt.passage],
    });
    assert.equal(liveHit.draftParty, "AGIC");
    assert.equal(liveHit.sourceParty, "GIC");
  }, 20000);

  test("September clean S14 management still stands down", async () => {
    const statement = SEPT_CLEAN.statements[14].qcCard.statement;
    assert.match(statement, /management/);
    assert.equal(/UK government/.test(statement), false);
    const hit = leadingActor(statement, sourceNameVocabulary(SEPT_CLEAN.sources));
    assert.equal(hit.standDown, "no_actor");
    const s14 = await replayCard(SEPT_CLEAN, 14);
    assert.equal(s14.evidenceSummary.includes("The statement attributes this to"), false);
    assert.notEqual(s14.displayVerdictReason, "actor_mismatch");
  }, 20000);

  test("existing actor and role-party stand-downs still hold", () => {
    const vocab = sourceNameVocabulary(SEPT_CLEAN.sources);
    const actionPassage = SEPT_DOC.statements[8].qcCard.primaryExcerpt;
    assert.equal(
      actorMismatch({
        statement: SEPT_CLEAN.statements[8].qcCard.statement,
        confirmingPassage: actionPassage,
        sources: SEPT_CLEAN.sources,
      }),
      null
    );
    assert.equal(leadingActor(SEPT_CLEAN.statements[10].qcCard.statement, vocab).standDown, "no_actor");
    assert.equal(
      applyActorOfTheAction({
        statement: "We completed a pro-rata redemption of shares",
        confirmingPassage: actionPassage,
        sources: SEPT_CLEAN.sources,
        hasConflict: false,
        displayVerdict: "supported_full",
        commentaryNotReviewed: false,
        evidenceSummary: "The source confirms the redemption.",
      }),
      null
    );
    assert.equal(
      leadingActor("Following Action's refinancing, 3i received proceeds", vocab).standDown,
      "ambiguous_actor"
    );
    assert.equal(
      applyActorOfTheAction({
        statement: SEPT_DOC.statements[8].qcCard.statement,
        confirmingPassage: actionPassage,
        sources: SEPT_CLEAN.sources,
        hasConflict: true,
        displayVerdict: "conflict",
        commentaryNotReviewed: false,
        evidenceSummary: "The source contradicts the party.",
      }),
      null
    );
    assert.equal(
      rolePartyMismatch({
        statement: "3i recycled proceeds from 3i.",
        displayedPassages: ["3i acquired equity from 3i in exchange for shares."],
      }),
      null
    );
    assert.equal(
      rolePartyMismatch({
        statement: "An earlier purchase from AGIC raised the stake.",
        displayedPassages: ["3i acquired equity from GIC and later from Action."],
      }),
      null
    );
    assert.equal(
      rolePartyMismatch({
        statement: "US sales grew from US in the period.",
        displayedPassages: ["We grew sales from 3i Group plc in the period."],
      }),
      null
    );
  });
});

describe("B366 part two. Empty confirmation can get its quote back", () => {
  test("October S10 recovers MPM, MAIT, 3.2x and 2.8x when the refusal flag is present", async () => {
    const recorded = OCT_DOC.statements[10].qcCard;
    assert.equal(recorded.supportState, "skipped");
    assert.equal(recorded.stage2SourceFingerprints[0].classification, "not_reviewed");
    assert.equal(recorded.stage2SourceFingerprints[0].emptyConfirmationRefused, undefined);
    const withoutFlag = await replayCard(OCT_DOC, 10);
    assert.equal(withoutFlag.supportState, "skipped");
    assert.equal(excerptText(withoutFlag).trim(), "");
    assert.match(withoutFlag.evidenceSummary, /No source addresses the claim/);
    const s10 = await replayCard(OCT_DOC, 10, { emptyConfirmationRefused: true });
    const quote = excerptText(s10);
    assert.match(quote, /MPM/);
    assert.match(quote, /MAIT/);
    assert.match(quote, /3\.2x/);
    assert.match(quote, /2\.8x/);
    assert.equal(/no source addresses/i.test(s10.evidenceSummary), false);
    assert.equal(s10.supportState, "supported");
    assert.equal(s10.displayVerdict, "supported_full");
    assert.equal(s10.excerptNotLocatable, false);
  }, 20000);

  test("an evidence-off skipped card gains nothing", async () => {
    const s10 = await replayCard(
      OCT_DOC,
      10,
      { emptyConfirmationRefused: true },
      { evidenceEnabled: false, editorialEnabled: true, complianceEnabled: true }
    );
    assert.equal(excerptText(s10).trim(), "");
    assert.match(s10.evidenceSummary, /No source addresses the claim/);
    assert.equal(s10.supportState, "skipped");
    assert.notEqual(s10.displayVerdict, "supported_full");
  }, 20000);

  test("a matcher-throw not_reviewed card gains nothing", async () => {
    const s10 = await replayCard(OCT_DOC, 10, { matchNotReviewed: true });
    assert.equal(excerptText(s10).trim(), "");
    assert.match(s10.evidenceSummary, /No source addresses the claim/);
    assert.equal(s10.supportState, "skipped");
    const both = await replayCard(OCT_DOC, 10, {
      emptyConfirmationRefused: true,
      matchNotReviewed: true,
    });
    assert.equal(excerptText(both).trim(), "");
    assert.equal(both.supportState, "skipped");
  }, 20000);

  test("an empty-confirmation refusal whose recovery finds nothing gains nothing", async () => {
    const statement = "ZXQ completed a 9.7x exit of QRM during the period.";
    const sources = OCT_DOC.sources;
    const card = await assembleCard(
      {
        statementText: statement,
        startChar: 0,
        endChar: statement.length,
        supportSpans: [],
        sourceMatches: [
          {
            sourceIndex: 0,
            sourceLabel: sources[0]?.label || sources[0]?.name,
            classification: "not_reviewed",
            passage: "",
            emptyConfirmationRefused: true,
          },
        ],
        verdictResult: {
          verdict: "not_reviewed",
          hasConflict: false,
          confirmingMatches: [],
          contributingSourceIndices: [],
        },
        excerptResult: { primaryExcerpt: null, conflictExcerpt: null },
        commentaryResult: {
          commentary: "No source addresses the claim that ZXQ completed a 9.7x exit of QRM.",
        },
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
        sources,
        reviewOptions: REVIEWS_ON,
        skipEditorialDuplicationJudge: true,
        framingFidelityJudge: silentFramingJudge,
      }
    );
    assert.equal(excerptText(card).trim(), "");
    assert.equal(card.supportState, "skipped");
    assert.match(card.evidenceSummary, /No source addresses the claim/);
    assert.notEqual(card.displayVerdict, "supported_full");
  }, 20000);

  test("September S10 is unaffected because it predates the refusal", async () => {
    const recorded = SEPT_DOC.statements[10].qcCard;
    assert.notEqual(recorded.supportState, "skipped");
    const s10 = await replayCard(SEPT_DOC, 10);
    const quote = excerptText(s10);
    assert.match(quote, /MPM/);
    assert.match(quote, /MAIT/);
    assert.match(quote, /3\.2x/);
    assert.match(quote, /2\.8x/);
  }, 20000);
});
