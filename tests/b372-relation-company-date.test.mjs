/**
 * B372. Relation not spelling; "the company" may only suppress; look
 * for a same-subject date then compare.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";

import {
  causalRelationKey,
  passageHasCausalRelation,
  stemConnectiveToken,
} from "../lib/qc/causal-stem.mjs";
import {
  applyEditorialSourceAwareness,
  matchedPassagesFromCard,
} from "../lib/qc/editorial-source-awareness.mjs";
import {
  applyGenericCompanySuppress,
  partiesNamedIn,
  resolveGenericCompanyAntecedent,
} from "../lib/qc/generic-company.mjs";
import { sourceNameVocabulary } from "../lib/qc/actor-of-the-action.mjs";
import {
  appendDateSubjectSpans,
  dateSubjectFamily,
  dateValuesDiffer,
  locateDateSubjectSentence,
} from "../lib/qc/date-subject.mjs";
import {
  confirmingPassageVerdict,
  demoteConfirmedClassifications,
} from "../lib/qc/pipeline-v4/confirming-passage-disagrees.mjs";
import { assembleCard } from "../lib/qc/pipeline-v3/stage7-assemble-card.mjs";
import { selectExcerpts } from "../lib/qc/pipeline-v4/stage4-select-excerpts.mjs";
import { annotateTokens } from "../lib/revise-actions/conflict-engagement.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HICL_DIR = path.join(ROOT, "tests/fixtures/real-runs-2026-10-04-hicl");
const SEPT_DIR = path.join(ROOT, "tests/fixtures/real-runs-2026-09-29");
const OCT_DIR = path.join(ROOT, "tests/fixtures/real-runs-2026-10-02");

const HICL_CLEAN = JSON.parse(readFileSync(path.join(HICL_DIR, "clean-review.json"), "utf8"));
const HICL_DOC = JSON.parse(readFileSync(path.join(HICL_DIR, "doc-review.json"), "utf8"));
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
  if (fps.length === 0) return [];
  return fps.map((fp) => ({
    sourceIndex: Number.isFinite(fp.sourceIndex) ? fp.sourceIndex : 0,
    sourceLabel: fp.sourceLabel || label,
    classification: fp.classification,
    passage: pointer?.passage || "",
  }));
}

function draftStatementsOf(payload) {
  return payload.statements.map((s) => s.qcCard.statement);
}

function quoteBlob(card) {
  const primary = card.primaryExcerpt;
  const conflict = card.conflictExcerpt;
  const p = typeof primary === "string" ? primary : primary?.passage || "";
  const c = typeof conflict === "string" ? conflict : conflict?.passage || "";
  return `${p}\n${c}`;
}

function applyDatePath(payload, index) {
  const card = payload.statements[index].qcCard;
  const dated = appendDateSubjectSpans({
    statementText: card.statement,
    supportSpans: card.supportSpans,
    sources: payload.sources,
  });
  return demoteConfirmedClassifications({
    statementText: card.statement,
    sourceMatches: matchesFromCard(card, payload.sources),
    supportSpans: dated,
  });
}

async function replayCard(payload, index, extra = {}) {
  const card = payload.statements[index].qcCard;
  const sources = payload.sources;
  const dated = extra.supportSpans
    ? { supportSpans: extra.supportSpans, sourceMatches: extra.sourceMatches || matchesFromCard(card, sources) }
    : extra.applyDate
      ? applyDatePath(payload, index)
      : { supportSpans: card.supportSpans, sourceMatches: matchesFromCard(card, sources) };
  const hasConflictSpan = dated.supportSpans.some((s) => s.classification === "conflicting");
  const storedVerdict = supportStateToVerdict(card.supportState);
  const verdict = extra.verdict || (hasConflictSpan && extra.applyDate ? "conflicting" : storedVerdict);
  const hasConflict = extra.hasConflict != null ? extra.hasConflict : verdict === "conflicting" || card.hasConflict === true;
  const excerpts = selectExcerpts({
    statementMatches: dated.sourceMatches,
    verdict,
    hasConflict,
    supportSpans: dated.supportSpans,
    sources,
    statementText: card.statement,
  });
  return assembleCard(
    {
      statementText: card.statement,
      startChar: card.charStart,
      endChar: card.charEnd,
      supportSpans: dated.supportSpans,
      sourceMatches: dated.sourceMatches,
      verdictResult: {
        verdict,
        hasConflict,
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
      draftStatements: extra.draftStatements || draftStatementsOf(payload),
      reviewOptions: REVIEWS_ON,
      skipEditorialDuplicationJudge: true,
      framingFidelityJudge: silentFramingJudge,
      today: new Date("2026-10-04T00:00:00.000Z"),
    }
  );
}

function findingKey(card) {
  const codes = (card.editorialConcerns || [])
    .map((c) => c.concernCode || c.code || "")
    .filter(Boolean)
    .sort();
  return {
    displayVerdict: card.displayVerdict,
    displayVerdictReason: card.displayVerdictReason || "",
    codes,
  };
}

function gainedFinding(before, after) {
  if (before.displayVerdict !== "conflict" && after.displayVerdict === "conflict") return "verdict_conflict";
  if (!before.displayVerdictReason && after.displayVerdictReason) return after.displayVerdictReason;
  const extra = after.codes.filter((c) => !before.codes.includes(c));
  if (extra.length) return extra.join(",");
  return null;
}

describe("B372 part 1 causal stem", () => {
  test("suffix rule maps driven and driving to the same relation", () => {
    assert.equal(stemConnectiveToken("driven"), stemConnectiveToken("driving"));
    assert.equal(causalRelationKey("driven by"), causalRelationKey("driving"));
    assert.equal(passageHasCausalRelation("driven by", "capex programmes driving EBITDA growth"), true);
  });

  test("clean HICL S1 causal concern is dropped", () => {
    const card = HICL_CLEAN.statements[1].qcCard;
    const concern = (card.editorialConcerns || [])[0];
    assert.equal(concern.concernCode, "overreach_unsupported_causal");
    const after = applyEditorialSourceAwareness({
      statement: card.statement,
      concerns: [concern],
      passages: matchedPassagesFromCard({
        primaryExcerpt: card.primaryExcerpt,
        supportSpans: card.supportSpans,
      }),
      editorialVerdict: card.editorialVerdict,
    });
    assert.equal(after.concerns.length, 0);
    assert.equal(after.dropped.length, 1);
    assert.equal(after.dropped[0].family, "causal");
  });

  test("B355 3i driven primarily by still drops", () => {
    const card = SEPT_CLEAN.statements[12].qcCard;
    const concern = (card.editorialConcerns || [])[0];
    assert.equal(concern.concernCode, "overreach_unsupported_causal");
    const after = applyEditorialSourceAwareness({
      statement: card.statement,
      concerns: [concern],
      passages: matchedPassagesFromCard({
        primaryExcerpt: card.primaryExcerpt,
        supportSpans: card.supportSpans,
      }),
      editorialVerdict: card.editorialVerdict,
    });
    assert.equal(after.concerns.length, 0);
  });

  test("B355 returns of 14% across the entire portfolio still survives", () => {
    const statement = "The fund delivered returns of 14% across the entire portfolio.";
    const after = applyEditorialSourceAwareness({
      statement,
      concerns: [
        {
          concernCode: "marketing_language_excess",
          note: "The phrase 'returns of 14% across the entire portfolio' is not established.",
        },
      ],
      passages: ["the infrastructure asset portfolio delivered returns of 14% for the period"],
      editorialVerdict: "concern",
    });
    assert.equal(after.concerns.length, 1);
    assert.equal(after.dropped.length, 0);
  });

  test("constructed causal concern whose relation is absent still survives", () => {
    const after = applyEditorialSourceAwareness({
      statement: "EBITDA growth driven by capital expenditure.",
      concerns: [
        {
          concernCode: "overreach_unsupported_causal",
          note: "The phrase 'driven by' overstates causation.",
        },
      ],
      passages: ["Portfolio performance was in line with expectations and cash generation remained resilient."],
      editorialVerdict: "concern",
    });
    assert.equal(after.concerns.length, 1);
    assert.equal(after.dropped.length, 0);
  });
});

describe("B372 part 2 generic company", () => {
  test("clean HICL S6 comes back confirmed", async () => {
    const stored = HICL_CLEAN.statements[6].qcCard;
    assert.equal(stored.displayVerdict, "supported_partial");
    const vocab = sourceNameVocabulary(HICL_CLEAN.sources);
    assert.deepEqual(partiesNamedIn(HICL_CLEAN.statements[5].qcCard.statement, vocab), ["Fortysouth"]);
    const resolved = resolveGenericCompanyAntecedent({
      statement: stored.statement,
      precedingText: HICL_CLEAN.statements[5].qcCard.statement,
      vocabulary: vocab,
      confirmingPassages: [stored.primaryExcerpt],
    });
    assert.equal(resolved, "Fortysouth");
    const card = await replayCard(HICL_CLEAN, 6);
    assert.equal(card.displayVerdict, "supported_full");
    assert.equal(card.concernLevel, "none");
    assert.match(card.evidenceSummary, /Fortysouth/i);
    assert.equal(/\bhowever\b/i.test(card.evidenceSummary) && /\bnot\b/i.test(card.evidenceSummary), false);
  });

  test("no antecedent is unchanged", () => {
    const hit = applyGenericCompanySuppress({
      statement: "The company also recently completed an oversubscribed refinancing.",
      precedingText: "",
      sources: HICL_CLEAN.sources,
      confirmingPassages: [HICL_CLEAN.statements[6].qcCard.primaryExcerpt],
      displayVerdict: "supported_partial",
      displayVerdictReason: null,
      evidenceSummary: HICL_CLEAN.statements[6].qcCard.evidenceSummary,
    });
    assert.equal(hit, null);
  });

  test("two companies between the reference and its antecedent is unchanged", () => {
    const vocab = sourceNameVocabulary(HICL_CLEAN.sources);
    const withTower = new Set([...vocab, "TowerCo"]);
    const hit = resolveGenericCompanyAntecedent({
      statement: "The company also recently completed an oversubscribed refinancing.",
      precedingText: "TowerCo delivered 20 new towers during the past year.",
      vocabulary: withTower,
      confirmingPassages: [HICL_CLEAN.statements[6].qcCard.primaryExcerpt],
    });
    assert.equal(hit, null);
  });

  test("conflict is not lifted", () => {
    const stored = HICL_DOC.statements[6].qcCard;
    const hit = applyGenericCompanySuppress({
      statement: stored.statement,
      precedingText: HICL_DOC.statements[5].qcCard.statement,
      sources: HICL_DOC.sources,
      confirmingPassages: [stored.primaryExcerpt],
      displayVerdict: stored.displayVerdict,
      displayVerdictReason: stored.displayVerdictReason,
      evidenceSummary: stored.evidenceSummary,
    });
    assert.equal(hit, null);
  });

  test("no card in the four payloads gains a finding it does not have today", async () => {
    const payloads = [
      ["hicl-clean", HICL_CLEAN],
      ["hicl-doc", HICL_DOC],
      ["sept-clean", SEPT_CLEAN],
      ["sept-doc", SEPT_DOC],
    ];
    for (const [label, payload] of payloads) {
      for (let i = 0; i < payload.statements.length; i += 1) {
        const off = await replayCard(payload, i, { draftStatements: [] });
        const on = await replayCard(payload, i);
        const gained = gainedFinding(findingKey(off), findingKey(on));
        assert.equal(gained, null, `${label} S${i} gained ${gained}`);
        if (label === "hicl-clean" && i === 6) {
          assert.equal(off.displayVerdict, "supported_partial");
          assert.equal(on.displayVerdict, "supported_full");
          continue;
        }
        assert.equal(on.displayVerdict, off.displayVerdict, `${label} S${i} verdict moved`);
      }
    }
  });
});

describe("B372 part 3 date subject", () => {
  test("doctored HICL S0 is no longer Confirmed and names the source period", async () => {
    const stored = HICL_DOC.statements[0].qcCard;
    assert.equal(stored.displayVerdict, "supported_full");
    const located = locateDateSubjectSentence({
      statement: stored.statement,
      sourceText: HICL_DOC.sources[0].text,
    });
    assert.match(located.passage, /28 February 2026/);
    const afterDate = applyDatePath(HICL_DOC, 0);
    const added = afterDate.supportSpans.find((s) => s.dateSubjectAdded);
    assert.equal(added.classification, "conflicting");
    assert.match(added.passage, /1 October/);
    assert.match(added.passage, /28 February 2026/);
    const card = await replayCard(HICL_DOC, 0, { applyDate: true });
    assert.notEqual(card.displayVerdict, "supported_full");
    assert.match(quoteBlob(card), /28 February 2026/);
  });

  test("clean HICL S0 stays Confirmed and still shows the period passage", async () => {
    const stored = HICL_CLEAN.statements[0].qcCard;
    const afterDate = applyDatePath(HICL_CLEAN, 0);
    assert.equal(afterDate.supportSpans.length, stored.supportSpans.length);
    assert.equal(
      afterDate.supportSpans.every((s) => s.classification === "confirmed"),
      true
    );
    const card = await replayCard(HICL_CLEAN, 0, { applyDate: true });
    assert.equal(card.displayVerdict, "supported_full");
    assert.match(quoteBlob(card), /28 February 2026/);
    assert.match(quoteBlob(card), /1 October/);
  });

  test("3i payloads period findings are unchanged", () => {
    for (const payload of [SEPT_CLEAN, SEPT_DOC, OCT_DOC]) {
      for (let i = 0; i < payload.statements.length; i += 1) {
        const stored = payload.statements[i].qcCard;
        const after = applyDatePath(payload, i);
        const beforePassages = (stored.supportSpans || []).map((s) => `${s.classification}|${s.passage}`);
        const afterPassages = after.supportSpans.map((s) => `${s.classification}|${s.passage}`);
        assert.deepEqual(afterPassages, beforePassages, `3i S${i} date path moved a span`);
      }
    }
  });

  test("a statement with no date is unaffected", () => {
    const statement = "Operational performance across the portfolio was robust.";
    const spans = [{ classification: "confirmed", passage: "HICL has delivered robust operational performance during the period." }];
    const after = appendDateSubjectSpans({
      statementText: statement,
      supportSpans: spans,
      sources: HICL_CLEAN.sources,
    });
    assert.equal(after.length, 1);
    assert.equal(after[0].dateSubjectAdded, undefined);
    assert.equal(confirmingPassageVerdict(statement, spans[0].passage).demoteTo, null);
  });

  test("no date of that family in the source is not a conflict", () => {
    const statement = "Revenue for the five months to 28 February 1999 was ahead of plan.";
    const sources = [{ text: "The Board notes robust operational performance. Dividend cover remains in line with guidance.", label: "S" }];
    const located = locateDateSubjectSentence({ statement, sourceText: sources[0].text });
    assert.equal(located, null);
    const after = appendDateSubjectSpans({
      statementText: statement,
      supportSpans: [{ classification: "confirmed", passage: "The Board notes robust operational performance." }],
      sources,
    });
    assert.equal(after.some((s) => s.dateSubjectAdded), false);
    const demoted = demoteConfirmedClassifications({
      statementText: statement,
      supportSpans: after,
      sourceMatches: [],
    });
    assert.equal(demoted.supportSpans.every((s) => s.classification === "confirmed"), true);
  });

  test("year-end dates are not the same subject as a months-to period", () => {
    const draft = annotateTokens("performance for the five months to 28 February 2026").find((t) => t.kind === "date");
    const year = annotateTokens("target dividend for the year to 31 March 2027").find((t) => t.kind === "date");
    assert.equal(dateSubjectFamily(draft), "reporting_period");
    assert.equal(dateSubjectFamily(year), "year_end");
    assert.equal(dateValuesDiffer(draft, year), false);
  });
});
