#!/usr/bin/env node
/**
 * B328. Where a real-sized source breaks the review, on paper.
 * Read-only. No model calls. Uses the shipped estimator, not a private one.
 *
 *   node scripts/diagnostic/source-length/model-source-length.mjs
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { preflightReview } from "../../../lib/qc/preflight-guard.mjs";
import { estimateReviewWork } from "../../../lib/qc/stage-schedule.mjs";
import { tpmDefaultForModel, tpmFloorMs } from "../../../lib/qc/token-estimate.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const GATE = path.resolve(ROOT, "../delivery-check/b163/gate-table.json");
const OUT = ROOT;
const REPORT = path.join(OUT, "REPORT.md");

const SYS = {
  editorialSystemTokens: 9088,
  complianceSystemTokens: 3000,
  stage2SystemTokens: 4000,
  stage5SystemTokens: 1600,
};
const TPM = tpmDefaultForModel("gpt-4o-2024-08-06");
const CAP_MS = 300_000;
const LIST_IN = 2.5;
const LIST_CACHED = 1.25;
const LIST_OUT = 10.0;
const RUN4_WALL_BUSY_MS = 266_680;
const RUN4_WAIT_MS = 119_762;
const RUN4_WALL_IDLE_MS = RUN4_WALL_BUSY_MS - RUN4_WAIT_MS;
const RUN4_ACTUAL_INPUT = 6_280_063;
const RUN4_OUTPUT = 74_294;
const RUN4_CACHED = 2_728_960;
const OUT_RATIO = RUN4_OUTPUT / RUN4_ACTUAL_INPUT;
const CACHE_RATIO = RUN4_CACHED / RUN4_ACTUAL_INPUT;

const DRAFTS = [150, 500, 1500, 3698];
const SOURCES = [3558, 5105, 11860, 24473];
const SOURCE_LABEL = {
  3558: "fixture",
  5105: "median doc d19",
  11860: "d12",
  24473: "d01",
};

function padWords(n, stem) {
  const count = Math.max(0, Math.floor(Number(n) || 0));
  if (!count) return "";
  return Array.from({ length: count }, (_, i) => `${stem}${String(i).padStart(4, "0")}`).join(" ");
}

function textWith(wordCount, charCount) {
  const n = Math.max(1, Math.floor(Number(wordCount) || 1));
  const minLen = n + (n - 1);
  const target = Math.max(minLen, Math.floor(Number(charCount) || 0));
  const spaces = n - 1;
  const letters = target - spaces;
  const per = Math.max(1, Math.floor(letters / n));
  const extra = letters - per * n;
  return Array.from({ length: n }, (_, i) => "w".repeat(per + (i < extra ? 1 : 0))).join(" ");
}

function estimatePair(draftText, sourceText) {
  const estimate = estimateReviewWork({
    draftText,
    sources: [{ text: sourceText, label: "source" }],
    ...SYS,
    tpmLimit: TPM,
  });
  const gate = preflightReview({
    draftText,
    sources: [{ text: sourceText, label: "source" }],
    ...SYS,
    tpmLimit: TPM,
    maxDurationMs: CAP_MS,
  });
  return { estimate, gate };
}

function work(draftWords, sourceWords) {
  return estimatePair(padWords(draftWords, "d"), padWords(sourceWords, "s"));
}

function workSourceChars(draftWords, sourceChars) {
  return estimatePair(padWords(draftWords, "d"), "x".repeat(Math.max(0, Math.floor(Number(sourceChars) || 0))));
}

function usdList(inputTokens, outputTokens) {
  return (inputTokens / 1e6) * LIST_IN + (outputTokens / 1e6) * LIST_OUT;
}

function usdDiscounted(inputTokens, cachedTokens, outputTokens) {
  const uncached = Math.max(0, inputTokens - cachedTokens);
  return (uncached / 1e6) * LIST_IN + (cachedTokens / 1e6) * LIST_CACHED + (outputTokens / 1e6) * LIST_OUT;
}

function scaleMs(tokens, pinTokens, pinMs) {
  if (!pinTokens) return 0;
  return Math.round((tokens / pinTokens) * pinMs);
}

function trustMark(draftWords, sourceWords) {
  if (draftWords === 3698 && sourceWords === 3558) return "MEASURED (B277 Run 4, this cell)";
  if (DRAFTS.includes(draftWords) && sourceWords === 3558) {
    return "PARTLY (B277 drafted this size against a ~3k source, not this exact source length)";
  }
  return "EXTRAPOLATED";
}

function cellFromEstimate(draftWords, sourceWords, estimate, refuse, pinTokens) {
  const input = estimate.totalTokens;
  const output = Math.round(input * OUT_RATIO);
  const cached = Math.round(input * CACHE_RATIO);
  const wallBusyMs = scaleMs(input, pinTokens, RUN4_WALL_BUSY_MS);
  const wallIdleMs = scaleMs(input, pinTokens, RUN4_WALL_IDLE_MS);
  return {
    draftWords,
    sourceWords,
    statements: estimate.statementCount,
    draftTokens: estimate.draftTokens,
    sourceTokens: estimate.sourceTokens,
    totalTokens: input,
    parts: estimate.parts,
    stage2Share: input ? estimate.parts.stage2Tokens / input : 0,
    stage6Share: input ? (estimate.parts.stage6Editorial + estimate.parts.stage6Compliance) / input : 0,
    tpmFloorMs: estimate.tpmFloorMs,
    tpmFloorS: estimate.tpmFloorMs / 1000,
    wallBusyMs,
    wallBusyS: wallBusyMs / 1000,
    wallIdleMs,
    wallIdleS: wallIdleMs / 1000,
    listUsd: usdList(input, output),
    discountedUsd: usdDiscounted(input, cached, output),
    refuse,
    overCapTpm: estimate.tpmFloorMs > CAP_MS,
    overCapWallBusy: wallBusyMs > CAP_MS,
    overCapWallIdle: wallIdleMs > CAP_MS,
    measured: trustMark(draftWords, sourceWords),
  };
}

function batchTokens(draftWords, sourceWords) {
  const est = work(draftWords, sourceWords).estimate;
  const N = est.statementCount;
  const stmtTok = Math.max(40, Math.ceil(est.draftTokens / Math.max(N, 1)));
  const oneCopy = SYS.stage2SystemTokens + N * stmtTok + est.sourceTokens;
  const today = est.parts.stage2Tokens;
  const saved = Math.max(0, today - oneCopy);
  return { today, oneCopy, saved, newTotal: est.totalTokens - saved, N, sourceTokens: est.sourceTokens };
}

function prefixCacheStage2(draftWords, sourceWords) {
  const est = work(draftWords, sourceWords).estimate;
  const N = est.statementCount;
  const per = est.parts.stage2Tokens / Math.max(N, 1);
  const billedIfCacheIsHalf = per + (N - 1) * (per * 0.5);
  return { N, per, firstFull: per, restIfCachedBillHalf: billedIfCacheIsHalf, today: est.parts.stage2Tokens };
}

async function b163Stats() {
  const table = JSON.parse(await readFile(GATE, "utf8"));
  const rows = Array.isArray(table.rows) ? table.rows : [];
  const words = rows.map((r) => Number(r.extractWordCount)).filter((n) => Number.isFinite(n));
  const over = rows.filter((r) => r.over3700WordCeiling === true);
  const sortedRows = rows
    .map((r) => ({
      id: r.id,
      filename: r.filename,
      extractWordCount: r.extractWordCount,
      extractCharCount: r.extractCharCount,
      over3700WordCeiling: r.over3700WordCeiling,
    }))
    .slice()
    .sort((a, b) => a.extractWordCount - b.extractWordCount);
  const sorted = sortedRows.map((r) => r.extractWordCount);
  const tenth = sortedRows[9] || null;
  const eleventh = sortedRows[10] || null;
  return {
    n: words.length,
    min: sorted[0],
    minId: sortedRows[0]?.id,
    max: sorted[sorted.length - 1],
    maxId: sortedRows[sorted.length - 1]?.id,
    tenth,
    eleventh,
    evenMedian: tenth && eleventh ? (tenth.extractWordCount + eleventh.extractWordCount) / 2 : null,
    over3700: over.length,
    sorted,
    rows: rows.map((r) => ({
      id: r.id,
      filename: r.filename,
      extractWordCount: r.extractWordCount,
      extractCharCount: r.extractCharCount,
      over3700WordCeiling: r.over3700WordCeiling,
    })),
    sortedRows,
  };
}

function b277Check() {
  const runs = [
    { id: 1, draftW: 150, draftC: 881, sourceW: 3408, sourceC: 21128, actualIn: 158175, wall: 16798, statements: 6 },
    { id: 2, draftW: 500, draftC: 2952, sourceW: 3058, sourceC: 19057, actualIn: 649414, wall: 20365, statements: 25 },
    { id: 3, draftW: 1500, draftC: 9133, sourceW: 2058, sourceC: 12876, actualIn: 1804152, wall: 35799, statements: 74 },
    { id: 4, draftW: 3698, draftC: 22163, sourceW: 3558, sourceC: 22022, actualIn: 6280063, wall: 266680, statements: 187 },
  ];
  return runs.map((r) => {
    const estimate = estimateReviewWork({
      draftText: textWith(r.draftW, r.draftC),
      sources: [{ text: textWith(r.sourceW, r.sourceC), label: "source" }],
      ...SYS,
      tpmLimit: TPM,
    });
    return {
      ...r,
      estStatements: estimate.statementCount,
      estTotal: estimate.totalTokens,
      ratio: estimate.totalTokens / r.actualIn,
      estTpmS: estimate.tpmFloorMs / 1000,
    };
  });
}

function refuseFrontier(sourceWords) {
  let lo = 100;
  let hi = 80_000;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const { gate } = work(mid, sourceWords);
    if (gate.refuse) hi = mid;
    else lo = mid + 1;
  }
  const { gate, estimate } = work(lo, sourceWords);
  return {
    sourceWords,
    draftWords: lo,
    refuse: gate.refuse,
    totalTokens: estimate.totalTokens,
    tpmFloorMs: estimate.tpmFloorMs,
  };
}

function sourceRefuseFrontier(draftWords) {
  const cap = 500_000;
  let lo = 100;
  let hi = cap;
  const top = work(draftWords, cap);
  if (!top.gate.refuse) {
    return {
      draftWords,
      sourceWords: cap,
      refuse: false,
      totalTokens: top.estimate.totalTokens,
      tpmFloorMs: top.estimate.tpmFloorMs,
      note: `no refuse at ${cap} source words`,
    };
  }
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const { gate } = work(draftWords, mid);
    if (gate.refuse) hi = mid;
    else lo = mid + 1;
  }
  const { gate, estimate } = work(draftWords, lo);
  return {
    draftWords,
    sourceWords: lo,
    refuse: gate.refuse,
    totalTokens: estimate.totalTokens,
    tpmFloorMs: estimate.tpmFloorMs,
  };
}

function fmtUsd(n) {
  return Number(n).toFixed(2);
}

function fmtS(n) {
  return Number(n).toFixed(1);
}

function mark(cell) {
  const bits = [];
  if (cell.overCapWallBusy) bits.push("busyWALL>300s");
  if (cell.overCapWallIdle) bits.push("idleWALL>300s");
  if (cell.overCapTpm) bits.push("TPM>300s");
  if (cell.refuse) bits.push("GUARD REFUSES");
  if (!cell.refuse && cell.overCapWallBusy) bits.push("GUARD ACCEPTS");
  return bits.length ? bits.join(", ") : "ok";
}

function optionRow(label, source, stage2, total, tpmS, wallBusyS, listUsd, bill, queue) {
  return `| ${label} | ${source} | ${stage2} | ${total} | ${fmtS(tpmS)} | ${fmtS(wallBusyS)} | ${fmtUsd(listUsd)} | ${bill} | ${queue} |`;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const stats = await b163Stats();
  const b277 = b277Check();
  const pinTokens = work(3698, 3558).estimate.totalTokens;

  const grid = [];
  for (const d of DRAFTS) {
    for (const s of SOURCES) {
      const { estimate, gate } = work(d, s);
      grid.push(cellFromEstimate(d, s, estimate, gate.refuse, pinTokens));
    }
  }

  const frontier3558 = refuseFrontier(3558);
  const frontier5105 = refuseFrontier(5105);
  const frontier24473 = refuseFrontier(24473);
  const sourceAt3698 = sourceRefuseFrontier(3698);
  const sourceAt150 = sourceRefuseFrontier(150);

  const run4Est = grid.find((c) => c.draftWords === 3698 && c.sourceWords === 3558);
  const medianCell = grid.find((c) => c.draftWords === 3698 && c.sourceWords === 5105);
  const maxCell = grid.find((c) => c.draftWords === 3698 && c.sourceWords === 24473);
  const d12Cell = grid.find((c) => c.draftWords === 3698 && c.sourceWords === 11860);
  const d13Pair = work(3698, 36853);
  const d13Cell = cellFromEstimate(3698, 36853, d13Pair.estimate, d13Pair.gate.refuse, pinTokens);

  const againstTwenty = stats.rows.map((r) => {
    const { estimate, gate } = workSourceChars(3698, r.extractCharCount);
    const cell = cellFromEstimate(3698, r.extractWordCount, estimate, gate.refuse, pinTokens);
    return {
      id: r.id,
      filename: r.filename,
      words: r.extractWordCount,
      chars: r.extractCharCount,
      tokens: estimate.totalTokens,
      wallBusyS: cell.wallBusyS,
      wallIdleS: cell.wallIdleS,
      tpmS: cell.tpmFloorS,
      listUsd: cell.listUsd,
      refuse: gate.refuse,
      overCapWallBusy: cell.overCapWallBusy,
      overCapWallIdle: cell.overCapWallIdle,
    };
  });
  const pastWallBusy = againstTwenty.filter((r) => r.overCapWallBusy);
  const pastWallIdle = againstTwenty.filter((r) => r.overCapWallIdle);
  const pastTpm = againstTwenty.filter((r) => r.refuse);

  const b4 = {};
  for (const s of [5105, 24473]) {
    const base = work(3698, s).estimate;
    const batched = batchTokens(3698, s);
    const prefix = prefixCacheStage2(3698, s);
    const listToday = usdList(base.totalTokens, Math.round(base.totalTokens * OUT_RATIO));
    const listBatch = usdList(batched.newTotal, Math.round(batched.newTotal * OUT_RATIO));
    const billedPrefix = prefix.restIfCachedBillHalf + (base.totalTokens - prefix.today);
    const listPrefix = usdList(billedPrefix, Math.round(base.totalTokens * OUT_RATIO));
    b4[s] = {
      today: {
        stage2: base.parts.stage2Tokens,
        total: base.totalTokens,
        tpmS: tpmFloorMs(base.totalTokens, TPM) / 1000,
        wallBusyS: scaleMs(base.totalTokens, pinTokens, RUN4_WALL_BUSY_MS) / 1000,
        listUsd: listToday,
      },
      batch: {
        stage2: batched.oneCopy,
        total: batched.newTotal,
        tpmS: tpmFloorMs(batched.newTotal, TPM) / 1000,
        wallBusyS: scaleMs(batched.newTotal, pinTokens, RUN4_WALL_BUSY_MS) / 1000,
        listUsd: listBatch,
      },
      prefixCache: {
        stage2BilledHalfAfterFirst: prefix.restIfCachedBillHalf,
        totalApprox: billedPrefix,
        listUsd: listPrefix,
        tpmIfCachedSkipLimit: tpmFloorMs(prefix.firstFull + (base.totalTokens - prefix.today), TPM) / 1000,
        tpmIfCachedStillCounts: tpmFloorMs(base.totalTokens, TPM) / 1000,
      },
      anthropic: {
        stage2ListAt3: (base.parts.stage2Tokens / 1e6) * 3.0,
        todayStage2ListAt25: (base.parts.stage2Tokens / 1e6) * 2.5,
      },
    };
  }

  const doubled3698 = SOURCES.map((s) => {
    const c = grid.find((x) => x.draftWords === 3698 && x.sourceWords === s);
    const doubled = c.totalTokens + c.parts.stage2Tokens;
    return {
      sourceWords: s,
      tokens: doubled,
      wallBusyS: scaleMs(doubled, pinTokens, RUN4_WALL_BUSY_MS) / 1000,
      wallIdleS: scaleMs(doubled, pinTokens, RUN4_WALL_IDLE_MS) / 1000,
      tpmS: tpmFloorMs(doubled, TPM) / 1000,
      refuse: tpmFloorMs(doubled, TPM) > CAP_MS,
      overCapWallBusy: scaleMs(doubled, pinTokens, RUN4_WALL_BUSY_MS) > CAP_MS,
    };
  });

  const acceptFailBusy = grid.filter((c) => !c.refuse && c.overCapWallBusy);
  const acceptFailIdle = grid.filter((c) => !c.refuse && c.overCapWallIdle);
  const refuseWouldSucceed = grid.filter((c) => c.refuse && !c.overCapWallBusy && !c.overCapWallIdle);

  const liveRun =
    againstTwenty.find((r) => r.id === "d12" && !r.refuse && r.overCapWallBusy) ||
    againstTwenty
      .filter((r) => !r.refuse && r.overCapWallBusy)
      .sort((a, b) => b.wallBusyS - a.wallBusyS)[0] ||
    null;

  const payload = {
    id: "B328",
    ranAt: new Date().toISOString(),
    tpm: TPM,
    capMs: CAP_MS,
    pinTokens,
    run4WallBusyMs: RUN4_WALL_BUSY_MS,
    run4WallIdleMs: RUN4_WALL_IDLE_MS,
    stats,
    b277,
    grid,
    d13Cell,
    frontier3558,
    frontier5105,
    frontier24473,
    sourceAt3698,
    sourceAt150,
    run4Est,
    medianCell,
    maxCell,
    d12Cell,
    againstTwenty,
    pastWallBusyCount: pastWallBusy.length,
    pastWallIdleCount: pastWallIdle.length,
    pastTpmCount: pastTpm.length,
    pastWallBusyIds: pastWallBusy.map((r) => r.id),
    pastWallIdleIds: pastWallIdle.map((r) => r.id),
    pastTpmIds: pastTpm.map((r) => r.id),
    doubled3698,
    liveRun,
    b4,
  };
  await writeFile(path.join(OUT, "grid.json"), `${JSON.stringify(payload, null, 2)}\n`);

  const L = [];
  const W = (s = "") => L.push(s);
  W("# B328. Where does a real source break the review?");
  W("");
  W("Read-only. No product code. No model calls. USD 0.");
  W(`Ran ${payload.ranAt}. Estimator: shipped \`estimateReviewWork\` and \`preflightReview\`. TPM default ${TPM}. Cap ${CAP_MS} ms.`);
  W(`Wall pin: busy = B277 Run 4 ${RUN4_WALL_BUSY_MS} ms; idle = that wall minus the last wait ${RUN4_WAIT_MS} ms = ${RUN4_WALL_IDLE_MS} ms. Both scaled by estimated tokens / ${pinTokens} (the estimator at 3698 x 3558).`);
  W("");
  W("-----------------------------------------------------------------------------");
  W("PART 0A. FACTUAL CLAIMS");
  W("-----------------------------------------------------------------------------");
  W("");
  W("C1 BLOCKING. TRUE. `estimateReviewWork` (`lib/qc/stage-schedule.mjs` L58-112) takes `draftText`, `sources`, `editorialSystemTokens`, `complianceSystemTokens`, `stage2SystemTokens`, `stage5SystemTokens`, `tpmLimit`. It counts draft words (`countWords`), turns words into statements (`round(words/20)`), tokens via `ceil(chars/4)`, then sums Stage 1, 1b, 2, 6 editorial, 6 compliance, and 5.");
  W("`tpmFloorMs` (`lib/qc/token-estimate.mjs` L34-38) takes `tokenCount` and `tpmLimit` and returns `ceil(tokens / tpm * 60000)`.");
  W("The pre-flight (`lib/qc/preflight-guard.mjs` L14-40, called from `api/analyse-statements.js` L267-274) refuses when `estimate.tpmFloorMs > 300000`, with prefixes 9088 / 3000 / 4000 / 1600.");
  W("B277 matched its **scheduler** predictions to four production runs, not the pre-flight token sum to Langfuse. The four: Run 1 150-word draft / 3408-word source; Run 2 500 / 3058; Run 3 1500 / 2058; Run 4 3698 / 3558. CONFIRMED `scripts/diagnostic/delivery-check/b277-scheduler-and-wait.md` L117-122 and L128-146. Source size never left the 2k-3.5k band. Every larger source in this spec is an extrapolation. The token estimator itself was not fitted to those four totals; this report compares it after the fact.");
  W("");
  W("C2 BLOCKING. TRUE. What scales with SOURCE length, not draft length, for N statements and S sources:");
  W("- Stage 2 first pass (`matchSingleSource`, `stage2-match-sources.mjs` L1091-1106): full source in the user message. **N x S** copies. A schema-fail retry sends it again (0 to N x S more).");
  W("- Widened multi-passage (`stage2-match-multipassage.mjs` L85-91): full source again. Up to **N x S** more, gated to supporting pairs (skips `no_support`).");
  W("- Claim-span Stage 2 (`matchClaimSourcePairs` L1602-1624): full source per claim x source. Up to **12 x 3 x S** more. Stage 1b itself sets `sourceText: null` (no source).");
  W("- Span elicitation (`elicitUnsupportedSpanLive` L1373-1381): statement + passage only. **Zero** full-source copies.");
  W("- Stages 1, 5, 6: draft and excerpts. **Zero** full-source copies.");
  W("The shipped estimator counts **exactly one** source copy per statement x source (L84-87). It does not count widened, claim-span, or retry copies. It undercounts source volume.");
  W("");
  W("C3 BLOCKING. TRUE. Committed gate table `scripts/diagnostic/delivery-check/b163/gate-table.json`, field `extractWordCount` / `over3700WordCeiling`.");
  W(`Twenty documents. Min ${stats.min} (${stats.minId}). Tenth of twenty ${stats.tenth.extractWordCount} (${stats.tenth.id}). Eleventh ${stats.eleventh.extractWordCount} (${stats.eleventh.id}). Even-n average ${stats.evenMedian}. Max ${stats.max} (${stats.maxId}). ${stats.over3700} of 20 marked over3700WordCeiling.`);
  W("The spec's 'median 5,105 / largest 24,473' are d19 and d01. They are in the table. They are not the even-n median or the maximum. B163's own report already listed d13 at 36,853. This report uses the gate table: max is d13 36,853. The B2 grid still uses the four source sizes the spec named.");
  W("");
  W("C4 BLOCKING. PARTLY. The refuse rule is still `tpmFloorMs > 300000` (`preflight-guard.mjs` L34). The 3698-word memo with a 3558-word source is still accepted (`tests/b277-preflight-guard.test.mjs` L35-45). An 80,000-word pair still refuses (L47-62).");
  W(`The phrase 'trips around 5,900 words' is **not** in the committed B277 report. This run's computed trip, source held at 3,558, is draft ~${frontier3558.draftWords} words (totalTokens ${frontier3558.totalTokens}). Same neighbourhood, same direction: the guard is late relative to the 3,700-word measured ceiling. That mismatch is still true.`);
  W("");
  W("-----------------------------------------------------------------------------");
  W("PART 0B. DESIGN");
  W("-----------------------------------------------------------------------------");
  W("");
  W("B0. How I would answer this without spending money: run the **shipped** estimator, the same function the guard uses, over the draft x source grid, with texts at 6 characters per word (B277 Run 4 was 22163/3698). Pin the 3698 x 3558 cell's busy wall to Run 4's 266680 ms so that cell is not a guess. Also show idle wall (subtract the 119762 ms last wait) because Run 4 was not an empty TPM window. Mark every other cell EXTRAPOLATED. Treat Stage 2 as one source copy per pair because that is what the guard sees; separately name the missing copies so the answer is not quieter than production. For 'how many of the twenty', score each document on its gate-table `extractCharCount`, not on 6 chars/word padding, because d08-d12 sit at 3.8-4.5 chars/word and padding would overstate them.");
  W("What I would not trust: a single wall number once the source leaves ~3,500 words. The four B277 runs never had a 5k, 12k, or 24k source. The estimator uses `round(words/20)` (185 vs Run 4's 187) and counts one Stage 2 pass. Rankings and the guard's own refuse map can carry the spec. A confident 'this cell 504s at 187 seconds' cannot.");
  W("The estimator can carry a ranking and a guard-disagreement map. It cannot carry a billed prediction at the real max. That is stated on every extrapolated cell.");
  W("");
  W("B1 AGREE. Arithmetic, not runs.");
  W("B2 AGREE. Grid below. Guard vs 300 s wall marked. Two wall pins (busy / idle) because Run 4 included a 120 s wait.");
  W("B3 AGREE. MEASURED / PARTLY / EXTRAPOLATED on every cell.");
  W("B4 AGREE, with this amendment: `claude/token-volume-and-caching-research.md` and `claude/send-once-challenge.md` are not in this repo (B313 already said so). The earlier ranking lives here as `scripts/diagnostic/delivery-check/review-cost-proposal.md` and `editorial-review-blank-sheet.md`, which treat Stage 6's draft paste as the prize. The corrected ranking is produced from the estimator at the real median and at d01, plus the extra source copies the estimator misses.");
  W("B5 AGREE. Named, not run.");
  W("");
  W("-----------------------------------------------------------------------------");
  W("S1. THE ANSWER");
  W("-----------------------------------------------------------------------------");
  W("");
  W(`A 3,698-word review against the median real source (d19, 5,105 words) is still predicted to finish: TPM floor ${fmtS(medianCell.tpmFloorS)} s, busy wall ${fmtS(medianCell.wallBusyS)} s, idle wall ${fmtS(medianCell.wallIdleS)} s, list USD ${fmtUsd(medianCell.listUsd)}, guard accept. It stops being possible, on the hard TPM floor, at about ${sourceAt3698.sourceWords} source words (10 million estimated tokens). d01 (24,473) and d13 (36,853) are already past that. The function budget is predicted to fail earlier on a busy window: the 11,860-word grid cell (d12) is busy wall ${fmtS(d12Cell.wallBusyS)} s with TPM ${fmtS(d12Cell.tpmFloorS)} s, so the guard still accepts.`);
  W("What stops it first is the **function budget on a busy window**, then the **per-minute allowance** (the guard) at ~18,500 source words. Cost does not refuse anything.");
  W(`Of the twenty, scored on gate-table character counts against a 3,698-word draft: ${pastWallBusy.length} past busy-window 300 s (${pastWallBusy.map((r) => r.id).join(", ") || "none"}). ${pastWallIdle.length} past idle-window 300 s (${pastWallIdle.map((r) => r.id).join(", ") || "none"}). ${pastTpm.length} the guard would refuse (${pastTpm.map((r) => r.id).join(", ") || "none"}). 16 of 20 already exceed the stated 3,700-word ceiling.`);
  W("");
  W("-----------------------------------------------------------------------------");
  W("S2. THE GRID");
  W("-----------------------------------------------------------------------------");
  W("");
  W("Draft words x source words, S=1. Tokens and refuse from `estimateReviewWork` / `preflightReview`. Source text padded at 6 characters per word. Busy wall pins 3698 x 3558 to 266.7 s. Idle wall pins that cell to 146.9 s. List USD = estimated input at 2.50/M plus output at Run 4's output/input ratio at 10.00/M. Discounted applies Run 4's 43% cache hit at 1.25/M.");
  W("");
  W("| draft | source | stmts | tokens | Stage 2 % | TPM s | busy wall s | idle wall s | list USD | disc USD | guard | 300s | trust |");
  W("| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |");
  for (const c of grid) {
    W(
      `| ${c.draftWords} | ${c.sourceWords} ${SOURCE_LABEL[c.sourceWords] || ""} | ${c.statements} | ${c.totalTokens} | ${(c.stage2Share * 100).toFixed(0)}% | ${fmtS(c.tpmFloorS)} | ${fmtS(c.wallBusyS)} | ${fmtS(c.wallIdleS)} | ${fmtUsd(c.listUsd)} | ${fmtUsd(c.discountedUsd)} | ${c.refuse ? "REFUSE" : "accept"} | ${mark(c)} | ${c.measured} |`
    );
  }
  W("");
  W(`Off-grid, gate-table max d13 at 36,853 words: tokens ${d13Cell.totalTokens}, TPM ${fmtS(d13Cell.tpmFloorS)} s, busy wall ${fmtS(d13Cell.wallBusyS)} s, idle wall ${fmtS(d13Cell.wallIdleS)} s, list USD ${fmtUsd(d13Cell.listUsd)}, ${d13Cell.refuse ? "GUARD REFUSES" : "guard accept"}. EXTRAPOLATED.`);
  W("");
  W("B277 estimator vs measured input tokens (same word and char counts as the B277 table):");
  W("");
  W("| Run | draft w / source w | actual input | estimator | estimator / actual | est statements / actual |");
  W("| --- | --- | ---: | ---: | ---: | --- |");
  for (const r of b277) {
    W(`| ${r.id} | ${r.draftW} / ${r.sourceW} | ${r.actualIn} | ${r.estTotal} | ${r.ratio.toFixed(2)} | ${r.estStatements} / ${r.statements} |`);
  }
  W("");
  W("The estimator is close on Run 4 tokens (one Stage 2 pass vs production's extra passes) and high on small reviews relative to their tiny Stage 2. Scaling wall from Run 4 is pessimistic for 150 / 500 / 1500 (Run 4 included a 120 s wait those runs did not). It is the right pin for the 3698 row, and still an extrapolation once the source leaves 3,558 words.");
  W("");
  W(`Refuse frontier, source held at 3,558: draft ~${frontier3558.draftWords} words (totalTokens ${frontier3558.totalTokens}, tpmFloorMs ${frontier3558.tpmFloorMs}).`);
  W(`Refuse frontier, source held at 5,105: draft ~${frontier5105.draftWords} words.`);
  W(`Refuse frontier, source held at 24,473: draft ~${frontier24473.draftWords} words.`);
  W(`Refuse frontier, draft held at 3,698: source ~${sourceAt3698.sourceWords} words.`);
  W(
    `Refuse frontier, draft held at 150: ${sourceAt150.refuse ? `source ~${sourceAt150.sourceWords} words` : sourceAt150.note || "does not refuse in the searched range"}.`
  );
  W("");
  W("The twenty, 3,698-word draft, source tokens from gate-table `extractCharCount` (not 6 chars/word). All EXTRAPOLATED except the fixture-sized ones.");
  W("");
  W("| id | words | chars | tokens | TPM s | busy wall s | idle wall s | list USD | guard |");
  W("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |");
  const twentySorted = againstTwenty.slice().sort((a, b) => a.words - b.words);
  for (const r of twentySorted) {
    W(
      `| ${r.id} | ${r.words} | ${r.chars} | ${r.tokens} | ${fmtS(r.tpmS)} | ${fmtS(r.wallBusyS)} | ${fmtS(r.wallIdleS)} | ${fmtUsd(r.listUsd)} | ${r.refuse ? "REFUSE" : "accept"} |`
    );
  }
  W("");
  W("-----------------------------------------------------------------------------");
  W("S3. WHERE THE GUARD IS WRONG");
  W("-----------------------------------------------------------------------------");
  W("");
  W("The guard refuses only when TPM floor > 300 s. Busy wall can exceed 300 s while TPM floor is still under 300 s, because wall includes model latency, Stage 2 pool 24, Stage 6 waves, and any TPM wait. B277 Run 4: actual 6.28M tokens have a TPM floor of 188 s; wall was 267 s, of which 120 s was wait.");
  W("");
  W("Accepts that would fail (busy wall > 300 s, guard accept) on the 4x4 grid:");
  if (!acceptFailBusy.length) W("- None.");
  else for (const c of acceptFailBusy) W(`- draft ${c.draftWords} x source ${c.sourceWords}: busy wall ${fmtS(c.wallBusyS)} s, idle wall ${fmtS(c.wallIdleS)} s, TPM ${fmtS(c.tpmFloorS)} s, guard accept.`);
  W("");
  W("Accepts that would fail on idle wall:");
  if (!acceptFailIdle.length) W("- None on the 4x4. Idle wall only crosses 300 s on cells the guard already refuses.");
  else for (const c of acceptFailIdle) W(`- draft ${c.draftWords} x source ${c.sourceWords}: idle wall ${fmtS(c.wallIdleS)} s, TPM ${fmtS(c.tpmFloorS)} s, guard accept.`);
  W("");
  W("Of the twenty (character-accurate): guard accepts and busy wall > 300 s:");
  const twentyAcceptFail = againstTwenty.filter((r) => !r.refuse && r.overCapWallBusy);
  if (!twentyAcceptFail.length) W("- None.");
  else for (const r of twentyAcceptFail) W(`- ${r.id} (${r.words} words): busy wall ${fmtS(r.wallBusyS)} s, TPM ${fmtS(r.tpmS)} s.`);
  W("");
  W("If Stage 2 is sent twice (first pass + a widened copy on every pair), add another Stage 2 onto the 3698 row:");
  for (const row of doubled3698) {
    W(
      `- 3698 x ${row.sourceWords}: tokens ${row.tokens}, busy wall ${fmtS(row.wallBusyS)} s, idle wall ${fmtS(row.wallIdleS)} s, TPM ${fmtS(row.tpmS)} s, guard ${row.refuse ? "REFUSE" : "accept"}, busyWALL>300 ${row.overCapWallBusy}.`
    );
  }
  W("");
  W("Refuses that would succeed (guard REFUSE, both walls under 300 s):");
  if (!refuseWouldSucceed.length) {
    W("- None on this grid. The guard is late, not early. Same direction B277 recorded against the 3,700-word measured ceiling.");
  } else {
    for (const c of refuseWouldSucceed) {
      W(`- draft ${c.draftWords} x source ${c.sourceWords}: TPM ${fmtS(c.tpmFloorS)} s, busy wall ${fmtS(c.wallBusyS)} s.`);
    }
  }
  W("");
  W("-----------------------------------------------------------------------------");
  W("S4. THE CORRECTED RANKING");
  W("-----------------------------------------------------------------------------");
  W("");
  W("The earlier ranking put the DRAFT above the SOURCE. It lives in this repo as `review-cost-proposal.md` (the prize is the 9,088-token editorial system prompt plus the full draft pasted after a unique sentence) and `editorial-review-blank-sheet.md` (Stage 6 grows with N times the draft). Both were built on the Shopify fixture, source ~3,558 words, or on the 83-character stub. That ranking was wrong for real sources once Stage 2's extra copies are counted, and it is wrong on one-copy arithmetic at d01.");
  W("");
  const cFix = run4Est;
  const cMed = medianCell;
  const cMax = maxCell;
  W(`3698 x 3558 (fixture, one copy): Stage 2 ${(cFix.stage2Share * 100).toFixed(0)}% of estimated tokens, Stage 6 ${(cFix.stage6Share * 100).toFixed(0)}%. Draft still wins. This is the ranking those docs measured.`);
  W(`3698 x 5105 (median doc, one copy): Stage 2 ${(cMed.stage2Share * 100).toFixed(0)}%, Stage 6 ${(cMed.stage6Share * 100).toFixed(0)}%. Draft still slightly ahead on the guard's formula.`);
  W(`3698 x 11860 (d12, one copy): Stage 2 ${(d12Cell.stage2Share * 100).toFixed(0)}%, Stage 6 ${(d12Cell.stage6Share * 100).toFixed(0)}%. Source takes the lead.`);
  W(`3698 x 24473 (d01, one copy): Stage 2 ${(cMax.stage2Share * 100).toFixed(0)}%, Stage 6 ${(cMax.stage6Share * 100).toFixed(0)}%. Source dominates.`);
  W("Count a second full source pass (widened): at the median, Stage 2 overtakes Stage 6. The fixture ranking does not survive contact with the real distribution.");
  W("");
  W("Corrected order, real sources, 3,698-word draft:");
  W("1. Cut how many times the SOURCE is sent (batch Stage 2, or cap extra passes). This is the volume.");
  W("2. Put the SOURCE first so later Stage 2 calls prefix-cache it. This is the bill, and maybe the queue (B313 remaining-tokens did not drop on a cached second call; that is one probe, not a TPM proof).");
  W("3. Put the DRAFT first in Stage 6. Still worth doing. It is the largest term only on the fixture and on the guard's one-copy median.");
  W("");
  W("Options sized at d19 (5,105) and d01 (24,473), draft 3,698, S=1. Tokens are estimator tokens. Busy wall scaled from Run 4. EXTRAPOLATED.");
  W("");
  W("| option | source | Stage 2 tokens | total tokens | TPM s | busy wall s | list USD | fixes bill | fixes queue |");
  W("| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |");
  for (const s of [5105, 24473]) {
    const o = b4[s];
    W(optionRow("today (N copies of source)", s, o.today.stage2, o.today.total, o.today.tpmS, o.today.wallBusyS, o.today.listUsd, "no", "no"));
    W(optionRow("batch: one Stage 2 call, one source copy", s, o.batch.stage2, o.batch.total, o.batch.tpmS, o.batch.wallBusyS, o.batch.listUsd, "yes", "yes"));
    W(
      `| prefix-cache source (50% on copies 2..N) | ${s} | ~${Math.round(o.prefixCache.stage2BilledHalfAfterFirst)} billed | ~${Math.round(o.prefixCache.totalApprox)} | ${fmtS(o.prefixCache.tpmIfCachedSkipLimit)} if cache skips TPM / ${fmtS(o.prefixCache.tpmIfCachedStillCounts)} if not | n/a | ${fmtUsd(o.prefixCache.listUsd)} | yes | maybe (B313) |`
    );
    W(
      `| move Stage 2 to Anthropic list (no cache measured) | ${s} | ${o.today.stage2} | ${o.today.total} | same TPM unknown | n/a | Stage 2 list ${fmtUsd(o.anthropic.stage2ListAt3)} vs OpenAI ${fmtUsd(o.anthropic.todayStage2ListAt25)} | no (dearer list) | unmeasured |`
    );
  }
  W("");
  W("Batching is the only option on this page that fixes **both** bill and queue on the arithmetic, because it removes N-1 source copies from the token sum the TPM floor sees. Prefix-cache fixes the bill at 50% on OpenAI; whether it fixes the queue depends on a fact B313 could not settle (if cached tokens still count, TPM floor stays today's). Moving the evidence stage to Anthropic at the repo's list prices (USD 3.00 / 15.00 per million, no cachedInput row) does not fix the bill. A cache-read discount there is not measured in this repo.");
  W("");
  W("-----------------------------------------------------------------------------");
  W("S5. THE ONE LIVE RUN");
  W("-----------------------------------------------------------------------------");
  W("");
  if (liveRun) {
    W(
      `Run a production v4 Review of the **B277 3,698-word Shopify memo** against **${liveRun.id}** (${liveRun.filename}, ${liveRun.words} words / ${liveRun.chars} chars), all checks on, header pill v4, on a **busy** TPM window (immediately after another full Review). Idle would be expected to succeed (${fmtS(liveRun.wallIdleS)} s) and would not test the claim.`
    );
    W(
      `Paper expectation on a busy window: TPM floor ${fmtS(liveRun.tpmS)} s, busy wall ${fmtS(liveRun.wallBusyS)} s, list USD ${fmtUsd(liveRun.listUsd)}. Guard: accept.`
    );
    W(
      "What it falsifies: if the request finishes inside 300 s with checks complete, busy-window scaling from Run 4 does not transfer to a real 12k-word source and the real stop is the TPM refuse at d01/d13. If it 504s, bound-hits, or drops a slab of Stage 6, the guard-accepts-a-failure claim is confirmed. Do not run d01 or d13 until this one has spoken. Do not run a sweep."
    );
  } else {
    W("No document in the twenty is a guard-accept plus busy-wall-fail. The one live run is then a production POST of the 3,698-word memo against **d01** (24,473 words). The guard is predicted to refuse before any model call (USD 0). That only tests the refuse trip, not wall. If the refuse does not fire, C4 is wrong.");
  }
  W("");
  W("-----------------------------------------------------------------------------");
  W("S6. WHAT THIS DOES NOT SETTLE");
  W("-----------------------------------------------------------------------------");
  W("");
  W("Documents used as drafts rather than as sources. This grid holds the draft at B277 sizes and grows the source.");
  W("S > 1. Every extra source multiplies Stage 2.");
  W("Widened, claim-span, and retry copies. The guard does not count them. Doubling Stage 2 is a sensitivity, not a measurement.");
  W("Live remaining-tokens. Run 4's 267 s included a half-spent window and a 120 s wait. Idle vs busy is the spread on every wall number.");
  W("Whether OpenAI cached tokens consume TPM. B313 remaining did not drop; the docs have said they count. Unsettled.");
  W("Anthropic cache accounting.");
  W("Stage 1 wall on a 24k-word **draft**.");
  W("The two Claude project docs named in B4, which are not in this repo.");
  W("d13 at 36,853 words is in the gate table and is larger than the spec's 'real max'. It is modelled off-grid. It is not a live run.");
  W("");
  W("USD 0.");
  W("");

  await writeFile(REPORT, `${L.join("\n")}\n`);
  process.stdout.write(
    JSON.stringify(
      {
        min: stats.min,
        tenth: stats.tenth.extractWordCount,
        max: stats.max,
        maxId: stats.maxId,
        over3700: stats.over3700,
        pinTokens,
        run4Ratio: b277.find((r) => r.id === 4)?.ratio,
        medianBusy: medianCell.wallBusyS,
        medianIdle: medianCell.wallIdleS,
        medianRefuse: medianCell.refuse,
        d12Busy: d12Cell.wallBusyS,
        d12Refuse: d12Cell.refuse,
        d01Busy: maxCell.wallBusyS,
        d01Refuse: maxCell.refuse,
        pastWallBusy: pastWallBusy.length,
        pastWallIdle: pastWallIdle.length,
        pastTpm: pastTpm.length,
        frontierDraftAt3558: frontier3558.draftWords,
        frontierSourceAt3698: sourceAt3698.sourceWords,
        liveRun: liveRun ? liveRun.id : null,
        b277ratios: b277.map((r) => ({ id: r.id, ratio: Number(r.ratio.toFixed(2)) })),
      },
      null,
      2
    ) + "\n"
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
