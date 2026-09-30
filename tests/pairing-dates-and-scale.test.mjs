/**
 * B352 Part 2. Dates and scale words in the pairing.
 * Strings from tests/fixtures/real-runs-2026-09-29/. No paraphrases.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "vitest";

import { findCandidatePairs } from "../lib/revise-actions/conflict-engagement.mjs";
import { fillAction } from "../lib/revise-actions/run.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_DIR = path.join(ROOT, "tests/fixtures/real-runs-2026-09-29");
const DOC = JSON.parse(readFileSync(path.join(FIXTURE_DIR, "doc-review.json"), "utf8"));

const A3_STATEMENT =
  "On the commercial front, Action added 119 new stores in Denmark over the period and remains on track to meet its target of 330 new stores for by end-2025.";
const A3_EXCERPT =
  "Action added 119 new stores to the end of P6 (YTD P6 2023: 90) and remains on track to meet its target of 330 stores added this year.";
const SLUG = "conflict_suppressed_figure_agrees";

function throwingModel() {
  return async () => {
    throw new Error("rewrite model must not be called");
  };
}

function conflictEntry(id, fixture, extra = {}) {
  return {
    id,
    disposition: "ACTION",
    statementId: "0",
    statement: fixture.statement,
    kind: "evidence",
    rule: "conflicting",
    thing1: null,
    thing1State: "NONE",
    thing2: fixture.thing2 || "A source contradicts this statement.",
    primaryExcerpt: fixture.primaryExcerpt,
    suggestedDirection: null,
    sort: {
      policyPermit: true,
      silenceOnCard: false,
      rule: "conflicting",
      reasonCode: "permitted",
    },
    ...extra,
  };
}

function excerptOf(card) {
  const p = card.primaryExcerpt;
  if (typeof p === "string") return p;
  return p?.passage || "";
}

describe("B352 pairing dates and scale", () => {
  test("T5 doctored S0 offers the million figure in the displayed excerpt, not a date", async () => {
    const card = DOC.statements[0].qcCard;
    const statement = card.statement;
    const excerpt = excerptOf(card);
    assert.match(statement, /GBP 3\.3 million/);
    assert.match(statement, /30 June 2025/);
    assert.match(excerpt, /£3,291 million/);
    assert.equal(/30 September 2025/.test(excerpt), false);

    const pairs = findCandidatePairs(statement, excerpt);
    assert.equal(
      pairs.some((p) => p.from.raw === "GBP 3.3 million" && p.to.raw === "£3,291 million"),
      true,
      JSON.stringify(pairs.map((p) => ({ from: p.from.raw, to: p.to.raw })))
    );
    assert.equal(
      pairs.some((p) => p.from.kind === "date"),
      false,
      "date is not in the displayed passage"
    );

    const result = await fillAction(
      conflictEntry("S0:evidence:conflicting:0", { statement, primaryExcerpt: excerpt }, {
        card: { primaryExcerpt: excerpt, supportSpans: card.supportSpans },
      }),
      { callModel: throwingModel() }
    );
    assert.equal(result.disposition, "ACTION");
    assert.equal(result.provenance, "derived");
    assert.equal(result.proposedChange, "Replace 'GBP 3.3 million' with '£3,291 million'.");
    assert.match(result.resultingSentence, /£3,291 million/);
    assert.equal(/30 September 2025/.test(result.proposedChange || ""), false);
    assert.match(result.resultingSentence, /30 June 2025/);
  });

  test("T6 a date correction fires where the source date is in the displayed passage", async () => {
    const statement = "The company reported results for the six months to 30 June 2025.";
    const excerpt = "The company reported results for the six months to 30 September 2025.";
    const pairs = findCandidatePairs(statement, excerpt);
    assert.equal(pairs.length, 1);
    assert.equal(pairs[0].from.raw, "30 June 2025");
    assert.equal(pairs[0].to.raw, "30 September 2025");

    const result = await fillAction(
      conflictEntry("T6:evidence:conflicting:0", { statement, primaryExcerpt: excerpt }),
      { callModel: throwingModel() }
    );
    assert.equal(result.disposition, "ACTION");
    assert.equal(result.proposedChange, "Replace '30 June 2025' with '30 September 2025'.");
    assert.equal(
      result.resultingSentence,
      "The company reported results for the six months to 30 September 2025."
    );
  });

  test("T7 an ambiguous date binding produces no proposal", async () => {
    const statement = "The company reported results for the six months to 30 June 2025.";
    const excerpt =
      "The company reported results for the six months to 30 September 2025. The company reported results for the six months to 31 March 2025.";
    const pairs = findCandidatePairs(statement, excerpt);
    assert.equal(pairs.some((p) => p.from.kind === "date"), false);

    const result = await fillAction(
      conflictEntry("T7:evidence:conflicting:0", { statement, primaryExcerpt: excerpt }),
      { callModel: throwingModel() }
    );
    assert.equal(result.disposition, "ACKNOWLEDGE");
    assert.equal(result.proposedChange, undefined);
    assert.equal(result.resultingSentence, undefined);
  });

  test("T8 B336 suppression and B345 visibility still hold", async () => {
    const pairs = findCandidatePairs(A3_STATEMENT, A3_EXCERPT);
    assert.equal(
      pairs.some((p) => p.from.raw === "119" && p.to.raw === "330"),
      false
    );
    const result = await fillAction(
      conflictEntry("T8:evidence:conflicting:0", { statement: A3_STATEMENT, primaryExcerpt: A3_EXCERPT }),
      { callModel: throwingModel() }
    );
    assert.equal(result.disposition, "ACKNOWLEDGE");
    assert.equal(result.explainCode, SLUG);
    assert.equal(result.proposedChange, undefined);

    const s1Statement = "Like-for-like sales growth reached 12% for the period";
    const pairing = 'In the six months to the end of Action\'s P6 (ending 30 June 2024), like-for-like ("LFL") sales growth was 9.0%.';
    const displayed = "In the six months to the end of Action's P6, like-for-like sales growth was discussed.";
    const visiblePairs = findCandidatePairs(s1Statement, pairing);
    assert.equal(visiblePairs.length, 1);
    assert.equal(visiblePairs[0].to.raw, "9.0%");
    assert.equal(displayed.includes("9.0%"), false);
    const hidden = await fillAction(
      conflictEntry(
        "T8b:evidence:conflicting:0",
        { statement: s1Statement, primaryExcerpt: pairing },
        { card: { primaryExcerpt: displayed } }
      ),
      { callModel: throwingModel() }
    );
    assert.equal(hidden.disposition, "ACKNOWLEDGE");
    assert.equal(hidden.proposedChange, undefined);
  });
});
