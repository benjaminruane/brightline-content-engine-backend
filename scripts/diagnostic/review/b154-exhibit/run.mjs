#!/usr/bin/env node
/**
 * Permanent Brackenhill Review exhibit for B154 SHAPE B.
 * One live run. Does not regenerate the recorded action-list sample.
 * Does not change Stage 2. Does not fix anything.
 *
 * Usage: node scripts/diagnostic/review/b154-exhibit/run.mjs
 */
import { existsSync, unlinkSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadLocalEnvFiles } from "../../lib/env.mjs";

loadLocalEnvFiles();
process.env.QC_LLM_CACHE = "1";
delete process.env.QC_LLM_CACHE_DISK;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUN_CACHE = path.join(__dirname, ".run-cache.json");
for (const p of [RUN_CACHE, `${RUN_CACHE}.tmp`]) {
  try {
    if (existsSync(p)) unlinkSync(p);
  } catch {
    /* ignore */
  }
}

const { calculateLlmCostUsd, flushObservability, hasProviderApiKey } = await import(
  "../../../../lib/observability.js"
);
const { STAGE_MODELS } = await import("../../../../lib/qc/model-config.mjs");
const { hashPromptContent } = await import("../../../../lib/qc/llm-cache.mjs");
const { extractStatements } = await import(
  "../../../../lib/qc/pipeline-v4/stage1-extract-statements.mjs"
);
const { matchAllSources, periodsDoNotOverlap } = await import(
  "../../../../lib/qc/pipeline-v4/stage2-match-sources.mjs"
);
const { runPipelineV4 } = await import("../../../../lib/qc/pipeline-v4/index.mjs");
const { statementIsSilent, sourceSpokeTestsFired, isEvidenceGap } = await import(
  "../../../../lib/revise-actions/silence.mjs"
);

const SAMPLE_DIR = path.resolve(__dirname, "../../revise/per-finding-action-list");
const DRAFT_PATH = path.join(SAMPLE_DIR, "brackenhill-memo-draft.txt");
const SOURCE_PATH = path.join(SAMPLE_DIR, "brackenhill-fund-iii-source.txt");
const STAGE2_PROMPT_PATH = path.resolve(
  __dirname,
  "../../../../lib/qc/pipeline-v4/prompts/stage2_v4.md"
);
const COST_CEILING_USD = 10;
const AUTHORING = "Halden Group";
const COMPARATIVE_NEEDLE = "Comparable managers in North American healthcare";
const FIRST_CLOSE_NEEDLE = "first close on Fund IV";
const EXPECTED_STAGE2_PROMPT_SHA = "44847c61b07bac89855b9a0f555e30f528077ebe0b3a8baa2c2c06669d60b3e1";

const stage2Model = STAGE_MODELS["stage2-matching"];
const stage1Model = STAGE_MODELS["stage1-splitting"];
const stage1bModel = STAGE_MODELS["stage1b-claim-spans"];
const framingModel = STAGE_MODELS["framing-fidelity-judge"];

function usd(provider, model, inputTokens, outputTokens) {
  return calculateLlmCostUsd(provider, model, {
    inputTokens,
    outputTokens,
    cachedInputTokens: 0,
  });
}

function collapse(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function findByNeedle(rows, needle, textOf) {
  const n = collapse(needle).toLowerCase();
  const hits = [];
  for (let i = 0; i < rows.length; i++) {
    const text = collapse(textOf(rows[i], i));
    if (text.toLowerCase().includes(n)) hits.push(i);
  }
  return hits;
}

function roundUsd(n) {
  return Math.round((Number(n) || 0) * 1e6) / 1e6;
}

function sumCost(rows) {
  return roundUsd(rows.reduce((acc, row) => acc + (Number(row?.costUsd) || 0), 0));
}

function slimPair(m) {
  return {
    statementIndex: m.statementIndex,
    sourceIndex: m.sourceIndex,
    sourceLabel: m.sourceLabel,
    classification: m.classification,
    preBackstopClassification: m.preBackstopClassification,
    passage: m.passage,
    explanation: m.explanation,
    periodAssessment: m.periodAssessment ?? null,
    statementFigures: Array.isArray(m.statementFigures) ? m.statementFigures : [],
    sourceFigures: Array.isArray(m.sourceFigures) ? m.sourceFigures : [],
    schemaValid: m.schemaValid,
    costUsd: m.costUsd,
    systemFingerprint: m.systemFingerprint ?? null,
  };
}

function slimCard(card) {
  return {
    index: card.index,
    statement: card.statement,
    supportState: card.supportState,
    displayVerdict: card.displayVerdict,
    hasConflict: card.hasConflict,
    concernLevel: card.concernLevel,
    evidenceSummary: card.evidenceSummary,
    primaryExcerpt: card.primaryExcerpt ?? null,
    conflictExcerpt: card.conflictExcerpt ?? null,
    conflictValues: card.conflictValues ?? null,
    supportSpans: Array.isArray(card.supportSpans) ? card.supportSpans : [],
    unsupportedSpans: Array.isArray(card.unsupportedSpans) ? card.unsupportedSpans : [],
    stage2SourceFingerprints: Array.isArray(card.stage2SourceFingerprints)
      ? card.stage2SourceFingerprints
      : [],
    claims: Array.isArray(card.claims) ? card.claims : [],
    decomposed: card.decomposed ?? false,
    claimUpgrade: card.claimUpgrade ?? false,
  };
}

function stopIfOver(billed, phase) {
  if (billed < COST_CEILING_USD) return;
  console.error(`STOP: billed $${billed} at or above $${COST_CEILING_USD} after ${phase}`);
  process.exit(1);
}

const preflightUsd = roundUsd(
  usd(stage1Model.provider, stage1Model.model, 4000, 800) +
    12 * usd(stage2Model.provider, stage2Model.model, 8000, 400) +
    usd(stage1bModel.provider, stage1bModel.model, 6000, 800) +
    8 * usd(stage2Model.provider, stage2Model.model, 8000, 400) +
    12 * usd(framingModel.provider, framingModel.model, 2000, 300)
);

const stage2Prompt = (await readFile(STAGE2_PROMPT_PATH, "utf8")).trim();
const stage2PromptHash = hashPromptContent(stage2Prompt);
const draft = await readFile(DRAFT_PATH, "utf8");
const sourceText = await readFile(SOURCE_PATH, "utf8");
const sources = [{ label: "Fund III Investor Update", text: sourceText }];

const preflight = {
  route: "lib/qc/pipeline-v4/index.mjs runPipelineV4 plus in-process matchAllSources",
  draft: path.relative(process.cwd(), DRAFT_PATH),
  source: path.relative(process.cwd(), SOURCE_PATH),
  notRegenerated: "scripts/diagnostic/revise/per-finding-action-list/brackenhill-2026-09-02.json",
  cache: "in-process memory, empty at start; shared diagnostic disk cache not read",
  editorialEnabled: false,
  complianceEnabled: false,
  skipCommentary: true,
  skipWidenedPass: false,
  stage2PromptHash,
  expectedStage2PromptSha: EXPECTED_STAGE2_PROMPT_SHA,
  promptPinHeld: stage2PromptHash === EXPECTED_STAGE2_PROMPT_SHA,
  preflightUsd,
  costCeilingUsd: COST_CEILING_USD,
};

console.log(JSON.stringify({ preflight }, null, 2));

if (preflightUsd >= COST_CEILING_USD) {
  console.error("STOP: pre-flight at or above the ceiling");
  process.exit(1);
}

if (!hasProviderApiKey(stage2Model.provider)) {
  console.error("STOP: no OpenAI API key");
  process.exit(1);
}

const traceId = `b154-exhibit-${new Date().toISOString().slice(0, 10)}`;
let billed = 0;

const stage1 = await extractStatements({ draftText: draft, traceId });
billed = roundUsd(billed + (Number(stage1?.costUsd) || 0));
stopIfOver(billed, "stage1");

const statements = Array.isArray(stage1?.statements) ? stage1.statements : [];
const comparativeStage1Hits = findByNeedle(statements, COMPARATIVE_NEEDLE, (s) => s.text);
const firstCloseStage1Hits = findByNeedle(statements, FIRST_CLOSE_NEEDLE, (s) => s.text);

const { matches } = await matchAllSources({
  statements,
  sources,
  traceId,
});
const pairRows = Array.isArray(matches) ? matches.map(slimPair) : [];
billed = roundUsd(billed + sumCost(pairRows));
stopIfOver(billed, "stage2-pairs");

const pipeline = await runPipelineV4(draft, sources, {
  traceId,
  evidenceEnabled: true,
  editorialEnabled: false,
  complianceEnabled: false,
  skipCommentary: true,
  skipWidenedPass: false,
  outputType: "reporting_commentary",
  authoringOrganisation: AUTHORING,
});
const cards = Array.isArray(pipeline?.qcCards) ? pipeline.qcCards.map(slimCard) : [];

function cardAt(hits) {
  if (hits.length !== 1) return null;
  const idx = hits[0];
  return cards.find((c) => Number(c.index) === Number(statements[idx]?.index ?? idx)) || cards[idx] || null;
}

function pairsFor(hits) {
  if (hits.length !== 1) return [];
  const statementIndex = Number(statements[hits[0]]?.index ?? hits[0]);
  return pairRows.filter((p) => Number(p.statementIndex) === statementIndex);
}

const comparativeCard = cardAt(comparativeStage1Hits);
const firstCloseCard = cardAt(firstCloseStage1Hits);
const comparativePairs = pairsFor(comparativeStage1Hits);
const firstClosePairs = pairsFor(firstCloseStage1Hits);
const comparativePair = comparativePairs[0] || null;
const firstClosePair = firstClosePairs[0] || null;

const comparativeClassification = comparativePair?.classification ?? null;
const comparativeSupport = comparativeCard?.supportState ?? null;
const comparativeDisplay = comparativeCard?.displayVerdict ?? null;
const passage = collapse(comparativePair?.passage);
const explanation = collapse(comparativePair?.explanation);
const ownFundFigureCue =
  /\b1\.4\b/.test(passage) ||
  /\b1\.9\b/.test(passage) ||
  /\b2\.1\b/.test(passage) ||
  /marked at/i.test(passage) ||
  /Fund III/i.test(passage) ||
  /Fund II/i.test(passage);
const namesComparables = /comparable/i.test(passage);
const shapeBPartial =
  comparativeSupport === "partial" ||
  comparativeSupport === "partially_confirmed" ||
  comparativeDisplay === "supported_partial" ||
  comparativeClassification === "partially_confirmed";
const shapeBReproduced =
  comparativeStage1Hits.length === 1 && shapeBPartial && ownFundFigureCue && !namesComparables;

const pre = firstClosePair?.preBackstopClassification ?? null;
const post = firstClosePair?.classification ?? null;
const periodAssessment = firstClosePair?.periodAssessment ?? null;
const gateWouldFire =
  (pre === "confirmed" || pre === "conflicting") &&
  post === "no_support" &&
  periodsDoNotOverlap(periodAssessment);
const modelAlone = post === "no_support" && (pre === "no_support" || pre == null);

const comparativeSilent = comparativeCard ? statementIsSilent(comparativeCard) : null;
const comparativeTests = comparativeCard ? sourceSpokeTestsFired(comparativeCard) : [];
const b149Fired = comparativeTests.includes("supportSpan_classification_conflicting");

const findings = {
  stage1Count: statements.length,
  comparativeNeedleHits: comparativeStage1Hits.length,
  firstCloseNeedleHits: firstCloseStage1Hits.length,
  mergedOrMissing:
    comparativeStage1Hits.length !== 1 || firstCloseStage1Hits.length !== 1
      ? "Stage 1 did not yield exactly one hit for each needle. Exhibit is weaker on that sentence."
      : null,
  shapeB: {
    statementIndex: comparativeStage1Hits.length === 1 ? statements[comparativeStage1Hits[0]]?.index : null,
    statementText:
      comparativeStage1Hits.length === 1 ? collapse(statements[comparativeStage1Hits[0]]?.text) : null,
    supportState: comparativeSupport,
    displayVerdict: comparativeDisplay,
    pairClassification: comparativeClassification,
    pairPassage: comparativePair?.passage ?? null,
    pairExplanation: comparativePair?.explanation ?? null,
    ownFundFigureCue,
    namesComparables,
    reproduced: shapeBReproduced,
    reproducedBecause: shapeBReproduced
      ? "Whole-sentence Stage 2 came back partial on a passage about this fund's own figure, not comparable-manager returns."
      : shapeBPartial
        ? "Partial, but the passage cue did not match the recorded own-fund / peer-figure shape."
        : `Did not come back partial (supportState=${comparativeSupport}, displayVerdict=${comparativeDisplay}, classification=${comparativeClassification}).`,
  },
  firstClose: {
    statementIndex: firstCloseStage1Hits.length === 1 ? statements[firstCloseStage1Hits[0]]?.index : null,
    statementText:
      firstCloseStage1Hits.length === 1 ? collapse(statements[firstCloseStage1Hits[0]]?.text) : null,
    supportState: firstCloseCard?.supportState ?? null,
    displayVerdict: firstCloseCard?.displayVerdict ?? null,
    pairClassification: post,
    preBackstopClassification: pre,
    periodAssessment,
    periodsDoNotOverlap: periodAssessment ? periodsDoNotOverlap(periodAssessment) : null,
    reachedNoSupportViaPeriodRule: gateWouldFire,
    reachedNoSupportByModelAlone: modelAlone && !gateWouldFire,
  },
  permissionToEdit: {
    statementIndex: comparativeStage1Hits.length === 1 ? statements[comparativeStage1Hits[0]]?.index : null,
    isEvidenceGap: comparativeCard ? isEvidenceGap(comparativeCard) : null,
    statementIsSilent: comparativeSilent,
    testsFired: comparativeTests,
    supportSpan_classification_conflicting: b149Fired,
    supportSpans: comparativeCard?.supportSpans ?? [],
  },
};

const summary = {
  capturedAt: new Date().toISOString(),
  billedUsd: billed,
  billedNote:
    "billedUsd is Stage 1 live plus first Stage 2 live. Pipeline Stage 1/2 are cache hits. Stage 1b, widened, and framing-fidelity are extra and unmetered here; preflight padded for them. Ceiling stop used the metered figure plus the instruction to stop if the run would exceed $10.",
  costCeilingUsd: COST_CEILING_USD,
  stage2PromptHash,
  promptPinHeld: stage2PromptHash === EXPECTED_STAGE2_PROMPT_SHA,
  shapeBReproduced: findings.shapeB.reproduced,
  firstCloseViaPeriodRule: findings.firstClose.reachedNoSupportViaPeriodRule,
  firstCloseByModelAlone: findings.firstClose.reachedNoSupportByModelAlone,
  permissionToEditFired: b149Fired,
  stopIfShapeBMiss: findings.shapeB.reproduced
    ? null
    : "SHAPE B did not reproduce. Stop. Do not rerun looking for it.",
};

await writeFile(path.join(__dirname, "stage1.json"), `${JSON.stringify({ stage1 }, null, 2)}\n`);
await writeFile(path.join(__dirname, "stage2-pairs.json"), `${JSON.stringify({ matches: pairRows }, null, 2)}\n`);
await writeFile(path.join(__dirname, "qc-cards.json"), `${JSON.stringify({ qcCards: cards }, null, 2)}\n`);
await writeFile(path.join(__dirname, "findings.json"), `${JSON.stringify(findings, null, 2)}\n`);
await writeFile(
  path.join(__dirname, "summary.json"),
  `${JSON.stringify({ preflight, findings, summary }, null, 2)}\n`
);

console.log(JSON.stringify({ summary, findings }, null, 2));

await flushObservability();
if (!findings.shapeB.reproduced) {
  process.exitCode = 0;
}
