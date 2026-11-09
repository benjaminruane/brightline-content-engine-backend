/**
 * B485. The editorial reviewer no longer raises the causal rule.
 * A beyond note, which is where that judgement now lives, has the same loudness.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import editorialRules from "../lib/rulebook/editorialRules.js";
import {
  buildEditorialStyleSystemPrompt,
  editorialRulesForRun,
} from "../lib/qc/editorial-compliance-reviewer.mjs";
import { READING_NOTE_PROMPT } from "../lib/qc/reading-contract.mjs";
import { CAUSAL_EVIDENCE_RULE, statementVerdict } from "../lib/qc/statement-verdict.mjs";
import { resolveStyleGuide } from "../lib/qc/style-guide.mjs";
import { OUTPUT_TYPE } from "../lib/output-intent.js";

describe("B485 causal home", () => {
  test("the editorial reviewer does not emit the causal rule", () => {
    const listed = editorialRulesForRun(editorialRules, "investor_letter", "complete");
    assert.equal(listed.some((rule) => rule.id === CAUSAL_EVIDENCE_RULE), false);
    const prompt = buildEditorialStyleSystemPrompt({
      outputTypeLabel: "Investor letter",
      editorialRules,
      structuredStyleRules: resolveStyleGuide({
        outputType: OUTPUT_TYPE.INVESTOR_LETTER,
        promptHouseName: "Halden Group",
      }),
      outputSlug: "investor_letter",
      outputType: OUTPUT_TYPE.INVESTOR_LETTER,
      houseName: "Halden Group",
    });
    assert.equal(prompt.includes(CAUSAL_EVIDENCE_RULE), false);
    assert.match(READING_NOTE_PROMPT, /operating leverage on incremental revenue/);
    assert.match(READING_NOTE_PROMPT, /names three/);
  });

  test("a causal finding from the reading note reaches the card at the same loudness", () => {
    const fromNote = statementVerdict({
      facts: [],
      note: {
        bucket: "beyond",
        text: "The source gives the margin lift from operating leverage on incremental revenue. The statement gives the broader cost base.",
      },
      entries: [],
    });
    const fromAction = statementVerdict({
      facts: [],
      note: null,
      entries: [{ concernCode: CAUSAL_EVIDENCE_RULE }],
    });
    assert.equal(fromNote.state, "beyond");
    assert.equal(fromNote.tier, "light");
    assert.equal(fromNote.state, fromAction.state);
    assert.equal(fromNote.tier, fromAction.tier);
  });
});
