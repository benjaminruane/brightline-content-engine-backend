/**
 * B176 step 1: house style is the only formatting standard in the style prompt.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import editorialRules from "../lib/rulebook/editorialRules.js";
import styleGuideRules from "../lib/rulebook/styleGuide.js";
import { OUTPUT_TYPE, VISIBILITY, getOutputTypeLabel } from "../lib/output-intent.js";
import { resolveStyleGuide } from "../lib/qc/style-guide.mjs";
import {
  buildEditorialStyleSystemPrompt,
  buildEditorialStyleUserPayload,
  buildStyleSystemPrompt,
} from "../lib/qc/editorial-compliance-reviewer.mjs";

const STANDARD = "the only formatting standard";
const AUTHORITY = "their formatting carries no authority";
const CORRECT_EX = "already matches a rule's Correct example";
const DIRECTION = "from a form the rules call Correct to a form they call Incorrect";
const IDENTICAL = "whose replacement text is identical to the text it replaces";
const OLD_LINE = "preserve the source's original formatting exactly";
const QUOTE_KEEP = "Style rules do not apply to text inside quotation marks";
const HOUSE_FRAGMENTS = [STANDARD, AUTHORITY, CORRECT_EX, DIRECTION, IDENTICAL];

const OUTPUT_TYPE_VALUE = OUTPUT_TYPE.REPORTING_COMMENTARY;
const OUTPUT_SLUG = "reporting_commentary";
const OUTPUT_LABEL = getOutputTypeLabel(OUTPUT_TYPE_VALUE);
const HOUSE_NAME = "Halden Group";
const STATEMENT = "The Company currently serves 412 property management companies.";

function combinedSystemPrompt() {
  return buildEditorialStyleSystemPrompt({
    outputTypeLabel: OUTPUT_LABEL,
    editorialRules,
    structuredStyleRules: resolveStyleGuide({
      outputType: OUTPUT_TYPE_VALUE,
      promptHouseName: HOUSE_NAME,
    }),
    outputSlug: OUTPUT_SLUG,
    outputType: OUTPUT_TYPE_VALUE,
    houseName: HOUSE_NAME,
  });
}

function splitSystemPrompt() {
  return buildStyleSystemPrompt(
    OUTPUT_LABEL,
    styleGuideRules,
    OUTPUT_SLUG,
    OUTPUT_TYPE_VALUE,
    HOUSE_NAME
  );
}

describe("B176 house-style prompt", () => {
  test("T1 combined system prompt names house style as the only standard", () => {
    const prompt = combinedSystemPrompt();
    for (const fragment of HOUSE_FRAGMENTS) {
      assert.equal(prompt.includes(fragment), true, `missing: ${fragment}`);
    }
  });

  test("T2 split style prompt interpolates the same five fragments", () => {
    const prompt = splitSystemPrompt();
    for (const fragment of HOUSE_FRAGMENTS) {
      assert.equal(prompt.includes(fragment), true, `missing: ${fragment}`);
    }
  });

  test("T3 neither prompt preserves the old source-formatting line", () => {
    assert.equal(combinedSystemPrompt().includes(OLD_LINE), false);
    assert.equal(splitSystemPrompt().includes(OLD_LINE), false);
  });

  test("T4 both prompts keep the quotation-mark exemption", () => {
    assert.equal(combinedSystemPrompt().includes(QUOTE_KEEP), true);
    assert.equal(splitSystemPrompt().includes(QUOTE_KEEP), true);
  });

  test("T5 user payload says source formatting is not a standard", () => {
    const payload = buildEditorialStyleUserPayload({
      sentenceText: STATEMENT,
      outputTypeLabel: OUTPUT_LABEL,
      requiredVersion: VISIBILITY.COMPLETE,
      draftText: STATEMENT,
      evidenceExcerpt: "The Company currently serves 412 property management companies.",
      contextBefore: null,
      contextAfter: null,
      evidenceBlock: "Source 0: The Company currently serves 412 property management companies.",
      authoringOrganisation: HOUSE_NAME,
    });
    assert.equal(payload.includes("Its formatting is not a standard"), true);
    assert.equal(payload.includes("do not restyle the CURRENT STATEMENT to match it"), true);
  });

  test("T6 house-style instruction precedes the style rulebook", () => {
    const prompt = combinedSystemPrompt();
    const standardAt = prompt.indexOf(STANDARD);
    const headingAt = prompt.indexOf("## Style rules");
    assert.ok(standardAt >= 0, "STANDARD missing");
    assert.ok(headingAt >= 0, "## Style rules missing");
    assert.ok(standardAt < headingAt, "STANDARD must precede ## Style rules");
  });
});
