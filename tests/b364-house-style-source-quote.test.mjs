/**
 * B364. House-style corrections, source self-name, second passage must
 * add a claim term, confirmation inside a conflict is marked.
 * Real strings from tests/fixtures/real-runs-2026-09-29/.
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
import { markConfirmingInsideConflict } from "../lib/qc/card-honesty.mjs";
import { assembleCard } from "../lib/qc/pipeline-v3/stage7-assemble-card.mjs";
import { selectExcerpts } from "../lib/qc/pipeline-v4/stage4-select-excerpts.mjs";
import { rolePartyMismatch } from "../lib/qc/role-party.mjs";
import { readSourceSelfName, sourceSelfNameFromSources } from "../lib/qc/source-self-name.mjs";
import { fillAction } from "../lib/revise-actions/run.mjs";
import { houseStyleOfferedToken } from "../lib/revise-actions/house-style-offer.mjs";
import { findCandidatePairs } from "../lib/revise-actions/conflict-engagement.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_DIR = path.join(ROOT, "tests/fixtures/real-runs-2026-09-29");
const CLEAN = JSON.parse(readFileSync(path.join(FIXTURE_DIR, "clean-review.json"), "utf8"));
const DOC = JSON.parse(readFileSync(path.join(FIXTURE_DIR, "doc-review.json"), "utf8"));
const STAGE5 = readFileSync(
  path.join(ROOT, "lib/qc/pipeline-v4/prompts/stage5_v2.md"),
  "utf8"
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

function primaryText(card) {
  const p = card.primaryExcerpt;
  if (p == null) return "";
  if (typeof p === "string") return p;
  if (typeof p.passage === "string") return p.passage;
  return "";
}

function conflictText(card) {
  const p = card.conflictExcerpt;
  if (p && typeof p.passage === "string") return p.passage;
  return "";
}

function throwingModel() {
  return async () => {
    throw new Error("rewrite model must not be called");
  };
}

describe("B364 house style, source name, second passage, confirmation mark", () => {
  test("total return card proposes GBP 3,291 million not the glyph", async () => {
    const card = DOC.statements[0].qcCard;
    const excerpt = typeof card.primaryExcerpt === "string" ? card.primaryExcerpt : card.primaryExcerpt?.passage || "";
    assert.match(excerpt, /£3,291 million/);
    const pairs = findCandidatePairs(card.statement, excerpt);
    assert.equal(
      pairs.some((p) => p.from.raw === "GBP 3.3 million" && p.to.raw === "£3,291 million"),
      true
    );
    const result = await fillAction(
      {
        id: "S0:evidence:conflicting:0",
        disposition: "ACTION",
        statementId: "0",
        statement: card.statement,
        kind: "evidence",
        rule: "conflicting",
        thing1: null,
        thing1State: "NONE",
        thing2: "A source contradicts this statement.",
        primaryExcerpt: excerpt,
        suggestedDirection: null,
        sort: { policyPermit: true, silenceOnCard: false, rule: "conflicting", reasonCode: "permitted" },
        card: { primaryExcerpt: excerpt, supportSpans: card.supportSpans },
      },
      { callModel: throwingModel() }
    );
    assert.equal(result.proposedChange, "Replace 'GBP 3.3 million' with 'GBP 3,291 million'.");
    assert.match(result.resultingSentence, /GBP 3,291 million/);
    assert.equal(/£3,291 million/.test(result.proposedChange), false);
    assert.match(result.resultingSentence, /million/);
    assert.match(result.resultingSentence, /3,291/);
  });

  test("source figure already in ISO form is unchanged", () => {
    assert.equal(houseStyleOfferedToken("GBP 3,291 million"), "GBP 3,291 million");
    assert.equal(houseStyleOfferedToken("EUR 11.229 million"), "EUR 11.229 million");
    assert.equal(houseStyleOfferedToken("2026-05-26"), "26 May 2026");
  });

  test("UK government card names the party the source attributes the stance to", async () => {
    const self = sourceSelfNameFromSources(DOC.sources);
    assert.equal(self, "3i Group plc");
    const s14 = await replayCard(DOC, 14);
    assert.match(s14.evidenceSummary, /3i Group plc/);
    assert.match(
      s14.evidenceSummary,
      /The statement attributes this to the UK government; the source credits 3i Group plc\./
    );
    assert.equal(s14.displayVerdict, "conflict");
  }, 20000);

  test("a draft sentence written in the first person is unaffected", () => {
    const hit = actorMismatch({
      statement: "We remain cautious in the deployment of capital into new investment.",
      confirmingPassage: DOC.statements[14].qcCard.primaryExcerpt,
      sources: DOC.sources,
    });
    assert.equal(hit, null);
    const applied = applyActorOfTheAction({
      statement: "We remain cautious in the deployment of capital into new investment.",
      confirmingPassage: DOC.statements[14].qcCard.primaryExcerpt,
      sources: DOC.sources,
      hasConflict: false,
      displayVerdict: "supported_full",
      commentaryNotReviewed: false,
      evidenceSummary: "The source confirms the stance.",
    });
    assert.equal(applied, null);
  });

  test("a source with no self-identifying opening stands down", () => {
    assert.equal(readSourceSelfName("Quarterly trading update.\nRevenue was unchanged."), null);
    const hit = actorMismatch({
      statement: DOC.statements[14].qcCard.statement,
      confirmingPassage: "We remain cautious in the deployment of capital into new investment.",
      sources: [{ text: "Quarterly trading update.\nRevenue was unchanged." }],
    });
    assert.equal(hit, null);
  });

  test("wrong-actor and role-party stand-downs still hold", () => {
    const vocab = sourceNameVocabulary(CLEAN.sources);
    const actionPassage = DOC.statements[8].qcCard.primaryExcerpt;
    assert.equal(
      actorMismatch({
        statement: CLEAN.statements[8].qcCard.statement,
        confirmingPassage: actionPassage,
        sources: CLEAN.sources,
      }),
      null
    );
    assert.equal(leadingActor(CLEAN.statements[10].qcCard.statement, vocab).standDown, "no_actor");
    assert.equal(
      applyActorOfTheAction({
        statement: "We completed a pro-rata redemption of shares",
        confirmingPassage: actionPassage,
        sources: CLEAN.sources,
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
        statement: DOC.statements[8].qcCard.statement,
        confirmingPassage: actionPassage,
        sources: CLEAN.sources,
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
  });

  test("private equity card shows one passage; no second quote without claim terms", async () => {
    for (const payload of [CLEAN, DOC]) {
      const s1 = await replayCard(payload, 1);
      const primary = primaryText(s1);
      const second = conflictText(s1);
      assert.match(primary, /£3,234 million/);
      assert.match(primary, /14%/);
      assert.equal(second.trim(), "");
      assert.equal(/The total return of 13%/.test(primary), false);
    }
  }, 20000);

  test("no card in either payload shows a second passage with none of the claim terms", async () => {
    const { statementNeedles } = await import("../lib/qc/excerpt-sentences.mjs");
    const { normalizeExcerptText } = await import("../lib/qc/excerpt-pair.mjs");
    for (const payload of [CLEAN, DOC]) {
      const tag = payload === CLEAN ? "CLEAN" : "DOC";
      for (let i = 0; i < payload.statements.length; i += 1) {
        const card = await replayCard(payload, i);
        const second = conflictText(card);
        if (!second.trim()) continue;
        const needles = statementNeedles(payload.statements[i].qcCard.statement);
        const hay = normalizeExcerptText(second);
        const hit = needles.some((n) => hay.includes(String(n).toLowerCase()));
        assert.equal(hit, true, `${tag} S${i} second passage has no claim term`);
      }
    }
  }, 30000);

  test("October card quote supports the two financing transactions the comment names", async () => {
    const s6 = await replayCard(CLEAN, 6);
    assert.match(primaryText(s6), /two financing transactions/);
    assert.match(s6.evidenceSummary, /two financing transactions/);
  }, 20000);

  test("confirmation inside a conflict is marked Separately", async () => {
    const live =
      "The periods do not match, leading to a conflict in the reported figures. Additionally, the source confirms a like-for-like sales growth of 6.3%, which aligns with the statement.";
    const marked = markConfirmingInsideConflict(live);
    assert.match(marked, /Separately, the source confirms a like-for-like sales growth of 6\.3%/);
    assert.equal(/Additionally,/.test(marked), false);
    const green = await replayCard(CLEAN, 7);
    assert.match(green.evidenceSummary, /Additionally, the source verifies/);
    assert.equal(green.displayVerdict, "supported_full");
  }, 20000);

  test("Stage 5 prompt tells a non-green card to lead with the finding", () => {
    assert.match(STAGE5, /Lead with the finding on a card that is not green/);
    assert.match(STAGE5, /Do not open by restating the draft/);
    assert.match(STAGE5, /still address every `claimInventory` item/);
    assert.match(STAGE5, /never assert support the excerpts do not carry/);
  });
});
