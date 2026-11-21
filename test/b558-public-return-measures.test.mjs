/**
 * B558. A public draft may not paraphrase a return that only a restricted source states.
 * Decision 1.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { figuresMissingFromPublicSources, settlePublicDraft } from "../lib/style-guide/public-figures.mjs";

const SENTENCE = "Halden Group's cumulative distributions from Kestrel Partners Fund IV exceed contributed capital, with distributions now above a 1.0x DPI.";

const sources = [
  { name: "32_kestrel_distribution_notice.txt", publicationState: "restricted", text: "The fund's DPI is 1.22x." },
  { name: "33_kestrel_harbourline_press_release.txt", publicationState: "published_external", text: "The fund sold a stake in Harbourline Foods." },
];

test("a paraphrased DPI is confidential when only a restricted source states it", async () => {
  const found = figuresMissingFromPublicSources(SENTENCE, sources);
  const surfaces = found.map((row) => row.surface);
  assert.equal(surfaces.includes("exceed contributed capital"), true);
  assert.equal(surfaces.includes("DPI"), true);
  assert.equal(surfaces.includes("1.0x"), true);
  let calls = 0;
  const settled = await settlePublicDraft({
    draft: SENTENCE,
    sources,
    visibility: "PUBLIC",
    regenerate: async (figures) => {
      calls += 1;
      assert.equal(figures.some((row) => row.surface === "exceed contributed capital"), true);
      return SENTENCE;
    },
  });
  assert.equal(calls, 1);
  assert.equal(settled.text, SENTENCE);
  assert.match(settled.note, /exceed contributed capital/);
  assert.match(settled.note, /DPI/);
});

test("the same paraphrase passes when a public source states that DPI", async () => {
  const publicSources = [
    { name: "Press release", publicationState: "published_external", text: "Kestrel Partners Fund IV reported a DPI of 1.22x." },
  ];
  const found = figuresMissingFromPublicSources(SENTENCE, publicSources);
  assert.equal(found.length, 0);
  const settled = await settlePublicDraft({
    draft: SENTENCE,
    sources: publicSources,
    visibility: "public",
    regenerate: async () => {
      throw new Error("a public return must not be regenerated");
    },
  });
  assert.equal(settled.regenerated, false);
  assert.equal(settled.note, "");
});
