import assert from "node:assert/strict";
import { describe, test } from "vitest";
import {
  fitReplacement,
  introducedBannedWords,
  newEditorialFindings,
  proposalHouseChecks,
  verifiedProposalEntries,
} from "../lib/qc/proposal-check.mjs";

const HICL = "Affinity Water appointed Mark Garth as Chief Executive Officer. The UK Government published a paper. EBITDA in line with expectations.";
const FIGURE = "Total return of £3,291 million or 13% on opening shareholders' funds.";
const DATE = "SOLANA BEACH, Calif., May 13, 2026. ClearPoint Neuro announced results.";

describe("B412 proposal form and house rules", () => {
  test("a month stays a month", () => {
    const fact = { kind: "date", status: "not_found", surface: "April 2026" };
    assert.equal(fitReplacement(fact, "May 13, 2026", DATE), "May 2026");
    const sentence = "ClearPoint Neuro announced in April 2026 its results.";
    const check = proposalHouseChecks({
      statement: sentence,
      fact: { ...fact, start: sentence.indexOf("April 2026"), end: sentence.indexOf("April 2026") + "April 2026".length },
      replacement: "May 2026",
      sourceText: DATE,
      passage: "May 13, 2026",
      bannedWords: [],
    });
    assert.equal(check.resulting, "ClearPoint Neuro announced in May 2026 its results.");
  });

  test("an abbreviation stays an abbreviation", () => {
    const fact = { kind: "name", status: "not_found", surface: "CFO" };
    assert.equal(fitReplacement(fact, "Chief Executive Officer", HICL), "CEO");
  });

  test("a figure keeps the draft currency and the scale word", () => {
    const fact = { kind: "figure", status: "not_found", surface: "GBP 3.3 million" };
    assert.equal(fitReplacement(fact, "£3,291 million", FIGURE), "GBP 3,291 million");
  });

  test("a banned word introduced by the replacement is dropped", () => {
    const statement = "The stake was bought from AGIC.";
    const banned = introducedBannedWords(statement, "The stake was bought from GIC.", ["gic"]);
    assert.deepEqual(banned, ["gic"]);
    const check = proposalHouseChecks({
      statement,
      fact: { kind: "name", status: "not_found", surface: "AGIC", start: statement.indexOf("AGIC"), end: statement.indexOf("AGIC") + 4 },
      replacement: "GIC",
      sourceText: "acquired from GIC",
      passage: "acquired from GIC",
      bannedWords: ["gic"],
    });
    assert.equal(check.offered, false);
    assert.match(check.reasons.join(" "), /banned/);
  });

  test("a new long sentence is an editorial finding", () => {
    const original = "The update was short.";
    const resulting = `${"word ".repeat(41)}end.`;
    assert.deepEqual(newEditorialFindings(original, resulting), ["sentence_length"]);
  });

  test("a card with no passage quotes the line the proposal came from", () => {
    const entries = verifiedProposalEntries({
      enabled: true,
      sourceText: HICL,
      statements: [{
        qcCard: {
          index: 7,
          statement: "Affinity Water appointed a new CFO.",
          primaryExcerpt: null,
          readingNote: { replacements: [{ index: 0, text: "Chief Executive Officer" }] },
          readingFacts: [{ kind: "name", status: "not_found", surface: "CFO", start: 31, end: 34 }],
        },
      }],
    });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].passageLabel, "Line it came from");
    assert.match(entries[0].quotedPassage, /Chief Executive Officer/);
    assert.equal(entries[0].resultingSentence, "Affinity Water appointed a new CEO.");
  });
});
