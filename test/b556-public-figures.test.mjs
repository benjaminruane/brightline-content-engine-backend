/**
 * B556. A restricted figure in a public draft is named, regenerated once, then noted.
 * A figure from a public source passes. Decision 2.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { buildBasePrompt } from "../lib/prompt-library/index.js";
import { readFileSync } from "node:fs";
import {
  figuresMissingFromPublicSources,
  settlePublicDraft,
} from "../lib/style-guide/public-figures.mjs";

const root = new URL("../", import.meta.url);

describe("B556 public figures", () => {
  test("Generate already passed publicationState, and a public prompt now says public or restricted", () => {
    const generate = readFileSync(new URL("api/generate.js", root), "utf8");
    const compose = readFileSync(new URL("lib/prompt-library/compose.mjs", root), "utf8");
    assert.match(compose, /buildSourcePublicationStateBlock/);
    assert.match(generate, /sources: safeSources/);
    const text = buildBasePrompt({
      eventType: "FUND_DISTRIBUTION",
      outputType: "reporting_commentary",
      visibility: "public",
      sources: [
        { name: "Distribution notice", publicationState: "restricted", text: "a gross multiple of 2.8x" },
        { name: "Press release", publicationState: "published_external", text: "The fund sold the shares." },
      ],
    }).basePromptText;
    assert.match(text, /Distribution notice\): restricted/);
    assert.match(text, /Press release\): published_external/);
    assert.match(text, /Distribution notice: restricted/);
    assert.match(text, /Press release: public/);
    assert.match(text, /may come only from a public source/);
  });

  test("a restricted multiple is found, regenerated once, and then noted without being deleted", async () => {
    const sources = [
      { name: "32_kestrel_distribution_notice.txt", publicationState: "restricted", text: "a gross multiple of 2.8x" },
      { name: "33_kestrel_harbourline_press_release.txt", publicationState: "published_external", text: "The fund sold the shares." },
    ];
    const draft = "The sale generated a gross multiple of 2.8x.";
    const found = figuresMissingFromPublicSources(draft, sources);
    assert.equal(found.length, 1);
    assert.equal(found[0].surface, "2.8x");
    assert.equal(found[0].result, "restricted");
    let calls = 0;
    const settled = await settlePublicDraft({
      draft,
      sources,
      visibility: "PUBLIC",
      regenerate: async (figures) => {
        calls += 1;
        assert.equal(figures[0].surface, "2.8x");
        return draft;
      },
    });
    assert.equal(calls, 1);
    assert.equal(settled.text, draft);
    assert.match(settled.note, /2\.8x/);
    assert.match(settled.note, /32_kestrel_distribution_notice\.txt \(restricted\)/);
  });

  test("a figure stated by a public source passes, and a complete draft is not checked", async () => {
    const sources = [
      { name: "Press release", publicationState: "published_external", text: "a gross multiple of 2.8x" },
    ];
    const passed = await settlePublicDraft({
      draft: "The sale generated a gross multiple of 2.8x.",
      sources,
      visibility: "public",
      regenerate: async () => {
        throw new Error("a public figure must not be regenerated");
      },
    });
    assert.equal(passed.note, "");
    assert.equal(passed.regenerated, false);
    const complete = await settlePublicDraft({
      draft: "The sale generated a gross multiple of 2.8x.",
      sources: [{ name: "Notice", publicationState: "restricted", text: "2.8x" }],
      visibility: "COMPLETE",
      regenerate: async () => {
        throw new Error("a complete draft must not be regenerated");
      },
    });
    assert.equal(complete.note, "");
    assert.match(complete.text, /2\.8x/);
  });
});
