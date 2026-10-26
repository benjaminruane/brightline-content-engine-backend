/**
 * B437 cost estimate. No model calls.
 * Uses estimateReviewWork, the scheduler's token model, with the same
 * system-token constants api/analyse-statements.js passes to preflight.
 * The note step is not in that function. Its tokens use the same
 * ceil(chars/4) helper, priced at the opus rates in lib/observability.js.
 *
 *   node scripts/diagnostic/b437/estimate.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { estimateReviewWork } from "../../../lib/qc/stage-schedule.mjs";
import { estimateTokensFromChars, tpmFloorMs } from "../../../lib/qc/token-estimate.mjs";
import { predictedIdleWallMs } from "../../../lib/qc/review-deadline.mjs";
import { READING_NOTE_PROMPT, WRITER_FEEDBACK_PROMPT } from "../../../lib/qc/reading-contract.mjs";
import { filterFixtures, loadAllFixtures } from "../lib/fixtures.mjs";
import { loadPipelineSources } from "../lib/sources.mjs";

const SYS = {
  editorialSystemTokens: 9088,
  complianceSystemTokens: 3000,
  stage2SystemTokens: 4000,
  stage5SystemTokens: 1600,
};

const GPT4O_IN = 2.5;
const GPT4O_OUT = 10;
const OPUS_IN = 5;
const OPUS_OUT = 25;
const NOTE_OUTPUT_TOKENS = 300;
const PIPELINE_OUTPUT_PER_CALL = 400;

function usd(n) {
  return Math.round(n * 1e6) / 1e6;
}

export async function buildEstimate() {
  const fixtures = filterFixtures(await loadAllFixtures(), { range: { from: "01", to: "20" } });
  const rows = [];
  for (const fixture of fixtures) {
    const draft = typeof fixture.data.draft === "string" ? fixture.data.draft : "";
    const sources = await loadPipelineSources(fixture.data.sources || []);
    const est = estimateReviewWork({ draftText: draft, sources, ...SYS });
    const sourceText = sources.map((s) => (typeof s?.text === "string" ? s.text : "")).join("\n");
    const noteSystem = estimateTokensFromChars(`${READING_NOTE_PROMPT}\n\nSource:\n${sourceText}`);
    const writerSystem = estimateTokensFromChars(WRITER_FEEDBACK_PROMPT);
    const writerUser = estimateTokensFromChars(draft);
    const noteCalls = est.statementCount;
    const noteInput = noteCalls * (noteSystem + 200) + writerSystem + writerUser;
    const pipelineCalls =
      est.statementCount * Math.max(est.sourceCount, 1) +
      est.statementCount +
      est.statementCount * 2;
    rows.push({
      id: fixture.data.id,
      statements: est.statementCount,
      sources: est.sourceCount,
      words: est.wordCount,
      parts: est.parts,
      totalTokens: est.totalTokens,
      tpmFloorMs: est.tpmFloorMs,
      idleWallMs: predictedIdleWallMs(est.totalTokens),
      noteInput,
      noteCalls,
      pipelineCalls,
    });
  }

  const sum = (key) => rows.reduce((n, row) => n + row[key], 0);
  const part = (name) => rows.reduce((n, row) => n + row.parts[name], 0);
  const one = {
    stage1: part("stage1Tokens"),
    stage1b: part("stage1bTokens"),
    stage2: part("stage2Tokens"),
    stage5: part("stage5Tokens"),
    editorial: part("stage6Editorial"),
    compliance: part("stage6Compliance"),
    noteInput: sum("noteInput"),
    statements: sum("statements"),
    pipelineCalls: sum("pipelineCalls"),
    tpmFloorMs: sum("tpmFloorMs"),
    idleWallMs: sum("idleWallMs"),
  };
  one.pipelineInput = one.stage1 + one.stage1b + one.stage2 + one.stage5 + one.editorial + one.compliance;
  one.pipelineOutput = one.pipelineCalls * PIPELINE_OUTPUT_PER_CALL;
  one.noteOutput = (sum("noteCalls") + rows.length) * NOTE_OUTPUT_TOKENS;
  one.pipelineUsd = (one.pipelineInput / 1e6) * GPT4O_IN + (one.pipelineOutput / 1e6) * GPT4O_OUT;
  one.noteUsd = (one.noteInput / 1e6) * OPUS_IN + (one.noteOutput / 1e6) * OPUS_OUT;
  one.usd = one.pipelineUsd + one.noteUsd;
  const two = {
    usd: one.usd * 2,
    pipelineUsd: one.pipelineUsd * 2,
    noteUsd: one.noteUsd * 2,
    tpmFloorMs: one.tpmFloorMs * 2,
    idleWallMs: one.idleWallMs * 2,
    noteInput: one.noteInput * 2,
    pipelineInput: one.pipelineInput * 2,
  };
  two.noteTpmFloorMs = tpmFloorMs(two.noteInput, 2_000_000);

  const out = {
    fixtures: rows.length,
    schedulerConstants: SYS,
    rates: { gpt4oInput: GPT4O_IN, gpt4oOutput: GPT4O_OUT, opusInput: OPUS_IN, opusOutput: OPUS_OUT },
    outputAssumption: {
      pipelineOutputTokensPerCall: PIPELINE_OUTPUT_PER_CALL,
      noteOutputTokensPerCall: NOTE_OUTPUT_TOKENS,
      note: "The scheduler counts request tokens only. Output tokens are an allowance, not a scheduler field.",
    },
    onePass: {
      statementsEstimated: one.statements,
      pipelineInputTokens: one.pipelineInput,
      pipelineOutputTokens: one.pipelineOutput,
      noteInputTokens: one.noteInput,
      noteOutputTokens: one.noteOutput,
      parts: {
        stage1: one.stage1,
        stage1b: one.stage1b,
        stage2: one.stage2,
        stage5: one.stage5,
        editorial: one.editorial,
        compliance: one.compliance,
      },
      pipelineUsd: usd(one.pipelineUsd),
      noteUsd: usd(one.noteUsd),
      usd: usd(one.usd),
      tpmFloorMs: one.tpmFloorMs,
      idleWallMs: one.idleWallMs,
    },
    twoPasses: {
      usd: usd(two.usd),
      pipelineUsd: usd(two.pipelineUsd),
      noteUsd: usd(two.noteUsd),
      tpmFloorMs: two.tpmFloorMs,
      idleWallMs: two.idleWallMs,
      noteTpmFloorMs: two.noteTpmFloorMs,
      wallClockMinutes: Math.round((two.tpmFloorMs / 60000) * 10) / 10,
      idleWallMinutes: Math.round((two.idleWallMs / 60000) * 10) / 10,
    },
    perFixture: rows.map((row) => ({
      id: row.id,
      statements: row.statements,
      sources: row.sources,
      pipelineTokens: row.totalTokens,
      noteInput: row.noteInput,
    })),
  };
  return out;
}

async function main() {
  const out = await buildEstimate();
  console.log(JSON.stringify(out, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
