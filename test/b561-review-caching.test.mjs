/**
 * B561. The source is cached, and it leads the prompt. Compliance reads it only for a return figure.
 */
import assert from "node:assert/strict";
import { test } from "vitest";
import { anthropicSystemBlocks, anthropicUsageFromResponse } from "../lib/observability.js";
import { readingNoteSystem } from "../lib/qc/reading-review.mjs";
import { stage2UserPrompt } from "../lib/qc/pipeline-v4/stage2-match-sources.mjs";
import { buildComplianceUserPayload, statementHasReturnFigure } from "../lib/qc/editorial-compliance-reviewer.mjs";

const SOURCE = "The fund returned 18% IRR. The round is still open.";

test("the reading note system prompt is an Anthropic cache breakpoint", () => {
  const system = readingNoteSystem(SOURCE, "NEW_PRIMARY_COMMITMENT");
  const blocks = anthropicSystemBlocks(system);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].cache_control.type, "ephemeral");
  assert.equal(blocks[0].text.includes("Source:"), true);
  assert.equal(blocks[0].text.includes(SOURCE), true);
  assert.equal(blocks[0].text.indexOf("Source:"), blocks[0].text.lastIndexOf("Source:"));
});

test("source matching puts the source before the statement", () => {
  const prompt = stage2UserPrompt({
    statement: "Halden Group committed to the fund.",
    sourceText: SOURCE,
    parentSentence: "A different parent sentence.",
  });
  assert.ok(prompt.indexOf("Source:") < prompt.indexOf("Statement:"));
  assert.ok(prompt.indexOf(SOURCE) < prompt.indexOf("Halden Group committed"));
  assert.ok(prompt.indexOf("PARENT SENTENCE") < prompt.indexOf("Statement:"));
  assert.ok(prompt.indexOf("Source:") < prompt.indexOf("PARENT SENTENCE"));
});

test("compliance sends the source only for a return or performance figure, and the source comes first", () => {
  const sources = [{ label: "Memo", text: SOURCE, publicationState: "restricted" }];
  const figure = "The fund delivered 18% gross IRR.";
  const plain = "Halden Group committed to the fund in October 2026.";
  assert.equal(statementHasReturnFigure(figure), true);
  assert.equal(statementHasReturnFigure(plain), false);
  const withSource = buildComplianceUserPayload(figure, { outputTypeLabel: "Reporting commentary", requiredVersion: "complete", sources });
  const without = buildComplianceUserPayload(plain, { outputTypeLabel: "Reporting commentary", requiredVersion: "complete", sources });
  assert.ok(withSource.indexOf(SOURCE) < withSource.indexOf("CURRENT STATEMENT:"));
  assert.equal(withSource.includes(figure), true);
  assert.equal(without.includes(SOURCE), false);
  assert.ok(without.indexOf("CURRENT STATEMENT:") < without.indexOf(plain) || without.endsWith(plain));
});

test("Anthropic cache reads are recorded, and a cache write stays in the input total", () => {
  const usage = anthropicUsageFromResponse({
    usage: {
      input_tokens: 20,
      cache_creation_input_tokens: 100,
      cache_read_input_tokens: 400,
      output_tokens: 8,
    },
  });
  assert.equal(usage.inputTokens, 520);
  assert.equal(usage.cachedInputTokens, 400);
  assert.equal(usage.outputTokens, 8);
});
