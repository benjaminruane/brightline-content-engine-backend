/**
 * B559. A public draft may use a percentage, multiple, or money amount
 * only when a public source states it. Counts and dates stay.
 * Decision 1.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { figuresMissingFromPublicSources, settlePublicDraft } from "../lib/style-guide/public-figures.mjs";

const DRAFT = [
  "HPIF's 13 software holdings fell by an average of 6%, after a ~26% decline in public SaaS equities.",
  "Co-Investment 15 declined 47.2%. Western Veterinary Partners rose 45.2%.",
  "The fund ended the first quarter of 2026 with 57 companies.",
].join(" ");

const FIGURES = ["6%", "~26%", "47.2%", "45.2%"];

test("row 11 percentages fail when the only source is restricted, and counts and dates stay", async () => {
  const sources = [{
    name: "hpif-report-march-2026.pdf",
    publicationState: "restricted",
    text: "Holdings fell 6%. SaaS equities declined 26%. Co-Investment 15 declined 47.2%. Western Veterinary Partners rose 45.2%.",
  }];
  const found = figuresMissingFromPublicSources(DRAFT, sources);
  const surfaces = found.map((row) => row.surface);
  for (const figure of FIGURES) assert.equal(surfaces.includes(figure), true, figure);
  assert.equal(surfaces.some((item) => item === "13" || item === "57"), false);
  assert.equal(surfaces.some((item) => /2026|quarter/i.test(item)), false);
  let calls = 0;
  const settled = await settlePublicDraft({
    draft: DRAFT,
    sources,
    visibility: "PUBLIC",
    regenerate: async (figures) => {
      calls += 1;
      assert.equal(figures.some((row) => row.surface === "45.2%"), true);
      return DRAFT;
    },
  });
  assert.equal(calls, 1);
  assert.equal(settled.text, DRAFT);
  assert.match(settled.note, /45\.2%/);
});

test("the same percentages pass when a public source states them", async () => {
  const sources = [{
    name: "HPIF release",
    publicationState: "published_external",
    text: "Holdings fell 6%. SaaS equities declined ~26%. Co-Investment 15 declined 47.2%. Western Veterinary Partners +45.2%.",
  }];
  const found = figuresMissingFromPublicSources(DRAFT, sources);
  assert.equal(found.length, 0);
  const settled = await settlePublicDraft({
    draft: DRAFT,
    sources,
    visibility: "public",
    regenerate: async () => {
      throw new Error("a public figure must not be regenerated");
    },
  });
  assert.equal(settled.regenerated, false);
});

test("a billions form matches the currency code and the rounded millions", () => {
  const draft = "The fund reported GBP 1.2 billion. The other pool was GBP 5.0 billion.";
  const sources = [{
    name: "Press release",
    publicationState: "published_external",
    text: "Assets were £1,200 million. The other pool was £5 billion.",
  }];
  assert.equal(figuresMissingFromPublicSources(draft, sources).length, 0);
  const crossed = figuresMissingFromPublicSources("The fund reported USD 1.2 billion.", sources);
  assert.equal(crossed.length, 1);
  assert.equal(crossed[0].surface, "USD 1.2 billion");
});
