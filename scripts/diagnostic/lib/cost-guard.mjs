/**
 * B563. Diagnostic Review and Generate runs print a cost estimate and stop
 * when it is over the cap, or when a Review source is over 6,000 words.
 * The 3i FY2025 PDF is never run through Review in tests.
 */

import { countWords, estimateStatementCount } from "../../../lib/qc/token-estimate.mjs";
import { estimateReviewCostUsd, tokensSentForReview } from "../../../lib/qc/review-cost-warning.mjs";
import { setSpendListener } from "../../../lib/observability.js";

export const DIAGNOSTIC_COST_CAP_USD = 3;
export const REVIEW_SOURCE_WORD_CAP = 6000;

const FY2025_3I = /3i[-_\s]?press[-_\s]?release[-_\s]?fy2025/i;

function hasFlag(argv, name) {
  return Array.isArray(argv) && argv.includes(name);
}

export function sourceLabel(source) {
  return String(source?.name || source?.file || source?.title || source?.label || "").trim();
}

function wordsOnSource(source) {
  if (Number.isFinite(source?.wordCount) && source.wordCount >= 0) return source.wordCount;
  if (typeof source?.text === "string") return countWords(source.text);
  return null;
}

/**
 * Refuse the 3i FY2025 PDF, and any Review source over 6,000 words
 * unless --allow-long-source is set. Sources with no word count yet are
 * left for the cost check, which refuses a missing count.
 */
export function assertReviewSourcesAllowed(sources, argv = process.argv) {
  if (!Array.isArray(sources)) throw new Error("cost guard: sources are missing");
  for (const source of sources) {
    if (FY2025_3I.test(sourceLabel(source))) {
      throw new Error("The 3i FY2025 PDF is never run through Review in tests.");
    }
  }
  if (hasFlag(argv, "--allow-long-source")) return;
  for (const source of sources) {
    const words = wordsOnSource(source);
    if (words == null || words <= REVIEW_SOURCE_WORD_CAP) continue;
    const name = sourceLabel(source) || "unnamed source";
    throw new Error(
      `Source "${name}" is ${words.toLocaleString("en-GB")} words. Review tests refuse a source over ${REVIEW_SOURCE_WORD_CAP.toLocaleString("en-GB")} words. Pass --allow-long-source to run it.`,
    );
  }
}

function resolveSources({ sources, body }) {
  if (Array.isArray(sources)) return sources;
  if (Array.isArray(body?.sources)) return body.sources;
  throw new Error("cost guard: sources are missing");
}

function resolveWords(list, sourceWords) {
  if (Number.isFinite(sourceWords) && sourceWords >= 0) return sourceWords;
  let sum = 0;
  for (const source of list) {
    const words = wordsOnSource(source);
    if (words == null) {
      throw new Error(`cost guard: source word count is missing for ${sourceLabel(source) || "unnamed source"}`);
    }
    sum += words;
  }
  return sum;
}

function resolveStatements({ kind, draftText, statementCount, sourceWords }) {
  if (Number.isFinite(statementCount) && statementCount >= 1) return statementCount;
  const draftWords = countWords(draftText);
  if (draftWords > 0) return estimateStatementCount(draftWords);
  if (kind === "generate") return estimateStatementCount(sourceWords);
  throw new Error("cost guard: statement count is missing");
}

/**
 * Print the estimate, then refuse a run over the cap unless --allow-over-cap
 * is set. Review also refuses the 3i FY2025 PDF and a source over 6,000 words.
 *
 * @param {{ kind: "review"|"generate", sources?: object[], body?: object, draftText?: string, statementCount?: number, sourceWords?: number, argv?: string[] }} input
 */
export async function guardDiagnosticRequest({
  kind,
  sources,
  body,
  draftText,
  statementCount,
  sourceWords,
  argv = process.argv,
} = {}) {
  const resolvedKind = kind || (typeof body?.kind === "string" ? body.kind : "");
  if (resolvedKind !== "review" && resolvedKind !== "generate") {
    throw new Error("cost guard: kind must be review or generate");
  }
  const list = resolveSources({ sources, body });
  if (resolvedKind === "review") {
    for (const source of list) {
      if (FY2025_3I.test(sourceLabel(source))) {
        throw new Error("The 3i FY2025 PDF is never run through Review in tests.");
      }
    }
  }
  const words = resolveWords(list, sourceWords);
  const draft = typeof draftText === "string"
    ? draftText
    : (typeof body?.draftText === "string" ? body.draftText : "");
  const statements = resolveStatements({
    kind: resolvedKind,
    draftText: draft,
    statementCount,
    sourceWords: words,
  });
  const chars = resolveChars(list);
  const sent = tokensSentForReview({ sourceChars: chars, statementCount: statements });
  const costUsd = estimateReviewCostUsd({ sourceChars: chars, statementCount: statements });
  const statementWord = statements === 1 ? "statement" : "statements";
  const line = `Estimated cost USD ${costUsd.toFixed(2)} (${sent.tokensSent.toLocaleString("en-GB")} tokens sent, ${statements} ${statementWord}).`;
  console.log(line);
  if (resolvedKind === "review") assertReviewSourcesAllowed(list, argv);
  if (resolvedKind === "review" && list.length === 1 && words > REVIEW_SOURCE_WORD_CAP && !hasFlag(argv, "--allow-long-source")) {
    const name = sourceLabel(list[0]) || "unnamed source";
    throw new Error(
      `Source "${name}" is ${words.toLocaleString("en-GB")} words. Review tests refuse a source over ${REVIEW_SOURCE_WORD_CAP.toLocaleString("en-GB")} words. Pass --allow-long-source to run it.`,
    );
  }
  if (costUsd > DIAGNOSTIC_COST_CAP_USD && !hasFlag(argv, "--allow-over-cap")) {
    throw new Error(`${line} That is above the USD ${DIAGNOSTIC_COST_CAP_USD} cap. Not running. Pass --allow-over-cap to run it.`);
  }
  return { costUsd, sourceWords: words, sourceChars: chars, tokensSent: sent.tokensSent, statementCount: statements };
}

function resolveChars(list) {
  let sum = 0;
  for (const source of list) {
    if (typeof source?.text !== "string") {
      throw new Error(`cost guard: source word count is missing for ${sourceLabel(source) || "unnamed source"}`);
    }
    sum += source.text.length;
  }
  return sum;
}

/**
 * Abort the run as soon as real spend passes the cap. The call that crossed
 * the cap is already in the accumulator. The next paid call does not start.
 */
export function armSpendCap(capUsd) {
  if (!Number.isFinite(capUsd) || capUsd <= 0) throw new Error("cost guard: the cap is missing");
  setSpendListener((spend) => {
    const cost = Number(spend?.costUsd) || 0;
    if (cost <= capUsd) return;
    const err = new Error(`cost guard: spend USD ${cost.toFixed(2)} passed the cap of USD ${capUsd.toFixed(2)}`);
    err.code = "cost_cap";
    err.spend = spend;
    throw err;
  });
}

export function disarmSpendCap() {
  setSpendListener(null);
}
