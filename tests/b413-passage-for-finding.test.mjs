import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "vitest";
import {
  resultingClaimSupported,
  sourceSentenceContaining,
  verifiedProposalEntries,
} from "../lib/qc/proposal-check.mjs";

const HICL = readFileSync(
  new URL("./fixtures/real-runs-2026-10-04-hicl/source-hicl-interim-extracted.txt", import.meta.url),
  "utf8"
);

const IN_LINE = "Across the portfolio, growth investments continue to perform well, with significant investment in expansion programs driving EBITDA growth that continues to perform in line with budgets.";
const OUTPERFORM = "Across the portfolio, growth investments continue to perform well, with significant investment in expansion programs driving EBITDA growth that continues to significantly outperform budgets.";

describe("B413 the passage is the one the finding is about", () => {
  test("the passage contains the counterpart and does not start mid-name", () => {
    const passage = sourceSentenceContaining(HICL, "London St. Pancras High Speed");
    assert.match(passage, /London St\. Pancras High Speed/);
    assert.equal(passage.startsWith("Pancras"), false);
    assert.match(passage, /performed well/);
  });

  test("a proposal is offered only when the resulting sentence is a claim the source supports", () => {
    // "in line with budgets" becomes "in line with expectations". Offered.
    // "significantly outperform budgets" becomes "significantly outperform expectations",
    // which the source does not say. Not offered, even though the wrong word is known.
    const sourceLine = sourceSentenceContaining(HICL, "in line with expectations");
    assert.equal(resultingClaimSupported(IN_LINE, sourceLine), true);
    assert.equal(resultingClaimSupported(OUTPERFORM, sourceLine), false);
    const budgets = IN_LINE.indexOf("budgets");
    const offered = verifiedProposalEntries({
      enabled: true,
      sourceText: HICL,
      statements: [{
        qcCard: {
          index: 2,
          statement: IN_LINE,
          primaryExcerpt: "Portfolio performance in line with expectations.",
          readingNote: { replacements: [{ index: 0, text: "expectations" }] },
          readingFacts: [{ kind: "benchmark", status: "not_found", surface: "budgets", start: budgets, end: budgets + "budgets".length }],
        },
      }],
    });
    assert.equal(offered.length, 1);
    assert.match(offered[0].resultingSentence, /in line with expectations/);
    const outperformAt = OUTPERFORM.indexOf("budgets");
    const withheld = verifiedProposalEntries({
      enabled: true,
      sourceText: HICL,
      statements: [{
        qcCard: {
          index: 2,
          statement: OUTPERFORM,
          primaryExcerpt: "Portfolio performance in line with expectations.",
          readingNote: { replacements: [{ index: 0, text: "expectations" }] },
          readingFacts: [{ kind: "benchmark", status: "not_found", surface: "budgets", start: outperformAt, end: outperformAt + "budgets".length }],
        },
      }],
    });
    assert.equal(withheld.length, 0);
  });

  test("a card with no passage shows the line the proposal came from", () => {
    const statement = "Meanwhile, Affinity Water appointed a new CFO.";
    const at = statement.indexOf("CFO");
    const entries = verifiedProposalEntries({
      enabled: true,
      sourceText: HICL,
      statements: [{
        qcCard: {
          index: 7,
          statement,
          primaryExcerpt: null,
          readingNote: { replacements: [{ index: 0, text: "Chief Executive Officer" }] },
          readingFacts: [{ kind: "name", status: "not_found", surface: "CFO", start: at, end: at + 3 }],
        },
      }],
    });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].passageLabel, "Line it came from");
    assert.match(entries[0].quotedPassage, /Chief Executive Officer/);
    assert.match(entries[0].resultingSentence, /CEO/);
  });
});
