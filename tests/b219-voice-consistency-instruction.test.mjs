/**
 * B219: voice_consistency must not ask for first person and its removal
 * on the same output type.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";
import editorialRules from "../lib/rulebook/editorialRules.js";
import { OUTPUT_TYPE, getOutputTypeLabel } from "../lib/output-intent.js";
import { resolveStyleGuide } from "../lib/qc/style-guide.mjs";
import {
  FIRST_PERSON_ACTOR_INSTRUCTION,
  buildFirstPersonActorInstruction,
} from "../lib/qc/first-person-actor.mjs";
import { buildEditorialStyleSystemPrompt } from "../lib/qc/editorial-compliance-reviewer.mjs";

const HOUSE = "Halden Group";
const REMOVAL_MARKER = "When first-person plural must be removed";

const OUTPUT_TYPES = [
  {
    slug: "reporting_commentary",
    enum: OUTPUT_TYPE.REPORTING_COMMENTARY,
    houseVoice: "third",
  },
  {
    slug: "investor_letter",
    enum: OUTPUT_TYPE.INVESTOR_LETTER,
    houseVoice: "first",
  },
  {
    slug: "press_release",
    enum: OUTPUT_TYPE.PRESS_RELEASE,
    houseVoice: "first",
  },
  {
    slug: "linkedin_post",
    enum: OUTPUT_TYPE.LINKEDIN_POST,
    houseVoice: "first",
  },
];

function promptFor(row) {
  return buildEditorialStyleSystemPrompt({
    outputTypeLabel: getOutputTypeLabel(row.enum),
    editorialRules,
    structuredStyleRules: resolveStyleGuide({
      outputType: row.enum,
      promptHouseName: HOUSE,
    }),
    outputSlug: row.slug,
    outputType: row.enum,
    houseName: HOUSE,
  });
}

function voiceConsistencyBlock(prompt) {
  const marker = "voice_consistency:";
  const start = prompt.indexOf(marker);
  assert.ok(start >= 0, "voice_consistency missing from prompt");
  const rest = prompt.slice(start);
  const nextRule = rest.search(/\n\d+\. [a-z_]+/);
  const styleHeader = rest.indexOf("\n## Style rules");
  let end = rest.length;
  if (nextRule >= 0) end = Math.min(end, nextRule);
  if (styleHeader >= 0) end = Math.min(end, styleHeader);
  return rest.slice(0, end);
}

describe("B219 voice_consistency instruction by output type", () => {
  for (const row of OUTPUT_TYPES) {
    test(`${row.slug}: FIRST_PERSON_ACTOR_INSTRUCTION present only for third-person house voice`, () => {
      const prompt = promptFor(row);
      const block = voiceConsistencyBlock(prompt);
      const expectPresent = row.houseVoice === "third";
      assert.equal(block.includes(REMOVAL_MARKER), expectPresent);
      assert.equal(prompt.includes(REMOVAL_MARKER), expectPresent);
    });

    test(`${row.slug}: rule description and attached instruction never point in opposite directions`, () => {
      const prompt = promptFor(row);
      const block = voiceConsistencyBlock(prompt);
      const hasRemoval = block.includes(REMOVAL_MARKER) || prompt.includes(REMOVAL_MARKER);
      if (row.houseVoice === "first") {
        assert.equal(hasRemoval, false);
        return;
      }
      assert.equal(hasRemoval, true);
      assert.match(block, /Reporting commentary.{0,80}third-person/i);
    });
  }

  test("worked examples label the fault side and the corrected side", () => {
    const instruction = buildFirstPersonActorInstruction(HOUSE);
    assert.match(instruction, /Fault \(first person\): "We were attracted to X"/);
    assert.match(
      instruction,
      /Corrected \(third person\): "Halden Group was attracted to X"/
    );
    assert.equal(instruction.includes(" -> "), false);
    assert.equal(FIRST_PERSON_ACTOR_INSTRUCTION.includes("Fault (first person):"), true);
  });
});
