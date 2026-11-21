/**
 * B555. Generate, Rewrite, and Adapt carry the same principles and style section.
 * A public draft is told to exclude restricted confidential figures.
 * An investor letter is complete. Decisions 6 and 8.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "vitest";
import { buildBasePrompt } from "../lib/prompt-library/index.js";
import { renderDraftingInstructions } from "../lib/style-guide/render.mjs";
import { visibilityForDraft, VISIBILITY } from "../lib/output-intent.js";
import { NEW_ACCOUNT_HOUSE_STYLE } from "../lib/house-style-choice.mjs";

const root = new URL("../", import.meta.url);

function brief(extra = {}) {
  return buildBasePrompt({
    eventType: "NEW_DIRECT_INVESTMENT",
    outputType: "reporting_commentary",
    visibility: "complete",
    houseStyle: NEW_ACCOUNT_HOUSE_STYLE,
    ...extra,
  }).basePromptText;
}

describe("B555 writing principles", () => {
  test("Generate and the shared renderer carry the same principles and style section", () => {
    const shared = renderDraftingInstructions({
      eventType: "NEW_DIRECT_INVESTMENT",
      outputType: "reporting_commentary",
      houseStyle: NEW_ACCOUNT_HOUSE_STYLE,
    });
    const generated = brief();
    assert.equal(generated.includes(shared), true);
    assert.match(generated, /Tell the investment story/);
    assert.match(generated, /Lead with what happened/);
    assert.match(generated, /Public means public/);
    assert.match(generated, /published_external/);
    assert.match(generated, /own investment amount may be stated/);
    const adapt = readFileSync(new URL("api/adapt.js", root), "utf8");
    const rewrite = readFileSync(new URL("api/rewrite.js", root), "utf8");
    assert.match(adapt, /renderDraftingInstructions/);
    assert.match(rewrite, /buildBasePrompt/);
  });

  test("a public prompt names restricted sources, and an investor letter is complete", () => {
    const text = brief({
      outputType: "reporting_commentary",
      visibility: "public",
      sources: [
        { name: "IC paper", publicationState: "restricted", text: "IRR 20%" },
        { name: "Press release", publicationState: "published_external", text: "The firm announced the investment." },
      ],
    });
    assert.match(text, /IC paper\): restricted/);
    assert.match(text, /Press release\): published_external/);
    assert.match(text, /confidential figure/);
    assert.equal(visibilityForDraft("investor_letter", "public"), VISIBILITY.COMPLETE);
    assert.equal(visibilityForDraft("INVESTOR_LETTER", "PUBLIC"), VISIBILITY.COMPLETE);
    assert.equal(visibilityForDraft("press_release", "complete"), VISIBILITY.PUBLIC);
  });
});
