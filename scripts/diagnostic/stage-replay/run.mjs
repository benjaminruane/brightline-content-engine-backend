#!/usr/bin/env node
/**
 * Replay ONE QC stage from a recorded review payload (B270).
 *
 * Does not call Stage 1, Stage 2, or Stage 5 unless that stage is named.
 * Live measurement: LLM cache forced off.
 *
 *   node scripts/diagnostic/stage-replay/run.mjs --stage editorial --fixture FILE --out FILE
 *   node scripts/diagnostic/stage-replay/run.mjs --stage editorial --fixture FILE --subset 40 --out FILE
 *   node scripts/diagnostic/stage-replay/run.mjs compare A.json B.json
 *   node scripts/diagnostic/stage-replay/run.mjs honesty --fixture FILE --replay FILE
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnvFiles } from "../lib/env.mjs";
import {
  DEFAULT_HOUSE,
  DEFAULT_OUTPUT_TYPE,
  DEFAULT_REQUIRED_VERSION,
  cacheHitRate,
  concernCodes,
  diffRuns,
  emptyEditorialCard,
  honestyAgainstStored,
  listCostFromSpend,
  loadReviewStatements,
  meanCodesDiffer,
  neighbourTexts,
  reconstructDraft,
  reconstructSources,
  selectSubset,
  signalVerdict,
  stableShifts,
  editorialSucceeded,
  complianceSucceeded,
} from "./lib.mjs";

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") continue;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        out[key] = true;
      } else {
        out[key] = next;
        i += 1;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

function printTable(title, rows) {
  console.log(title);
  if (!rows.length) {
    console.log("(none)");
    return;
  }
  for (const r of rows) console.log(JSON.stringify(r));
}

const args = parseArgs(process.argv.slice(2));
const command = args._[0] || "run";

if (command === "compare") {
  const aPath = args._[1];
  const bPath = args._[2];
  if (!aPath || !bPath) {
    console.error("usage: run.mjs compare A.json B.json");
    process.exit(1);
  }
  const a = JSON.parse(readFileSync(aPath, "utf8"));
  const b = JSON.parse(readFileSync(bPath, "utf8"));
  const signal = a.signal || b.signal || "editorial";
  const diff = diffRuns(a, b, signal);
  const result = {
    a: aPath,
    b: bPath,
    bothSucceeded: diff.bothSucceeded,
    codesDiffer: diff.codesDiffer,
    verdictDiffer: diff.verdictDiffer,
    moved: diff.moved,
    aSpend: a.spend || null,
    bSpend: b.spend || null,
    rows: diff.rows.filter((r) => r.codesDiffer || r.verdictDiffer || !r.bothSucceeded),
  };
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

if (command === "compare-floor") {
  const oldA = JSON.parse(readFileSync(args._[1], "utf8"));
  const oldB = JSON.parse(readFileSync(args._[2], "utf8"));
  const newA = JSON.parse(readFileSync(args._[3], "utf8"));
  const newB = JSON.parse(readFileSync(args._[4], "utf8"));
  const floor = diffRuns(oldA, oldB);
  const newWobble = diffRuns(newA, newB);
  const mean = meanCodesDiffer([oldA, oldB], [newA, newB]);
  const stables = stableShifts(oldA, oldB, newA, newB);
  const maps = [oldA, oldB, newA, newB].map(
    (run) => new Map((run.statements || []).map((s) => [s.index, s]))
  );
  const materiality = [];
  const indexes = [...new Set(maps.flatMap((m) => [...m.keys()]))].sort((a, b) => a - b);
  for (const index of indexes) {
    const [a, b, c, d] = maps.map((m) => m.get(index));
    if (!a || !b || !c || !d) continue;
    if (!(a.succeeded && b.succeeded && c.succeeded && d.succeeded)) continue;
    const oldHas =
      (a.codes || []).includes("materiality") && (b.codes || []).includes("materiality");
    if (!oldHas) continue;
    const newAHas = (c.codes || []).includes("materiality");
    const newBHas = (d.codes || []).includes("materiality");
    const fromDocA = (c.documentLevelCodes || []).includes("materiality");
    const fromDocB = (d.documentLevelCodes || []).includes("materiality");
    materiality.push({
      index,
      recovered: newAHas && newBHas,
      fromDocumentLevel: fromDocA && fromDocB,
      newAHas,
      newBHas,
    });
  }
  const result = {
    floorCodesDiffer: floor.codesDiffer,
    newWobbleCodesDiffer: newWobble.codesDiffer,
    meanOldVsNew: mean.mean,
    pairs: mean.pairs,
    stableShifts: stables,
    materiality,
    materialityRecovered: materiality.filter((row) => row.recovered),
    materialityLost: materiality.filter((row) => !row.recovered),
  };
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

if (command === "honesty") {
  const fixturePath = args.fixture;
  const replayPath = args.replay;
  if (!fixturePath || !replayPath) {
    console.error("usage: run.mjs honesty --fixture FILE --replay FILE");
    process.exit(1);
  }
  const payload = JSON.parse(readFileSync(fixturePath, "utf8"));
  const replay = JSON.parse(readFileSync(replayPath, "utf8"));
  const all = loadReviewStatements(payload);
  const signal = replay.signal || "editorial";
  const honesty = honestyAgainstStored(replay, all, signal);
  console.log(
    JSON.stringify(
      {
        storedSucceeded: honesty.storedSucceeded,
        matched: honesty.matched,
        mismatched: honesty.mismatched,
        mismatches: honesty.rows.filter((r) => !r.match),
      },
      null,
      2
    )
  );
  process.exit(honesty.mismatched === 0 ? 0 : 2);
}

loadLocalEnvFiles({ liveMeasurement: true });
process.env.BRIGHTLINE_EDITORIAL_REVIEW = process.env.BRIGHTLINE_EDITORIAL_REVIEW || "1";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const stage = String(args.stage || "editorial").trim();
if (stage !== "editorial" && stage !== "compliance") {
  console.error("this harness currently supports --stage editorial or --stage compliance");
  process.exit(1);
}

const fixturePath = args.fixture;
if (!fixturePath) {
  console.error("missing --fixture");
  process.exit(1);
}

const payload = JSON.parse(readFileSync(path.resolve(ROOT, fixturePath), "utf8"));
const all = loadReviewStatements(payload);
const byIndex = new Map(all.map((s) => [s.index, s]));
const draftText = reconstructDraft(payload);
const sources = reconstructSources(payload);
const outputType = String(args.outputType || DEFAULT_OUTPUT_TYPE);
const requiredVersion = String(args.requiredVersion || DEFAULT_REQUIRED_VERSION);
const house = args.house === "" ? null : String(args.house || DEFAULT_HOUSE);
const subsetN = args.subset != null && args.subset !== true ? Number(args.subset) : null;
const succeededOnly = args["succeeded-only"] === true;
const documentLevelSplit = args["document-level"] === true;

let indexes;
if (subsetN && Number.isFinite(subsetN)) {
  indexes = selectSubset(all, subsetN, stage);
} else {
  indexes = all.map((s) => s.index);
}
if (succeededOnly) {
  indexes = indexes.filter((i) => {
    const s = byIndex.get(i);
    if (!s) return false;
    return stage === "compliance" ? complianceSucceeded(s.qcCard) : editorialSucceeded(s.qcCard);
  });
}

const { runEditorialComplianceReview } = await import("../../../lib/qc/editorial-compliance-reviewer.mjs");
const { mapPoolPaced } = await import("../../../lib/qc/map-pool.mjs");
const { planFromLiveBudget, formatScheduleLog } = await import("../../../lib/qc/stage-schedule.mjs");
const { beginRequestBudget } = await import("../../../lib/qc/request-budget.mjs");
const {
  attachedByIndex,
  mergeDocumentLevelConcerns,
  runDocumentLevelReview,
} = await import("../../../lib/qc/document-level-review.mjs");
const {
  flushObservability,
  getLlmPricingTable,
  getLlmSpend,
  hasProviderApiKey,
  resetLlmSpend,
} = await import("../../../lib/observability.js");

if (!hasProviderApiKey("openai")) {
  console.error("missing OPENAI_API_KEY");
  process.exit(1);
}

const n = indexes.length;
const meanIn = stage === "editorial" ? 14813 : 3345;
const estList = (n * meanIn * 2.5 + n * 150 * 10) / 1_000_000;
beginRequestBudget({ model: "gpt-4o-2024-08-06" });
const tokensPer = meanIn + 400;
const plan = planFromLiveBudget({ statementCount: n, tokensPerStatement: tokensPer, stage: "stage-replay" });
console.log(formatScheduleLog(plan, { stage: "stage-replay", remainingSource: plan.remainingSource }));
console.log(
  `stage-replay stage=${stage} statements=${n} pool=${plan.concurrency} ` +
    `documentLevel=${documentLevelSplit} estListUsd=${estList.toFixed(2)} (before calling)`
);

resetLlmSpend();
const t0 = Date.now();

const reviewStatements = indexes.map((index) => {
  const s = byIndex.get(index);
  return {
    index,
    text: s.text,
    qcCard: emptyEditorialCard(),
  };
});

let documentLevel = null;
if (stage === "editorial" && documentLevelSplit) {
  documentLevel = await runDocumentLevelReview({
    draftText,
    sentences: all.map((s) => ({
      index: s.index,
      text: s.text,
      charStart: s.qcCard?.charStart,
      charEnd: s.qcCard?.charEnd,
    })),
    outputType,
    requiredVersion,
    authoringOrganisation: house,
  });
}

await mapPoolPaced(reviewStatements, plan.concurrency, async (reviewStatement) => {
  const neighbours = neighbourTexts(all, reviewStatement.index);
  await runEditorialComplianceReview([reviewStatement], {
    pipelineRoute: "v4",
    outputType,
    requiredVersion,
    sources,
    draftText,
    authoringOrganisation: house,
    editorialEnabled: stage === "editorial",
    complianceEnabled: stage === "compliance",
    previousStatementText: neighbours.previousStatementText,
    nextStatementText: neighbours.nextStatementText,
    editorialSourceExcerpt: null,
    statementIndex: reviewStatement.index,
  });
});

if (documentLevel && documentLevel.status === "reviewed") {
  const byIdx = attachedByIndex(documentLevel.attached);
  for (const reviewStatement of reviewStatements) {
    mergeDocumentLevelConcerns(reviewStatement.qcCard, byIdx.get(reviewStatement.index));
  }
}

const wallMs = Date.now() - t0;
const spendRaw = getLlmSpend();
const pricing = getLlmPricingTable();
const spend = {
  calls: spendRaw.calls,
  inputTokens: spendRaw.inputTokens,
  cachedInputTokens: spendRaw.cachedInputTokens,
  outputTokens: spendRaw.outputTokens,
  unpricedCalls: spendRaw.unpricedCalls,
  listUsd: Number(listCostFromSpend(spendRaw, pricing).toFixed(6)),
  discountedUsd: Number((spendRaw.costUsd || 0).toFixed(6)),
  cacheHitRate: Number(cacheHitRate(spendRaw).toFixed(6)),
  byModel: spendRaw.byModel,
};

const statementsOut = reviewStatements.map((s) => {
  const succeeded =
    stage === "compliance" ? complianceSucceeded(s.qcCard) : editorialSucceeded(s.qcCard);
  const concerns = Array.isArray(s.qcCard?.editorialConcerns) ? s.qcCard.editorialConcerns : [];
  return {
    index: s.index,
    text: s.text,
    verdict: signalVerdict(s.qcCard, stage),
    codes: concernCodes(s.qcCard, stage),
    documentLevelCodes: concerns
      .filter((c) => c?.source === "document_level")
      .map((c) => c.concernCode)
      .filter(Boolean)
      .sort(),
    succeeded,
  };
});

const result = {
  stage,
  fixture: fixturePath,
  house,
  outputType,
  requiredVersion,
  subset: subsetN,
  succeededOnly,
  documentLevelSplit,
  indexes,
  documentLevel: documentLevel
    ? {
        status: documentLevel.status,
        attachedCount: documentLevel.attachedCount,
        unplacedCount: documentLevel.unplacedCount,
        cardsWithFindings: documentLevel.cardsWithFindings,
        unplaced: documentLevel.unplaced,
        attached: (documentLevel.attached || []).map((row) => ({
          index: row.index,
          ruleId: row.concern?.concernCode || null,
          quote: typeof row.concern?.quote === "string" ? row.concern.quote.slice(0, 80) : "",
        })),
      }
    : null,
  wallMs,
  spend,
  statements: statementsOut,
};

const outPath = args.out
  ? path.resolve(ROOT, String(args.out))
  : path.join(ROOT, "scripts/diagnostic/runs/stage-replay", `${stage}-${Date.now()}.json`);
mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`);
await flushObservability();

printTable("spend", [spend]);
console.log(`wrote ${outPath}`);
console.log(
  `succeeded ${statementsOut.filter((s) => s.succeeded).length}/${statementsOut.length} wallMs=${wallMs}`
);
