/**
 * B277. Derive Stage 5 / Stage 6 concurrency from the work in front of the
 * stage. Deterministic. No model call. No randomness.
 */

import {
  countWords,
  estimateStatementCount,
  estimateTokensFromChars,
  tpmDefaultForModel,
  tpmFloorMs,
} from "./token-estimate.mjs";
import { budgetSnapshot } from "./request-budget.mjs";

export function planStageConcurrency({
  statementCount,
  tokensPerStatement,
  remainingTokens,
  tpmLimit,
} = {}) {
  const n = Math.max(1, Math.floor(Number(statementCount) || 1));
  const per = Math.max(1, Math.floor(Number(tokensPerStatement) || 1));
  const remaining = Math.max(0, Math.floor(Number(remainingTokens) || 0));
  const limit = Math.max(1, Math.floor(Number(tpmLimit) || remaining || 1));
  const totalTokens = n * per;
  let concurrency;
  let why;
  if (totalTokens <= remaining) {
    concurrency = n;
    why = "fits_remaining_one_wave";
  } else {
    concurrency = Math.max(1, Math.min(n, Math.floor(remaining / per) || 1));
    why = "burst_inside_remaining_window";
  }
  return {
    statementCount: n,
    tokensPerStatement: per,
    totalTokens,
    remainingTokens: remaining,
    tpmLimit: limit,
    concurrency,
    waves: Math.ceil(n / concurrency),
    why,
  };
}

export function formatScheduleLog(plan, extra = {}) {
  const stage = extra.stage ? String(extra.stage) : "stage";
  const source = extra.remainingSource ? String(extra.remainingSource) : "unknown";
  return (
    `[SCHEDULE] stage=${stage} statements=${plan.statementCount} ` +
    `tokensPerCall=${plan.tokensPerStatement} total=${plan.totalTokens} ` +
    `budgetTpm=${plan.tpmLimit} remaining=${plan.remainingTokens} remainingSource=${source} ` +
    `concurrency=${plan.concurrency} waves=${plan.waves} why=${plan.why}`
  );
}

export function estimateReviewWork({
  draftText,
  sources,
  editorialSystemTokens,
  complianceSystemTokens,
  stage2SystemTokens,
  stage5SystemTokens,
  tpmLimit,
} = {}) {
  const draft = typeof draftText === "string" ? draftText : "";
  const list = Array.isArray(sources) ? sources : [];
  const draftTokens = estimateTokensFromChars(draft);
  const sourceTokens = list.reduce((sum, src) => {
    const text = typeof src?.text === "string" ? src.text : typeof src === "string" ? src : "";
    return sum + estimateTokensFromChars(text);
  }, 0);
  const words = countWords(draft);
  const statements = estimateStatementCount(words);
  const sourceCount = Math.max(list.length, 0);
  const editorialSys = Math.max(0, Number(editorialSystemTokens) || 0);
  const complianceSys = Math.max(0, Number(complianceSystemTokens) || 0);
  const stage2Sys = Math.max(0, Number(stage2SystemTokens) || 0);
  const stage5Sys = Math.max(0, Number(stage5SystemTokens) || 0);

  const stage1Tokens = 3_000 + draftTokens + statements * 40;
  const stage1bTokens = 2_500;
  const stage2Tokens =
    sourceCount > 0
      ? statements * sourceCount * (stage2Sys + Math.max(40, Math.ceil(draftTokens / Math.max(statements, 1))) + sourceTokens)
      : 0;
  const stage6Editorial = statements * (editorialSys + draftTokens + 200);
  const stage6Compliance = statements * (complianceSys + 400);
  const stage5Tokens = statements * (stage5Sys + 200);
  const totalTokens = stage1Tokens + stage1bTokens + stage2Tokens + stage6Editorial + stage6Compliance + stage5Tokens;
  const tpm = Math.max(1, Number(tpmLimit) || tpmDefaultForModel("gpt-4o-2024-08-06"));
  const tpmMs = tpmFloorMs(totalTokens, tpm);
  return {
    wordCount: words,
    statementCount: statements,
    sourceCount,
    draftTokens,
    sourceTokens,
    totalTokens,
    tpmLimit: tpm,
    tpmFloorMs: tpmMs,
    parts: {
      stage1Tokens,
      stage1bTokens,
      stage2Tokens,
      stage6Editorial,
      stage6Compliance,
      stage5Tokens,
    },
  };
}

export function planFromLiveBudget({ statementCount, tokensPerStatement, stage } = {}) {
  const snap = budgetSnapshot();
  const plan = planStageConcurrency({
    statementCount,
    tokensPerStatement,
    remainingTokens: snap.remainingTokens,
    tpmLimit: snap.tpmLimit,
  });
  return { ...plan, remainingSource: snap.remainingSource, stage: stage || null };
}
