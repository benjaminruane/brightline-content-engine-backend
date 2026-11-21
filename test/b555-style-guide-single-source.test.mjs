/**
 * B555. Every consumer renders from the style guide.
 * Decisions 1, 3, and 11.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "vitest";
import { STYLE_GUIDE } from "../lib/style-guide/guide.mjs";
import {
  autoFixTransformIds,
  deterministicScanIds,
  renderDraftStyleSection,
  renderHouseRulesView,
  renderReviewStyleRules,
  resolveStyleChoices,
} from "../lib/style-guide/render.mjs";
import { resolveStyleGuide } from "../lib/qc/style-guide.mjs";
import { HOUSE_VOICE_TABLE } from "../lib/prompt-library/house-voice.mjs";
import { buildBasePrompt } from "../lib/prompt-library/index.js";
import { getPromptGuidance } from "../lib/output-intent.js";
import { renderDraftingInstructions } from "../lib/style-guide/render.mjs";

const FRONT_VOICE = "/Users/benjaminruane/CE DEV (local)/GitHub/brightline-content-engine-frontend/src/constants/houseVoice.js";

describe("B555 one style guide", () => {
  test("Generate, Rewrite, and Review style rules come from the guide", () => {
    const choices = resolveStyleChoices(null);
    const section = renderDraftStyleSection(choices);
    const brief = buildBasePrompt({
      eventType: "NEW_DIRECT_INVESTMENT",
      outputType: "reporting_commentary",
      visibility: "complete",
      houseStyle: choices,
    }).basePromptText;
    assert.equal(brief.includes("Style guide:"), true);
    assert.equal(brief.includes(section.split("\n")[1]), true);
    const review = resolveStyleGuide({ outputType: "reporting_commentary", houseStyle: choices });
    const ids = new Set(review.map((rule) => rule.id));
    assert.equal(ids.has("number_spelling"), true);
    assert.equal(ids.has("first_person_plural"), true);
    assert.equal(review.find((rule) => rule.id === "number_spelling").description.includes("twelve"), true);
    assert.equal(review.find((rule) => rule.id === "number_spelling").description.includes(" 12"), false);
  });

  test("a press release is third person and we is only inside quoted speech", () => {
    const rules = renderReviewStyleRules(resolveStyleChoices(null), { outputType: "press_release" });
    const voice = rules.find((rule) => rule.id === "first_person_plural");
    assert.match(voice.description, /press release: Factual, third-person in the body/);
    assert.match(voice.description, /only inside quoted speech/);
    assert.equal(/acceptable in investor_letter, press_release/.test(voice.description), false);
  });

  test("the house voice table is the guide, and the frontend mirror matches it", () => {
    assert.deepEqual(
      HOUSE_VOICE_TABLE.map((row) => ({ slug: row.slug, person: row.person })),
      [
        { slug: "reporting_commentary", person: "third person" },
        { slug: "investor_letter", person: "first person plural" },
        { slug: "linkedin_post", person: "first person plural" },
        { slug: "press_release", person: "third person" },
      ]
    );
    const mirror = readFileSync(FRONT_VOICE, "utf8");
    for (const row of HOUSE_VOICE_TABLE) {
      assert.equal(mirror.includes(`slug: "${row.slug}"`), true, row.slug);
      assert.equal(mirror.includes(`person: "${row.person}"`), true, row.person);
    }
  });

  test("every auto-fix and scan id on the guide has a runner, and the page view groups the guide", () => {
    const transforms = new Set(autoFixTransformIds());
    const scans = new Set(deterministicScanIds());
    for (const entry of STYLE_GUIDE) {
      if (entry.enforcement?.transformId) assert.equal(transforms.has(entry.enforcement.transformId), true, entry.id);
      if (entry.enforcement?.scanId) assert.equal(scans.has(entry.enforcement.scanId), true, entry.id);
    }
    const view = renderHouseRulesView(resolveStyleChoices(null));
    assert.equal(view.groups.some((group) => group.category === "voice"), true);
    assert.equal(view.voice.length, 4);
    assert.equal(getPromptGuidance("PRESS_RELEASE", "public").includes("quoted speech"), true);
    assert.equal(renderDraftingInstructions({ houseStyle: resolveStyleChoices(null) }).includes("Writing principles:"), true);
  });
});
