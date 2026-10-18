/**
 * B403C. Benchmark words are facts. States carry a tier. A busy year shows a count.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "vitest";
import { BENCHMARK_WORDS, extractElements } from "../lib/qc/b394-elements.mjs";
import {
  DATE_EXTRACT_LIMIT,
  WELL_SOURCED_LINE,
  buildFacts,
  draftHeader,
  missingBenchmarkCard,
  sentenceTier,
  shownOccurrences,
} from "../lib/qc/reading-contract.mjs";

const LEDGER = readFileSync(new URL("../scripts/diagnostic/b403c/CLEAN-LEDGER.md", import.meta.url), "utf8");

describe("B403C benchmark words and tiers", () => {
  test("the ledger keeps three firm errors, one soft, and two rejected", () => {
    assert.match(LEDGER, /Firm errors, 3/);
    assert.match(LEDGER, /3i clean S0/);
    assert.match(LEDGER, /HICL clean S1/);
    assert.match(LEDGER, /HICL clean S2/);
    assert.match(LEDGER, /Soft, 1/);
    assert.match(LEDGER, /3i clean S11/);
    assert.match(LEDGER, /3i clean S6/);
    assert.match(LEDGER, /GP Industries clean S3/);
    assert.match(LEDGER, /not extended/);
  });

  test("budgets is not_found and the fact carries the source word and its line", () => {
    const source = ["The prior line.", "EBITDA in line with expectations.", "The next line."].join("\n");
    const facts = buildFacts({
      statement: "EBITDA in line with budgets.",
      draft: "EBITDA in line with budgets.",
      sourceText: source,
    });
    const budgets = facts.find((row) => row.kind === "benchmark");
    assert.ok(budgets);
    assert.equal(budgets.surface, "budgets");
    assert.equal(budgets.status, "not_found");
    const card = missingBenchmarkCard(budgets);
    assert.equal(card.missing, "budgets, not in the source");
    assert.equal(card.source.length, 1);
    assert.equal(card.source[0].word, "expectations");
    assert.equal(card.source[0].lineId, "L2");
    assert.match(card.source[0].extract, /expectations/);
    assert.equal(JSON.stringify(budgets).includes("not in the source"), false);
  });

  test("several is not an element and a matched benchmark keeps its line", () => {
    const elements = extractElements("Action completed several financing transactions.", "", "");
    assert.equal(elements.some((row) => row.surface.toLowerCase() === "several"), false);
    const facts = buildFacts({
      statement: "In line with expectations.",
      draft: "In line with expectations.",
      sourceText: "Delivering EBITDA in line with expectations.",
    });
    const hit = facts.find((row) => row.kind === "benchmark");
    assert.equal(hit.status, "matched");
    assert.equal(hit.occurrenceCount, hit.occurrences.length);
    assert.match(hit.extract, /expectations/);
    assert.equal(BENCHMARK_WORDS.includes("outlook"), false);
    const compound = extractElements("The license covers MRI-guidance workflows.", "", "");
    assert.equal(compound.some((row) => row.kind === "benchmark"), false);
  });

  test("tiers and the header keep wording out of both counts", () => {
    assert.equal(sentenceTier("not_in_source"), "demands");
    assert.equal(sentenceTier("conflicts"), "demands");
    assert.equal(sentenceTier("note_withheld"), "demands");
    assert.equal(sentenceTier("beyond"), "light");
    assert.equal(sentenceTier("nothing_to_raise"), "quiet");
    const header = draftHeader([
      { facts: [{ status: "matched" }], sentenceState: "conflicts", note: { bucket: "conflicts" } },
      { facts: [{ status: "matched" }], sentenceState: "beyond", note: { bucket: "beyond" } },
      { facts: [{ status: "matched" }], sentenceState: "beyond", note: { bucket: "beyond" } },
      { facts: [{ status: "matched" }], sentenceState: "nothing_to_raise", note: { bucket: "wording" } },
      { facts: [{ status: "matched" }], sentenceState: "nothing_to_raise", note: { bucket: "wording" } },
      { facts: [{ status: "matched" }], sentenceState: "nothing_to_raise", note: { bucket: "wording" } },
    ]);
    assert.equal(header.numbers, "6 of 6 facts matched · 1 to look at · 2 worth a glance · 3 wording notes");
    assert.match(header.line, /1 statement conflicts/);
    const quiet = draftHeader([
      { facts: [{ status: "matched" }], sentenceState: "nothing_to_raise", note: { bucket: "wording" } },
    ]);
    assert.equal(quiet.line, WELL_SOURCED_LINE);
    const glanceOnly = draftHeader([{ facts: [{ status: "matched" }], sentenceState: "beyond", note: { bucket: "beyond" } }]);
    assert.match(glanceOnly.line, /goes further/);
    const mixed = draftHeader([
      { facts: [{ status: "matched" }], sentenceState: "beyond", note: { bucket: "beyond" } },
      { facts: [{ status: "matched" }], sentenceState: "nothing_to_raise", note: { bucket: "wording" } },
    ]);
    assert.equal(mixed.line, null);
  });

  test("a date above the limit shows the count and no extracts", () => {
    const occurrences = Array.from({ length: DATE_EXTRACT_LIMIT + 1 }, (_, index) => ({
      lineId: `L${index + 1}`,
      extract: `year line ${index}`,
    }));
    const card = shownOccurrences({ kind: "date", occurrenceCount: occurrences.length, occurrences });
    assert.equal(card.countOnly, true);
    assert.equal(card.shown.length, 0);
    assert.equal(card.occurrenceCount, DATE_EXTRACT_LIMIT + 1);
    const kept = shownOccurrences({ kind: "date", occurrenceCount: DATE_EXTRACT_LIMIT, occurrences: occurrences.slice(0, DATE_EXTRACT_LIMIT) });
    assert.equal(kept.countOnly, false);
    assert.equal(kept.shown.length, 3);
  });
});
