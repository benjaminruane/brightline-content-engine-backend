import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { assembleCard } from "../lib/qc/pipeline-v3/stage7-assemble-card.mjs";
import {
  buildFramingFidelityConcern,
  collectFramingEvidence,
  detectFramingFidelity,
  hasPotentialFramingJudgment,
} from "../lib/qc/framing-fidelity.mjs";

describe("framing-fidelity detector", () => {
  test("fires on evaluative contradiction when the judge says it overstates the source", async () => {
    const det = await detectFramingFidelity({
      statement: "The business has a defensible position.",
      passages: ["Defensibility is uncertain."],
      evidenceSummary: "The source says defensibility is uncertain.",
      runJudge: async () => ({
        fire: true,
        evaluativePhrase: "defensible position",
        sourceStance: "defensibility is uncertain",
        note: "The source says defensibility is uncertain, not defensible — confirm the wording is fair.",
        reason: "clear contradiction",
      }),
    });
    assert.equal(det.fire, true);
    assert.equal(det.evaluativePhrase, "defensible position");
    assert.match(det.note, /uncertain/);
  });

  test("is quiet on mild praise when the judge treats it as fair colour", async () => {
    const det = await detectFramingFidelity({
      statement: "The company has strong growth.",
      passages: ["Revenue grew 36% year on year."],
      runJudge: async () => ({
        fire: false,
        evaluativePhrase: "",
        sourceStance: "",
        note: "",
        reason: "",
      }),
    });
    assert.equal(det.fire, false);
  });

  test("is quiet on forward-looking contradiction without evaluative framing", async () => {
    const det = await detectFramingFidelity({
      statement: "We expect a specific investment over the coming months.",
      passages: ["We are not yet in dialogue with any specific company."],
      runJudge: async () => {
        throw new Error("judge should not run for non-evaluative forward claims");
      },
    });
    assert.equal(det.fire, false);
  });

  test("is quiet on pure factual statements", async () => {
    const det = await detectFramingFidelity({
      statement: "The company generated EUR 92 million of revenue in FY2024.",
      passages: ["The company generated EUR 92 million of revenue in FY2024."],
      runJudge: async () => {
        throw new Error("judge should not run for factual-only statements");
      },
    });
    assert.equal(det.fire, false);
  });

  test("collects matched passages for the judge", () => {
    const evidence = collectFramingEvidence({
      excerptResult: { primaryExcerpt: { passage: "Primary support." } },
      supportSpans: [{ passage: "Span support." }, { passage: "Primary support." }],
      commentaryResult: { commentary: "Reasoning text." },
    });
    assert.deepEqual(evidence.passages, ["Primary support.", "Span support."]);
    assert.equal(evidence.evidenceSummary, "Reasoning text.");
  });

  test("detects candidate evaluative language conservatively", () => {
    assert.equal(hasPotentialFramingJudgment("The company has a defensible position."), true);
    assert.equal(hasPotentialFramingJudgment("The company generated EUR 92 million of revenue."), false);
    assert.equal(hasPotentialFramingJudgment("Utilisation has reached a record 88 per cent."), true);
  });

  test("fires on unevidenced record without calling the judge", async () => {
    const det = await detectFramingFidelity({
      statement: "Utilisation has reached a record 88 per cent.",
      passages: ["Utilisation has reached 88 per cent."],
      runJudge: async () => {
        throw new Error("judge should not run for unevidenced superlatives");
      },
    });
    assert.equal(det.fire, true);
    assert.equal(det.evaluativePhrase, "record");
    assert.match(det.note, /record/);
  });

  test("is quiet when the source itself uses record", async () => {
    const det = await detectFramingFidelity({
      statement: "Utilisation has reached a record 88 per cent.",
      passages: ["Utilisation has reached a record 88 per cent."],
      runJudge: async () => {
        throw new Error("judge should not run when the superlative is evidenced");
      },
    });
    assert.equal(det.fire, false);
  });
});

describe("stage7 framing-fidelity emit", () => {
  test("emits additive concern without changing verdict", async () => {
    const statement = "The business is dominant in the Nordics.";
    const card = await assembleCard(
      {
        statementText: statement,
        startChar: 0,
        endChar: statement.length,
        supportSpans: [{ passage: "The company is strong in Sweden and under-represented elsewhere." }],
        sourceMatches: [{ sourceIndex: 0, classification: "confirmed", sourceLabel: "source" }],
        verdictResult: {
          verdict: "confirmed",
          hasConflict: false,
          confirmingMatches: [{ sourceIndex: 0, sourceLabel: "source" }],
          contributingSourceIndices: [0],
        },
        excerptResult: {
          primaryExcerpt: {
            passage: "The company is strong in Sweden and under-represented elsewhere.",
            sourceLabel: "source",
          },
        },
        commentaryResult: { commentary: "The source supports Sweden strength, not Nordic dominance." },
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
        framingFidelityJudge: async () => ({
          fire: true,
          evaluativePhrase: "dominant in the Nordics",
          sourceStance: "strong in Sweden and under-represented elsewhere",
          note: "The source says strong in Sweden but under-represented elsewhere, not dominant across the Nordics — confirm the wording is fair.",
          reason: "clear overstatement",
        }),
      }
    );
    assert.equal(card.supportState, "supported");
    assert.equal(card.displayVerdict, "supported_full");
    assert.equal(card.concernLevel, "none");
    assert.equal(card.editorialVerdict, "clean");
    assert.deepEqual(card.editorialConcerns, []);
    assert.deepEqual(card.complianceConcerns, []);
    assert.equal(card.framingFidelityConcerns.length, 1);
    assert.deepEqual(
      card.framingFidelityConcerns[0],
      buildFramingFidelityConcern({
        statement,
        note: "The source says strong in Sweden but under-represented elsewhere, not dominant across the Nordics — confirm the wording is fair.",
      })
    );
    assert.equal(card.materiality.level, "material");
  });

  test("unevidenced record is editorial only and does not change the evidence verdict", async () => {
    const statement = "Utilisation has reached a record 88 per cent.";
    const card = await assembleCard(
      {
        statementText: statement,
        startChar: 0,
        endChar: statement.length,
        supportSpans: [{ passage: "Utilisation has reached 88 per cent." }],
        sourceMatches: [{ sourceIndex: 0, classification: "confirmed", sourceLabel: "source" }],
        verdictResult: {
          verdict: "confirmed",
          hasConflict: false,
          confirmingMatches: [{ sourceIndex: 0, sourceLabel: "source" }],
          contributingSourceIndices: [0],
        },
        excerptResult: {
          primaryExcerpt: {
            passage: "Utilisation has reached 88 per cent.",
            sourceLabel: "source",
          },
        },
        commentaryResult: { commentary: "The source confirms 88 per cent utilisation." },
        editorialResult: {
          editorialVerdict: "clean",
          editorialConcerns: [],
        },
      },
      { pipelineRoute: "v4" }
    );
    assert.equal(card.supportState, "supported");
    assert.equal(card.hasConflict, false);
    assert.equal(card.editorialVerdict, "clean");
    assert.equal(card.framingFidelityConcerns.length, 1);
    assert.match(card.framingFidelityConcerns[0].note, /record/);
  });
});
