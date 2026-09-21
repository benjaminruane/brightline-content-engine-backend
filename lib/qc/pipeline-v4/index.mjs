// Pipeline v4 — QC rebuild route.
// See QC_Pipeline_Redesign_Architecture.docx for the
// target architecture (Stages 1–7).
// R2.2: Stage 1 (extract).
// R2.3: Stage 2 (match).
// R2.4+R2.5: Stages 3 (aggregate) + 4 (excerpts), deterministic.
// R2.6: Stage 5 commentary now owned by v4.
// B29: Honour review toggles (evidence / editorial / compliance).

import { generateCommentary } from "./stage5-generate-commentary.mjs";
import { runEditorialComplianceReview } from "../editorial-compliance-reviewer.mjs";
import { assembleCard } from "../pipeline-v3/stage7-assemble-card.mjs";
import { buildSkippedEvidenceQcCard } from "../evidence-skipped-fast-path.mjs";
import { extractStatements as extractStatementsV4 } from "./stage1-extract-statements.mjs";
import { matchAllSources as matchAllSourcesV4, matchClaimSourcePairs, isStage2SpanEnabled, buildUnsupportedSpans } from "./stage2-match-sources.mjs";
import {
  WIDENED_SCOPE,
  buildSupportSpans,
  matchMultipassagePair,
  pairNeedsWidenedPass,
} from "./stage2-match-multipassage.mjs";
import { applyIntraSourceReducer } from "./intra-source-reducer.mjs";
import { extractSourceAsOfDate } from "../source-recency.mjs";
import { resolveSupersession } from "../supersession.mjs";
import { aggregateVerdict as aggregateVerdictV4 } from "./stage3-aggregate-verdict.mjs";
import { selectExcerpts as selectExcerptsV4 } from "./stage4-select-excerpts.mjs";
import { extractClaimSpans } from "./stage1b-extract-claim-spans.mjs";
import {
  computeCoverageUnion,
  coverageUnionPromotionRecord,
  isMultisourceCoverageEnabled,
  shouldPromoteCoverageUnion,
} from "../coverage-union.mjs";
import {
  emptyClaimSpanPayload,
  isClaimSpansEnabled,
  residualHasUnclaimedAnchor,
  rollupClaimVerdicts,
} from "../claim-spans.mjs";
import { beginCacheRun, endCacheRun, isLlmCacheEnabled, logCacheRunSummary } from "../llm-cache.mjs";
import { logAuthoringOrganisationResolution } from "../first-person-actor.mjs";
import { mapPool, mapPoolPaced } from "../map-pool.mjs";
import { computeDraftCoverage } from "../draft-coverage.mjs";
import { estimateTokensFromChars } from "../token-estimate.mjs";
import { formatScheduleLog, planFromLiveBudget } from "../stage-schedule.mjs";
import {
  addRemainingWorkTokens,
  boundHitSnapshot,
  incrementBoundHit,
  rememberSchedule,
  setRemainingWorkTokens,
} from "../request-budget.mjs";
import {
  notReviewedReasonFromFailure,
  NOT_REVIEWED_REASONS,
} from "../not-reviewed-reason.mjs";

/** B271 measured mean editorial system prefix. Used only to size the plan. */
const EDITORIAL_SYSTEM_TOKENS = 9088;
/** B268 measured mean compliance call. Used only to size the plan. */
const COMPLIANCE_CALL_TOKENS = 3325;
/** Stage 5 system plus a short user payload. */
const STAGE5_CALL_TOKENS = 1800;

function stage6TokensPerStatement(draftText) {
  return EDITORIAL_SYSTEM_TOKENS + estimateTokensFromChars(draftText) + 500 + COMPLIANCE_CALL_TOKENS;
}

function planAndLogStage(stage, statementCount, tokensPerStatement) {
  const plan = planFromLiveBudget({ stage, statementCount, tokensPerStatement });
  rememberSchedule(plan);
  console.log(formatScheduleLog(plan, { stage, remainingSource: plan.remainingSource }));
  return plan;
}

function compactClaimMatches(matches) {
  return (Array.isArray(matches) ? matches : []).map((m) => ({
    sourceIndex: m.sourceIndex,
    sourceLabel: m.sourceLabel,
    classification: m.classification,
    passage: m.passage,
    explanation: m.explanation,
    systemFingerprint:
      m.systemFingerprint === undefined || m.systemFingerprint === null
        ? null
        : String(m.systemFingerprint),
  }));
}

function applySupersessionToClaimMatches({ statementText, sourceMatches, asOfBySourceIndex, today }) {
  const matches = (Array.isArray(sourceMatches) ? sourceMatches : []).map((m) => ({ ...m }));
  let agg = aggregateVerdictV4({ statementMatches: matches });
  const resolved = resolveSupersession({
    statement: statementText,
    aggregateVerdict: agg.verdict,
    sourceMatches: matches,
    asOfBySourceIndex,
    today,
  });
  if (resolved.verdictOverride) {
    const demoted = new Set((resolved.demotedSourceIndices || []).map(Number));
    for (const m of matches) {
      if (!demoted.has(Number(m.sourceIndex))) continue;
      m.originalClassification = m.classification;
      m.classification = "superseded";
    }
    agg = aggregateVerdictV4({ statementMatches: matches });
    agg = { ...agg, verdict: resolved.verdictOverride };
  }
  return { agg, matches, resolved };
}

function normalizeMatchClassification(value) {
  const c = typeof value === "string" ? value.trim() : "";
  if (c === "confirmed" || c === "partially_confirmed" || c === "conflicting" || c === "no_support") {
    return c;
  }
  if (c === "not_reviewed") return "not_reviewed";
  if (c === "superseded") return "superseded";
  return "no_support";
}

function resolveReviewToggles(options = {}) {
  return {
    evidenceEnabled: options.evidenceEnabled === true,
    editorialEnabled: options.editorialEnabled === true,
    complianceEnabled: options.complianceEnabled === true,
  };
}

function notReviewedEditorialResult(toggles, reason) {
  const why = typeof reason === "string" && reason.trim() ? reason.trim() : null;
  return {
    editorialVerdict: toggles.editorialEnabled ? "not_reviewed" : null,
    editorialConcerns: toggles.editorialEnabled ? [] : null,
    editorialNote: toggles.editorialEnabled ? "" : null,
    editorialSuggestedDirection: null,
    editorialSuggestedRewrite: null,
    editorialNotReviewedReason: toggles.editorialEnabled ? why : null,
    complianceVerdict: toggles.complianceEnabled ? "not_reviewed" : null,
    complianceConcerns: toggles.complianceEnabled ? [] : null,
    complianceNote: toggles.complianceEnabled ? "" : null,
    complianceSuggestedDirection: null,
    complianceSuggestedRewrite: null,
    complianceNotReviewedReason: toggles.complianceEnabled ? why : null,
  };
}

function mapStage1StatementsOut(stage1Result) {
  return Array.isArray(stage1Result?.statements)
    ? stage1Result.statements.map((s) => ({
        text: typeof s?.text === "string" ? s.text : "",
        startChar: Number.isFinite(s?.charStart) ? s.charStart : 0,
        endChar: Number.isFinite(s?.charEnd) ? s.charEnd : 0,
        index: Number.isFinite(s?.index) ? s.index : 0,
        attempt: typeof s?.attempt === "string" ? s.attempt : "fallback",
      }))
    : [];
}

function buildEditorialReviewContext(options, toggles, traceId, sources) {
  return {
    pipelineRoute: "v4",
    outputType: options.outputType,
    requiredVersion: options.requiredVersion,
    sources: Array.isArray(sources) ? sources : [],
    traceId,
    editorialEnabled: toggles.editorialEnabled,
    complianceEnabled: toggles.complianceEnabled,
    authoringOrganisation: options.authoringOrganisation ?? null,
  };
}

async function runEvidenceSkippedPath(stage1Result, safeDraft, safeSources, options, toggles, traceId) {
  const stage1Statements = Array.isArray(stage1Result?.statements) ? stage1Result.statements : [];
  const reviewStatements = stage1Statements.map((s, ord) => {
    const text = typeof s?.text === "string" ? s.text : "";
    const charStart = Number.isFinite(s?.charStart) ? s.charStart : 0;
    const charEnd = Number.isFinite(s?.charEnd) ? s.charEnd : 0;
    const index = Number.isFinite(s?.index) ? s.index : ord;
    const draftSpan = { startChar: charStart, endChar: charEnd };
    return {
      text,
      qcCard: {
        ...buildSkippedEvidenceQcCard({ text, draftSpan }),
        index,
        charStart,
        charEnd,
        draftSpan,
        pipelineVersion: "v4",
      },
    };
  });

  const editorialContext = buildEditorialReviewContext(options, toggles, traceId, safeSources);

  if (toggles.editorialEnabled || toggles.complianceEnabled) {
    const per = stage6TokensPerStatement(safeDraft);
    const plan = planAndLogStage("stage6", reviewStatements.length, per);
    setRemainingWorkTokens(reviewStatements.length * (per + STAGE5_CALL_TOKENS));
    await mapPoolPaced(
      reviewStatements,
      plan.concurrency,
      async (reviewStatement, index) => {
        try {
          await runEditorialComplianceReview([reviewStatement], {
            ...editorialContext,
            draftText: safeDraft || reviewStatement.text,
            evidenceVerdict: null,
            previousStatementText: index > 0 ? reviewStatements[index - 1].text : null,
            nextStatementText:
              index < reviewStatements.length - 1 ? reviewStatements[index + 1].text : null,
            editorialSourceExcerpt: null,
            statementIndex: index,
          });
        } catch (err) {
          console.warn(
            `stage6: editorial/compliance review failed for skipped-evidence statement ${index}`
          );
          const reason = notReviewedReasonFromFailure(err);
          if (reason === NOT_REVIEWED_REASONS.RATE_LIMIT_WINDOW) {
            incrementBoundHit("editorial");
            incrementBoundHit("compliance");
          }
          const card = reviewStatement?.qcCard;
          if (card && typeof card === "object") {
            Object.assign(card, notReviewedEditorialResult(toggles, reason));
          }
        } finally {
          addRemainingWorkTokens(-per);
        }
      },
      { tokensPerItem: per }
    );
  }

  const qcCards = reviewStatements.map((s) => s.qcCard);
  const stagesComplete = toggles.editorialEnabled || toggles.complianceEnabled ? 6 : 1;

  return {
    stage1: {
      statements: mapStage1StatementsOut(stage1Result),
      source: stage1Result?.source || "fallback",
      errors: Array.isArray(stage1Result?.errors) ? stage1Result.errors : [],
    },
    stage2: [],
    qcCards,
    draftCoverage: computeDraftCoverage({
      draftText: safeDraft,
      cards: qcCards,
      dropped: Array.isArray(stage1Result?.droppedNonClaims) ? stage1Result.droppedNonClaims : [],
    }),
    _stagesComplete: stagesComplete,
    reviewOptions: { ...toggles, evidenceEnabled: false },
    evidenceReviewSkipped: true,
    rateLimitBoundHits: boundHitSnapshot(),
  };
}

/**
 * Pipeline v4 entry point.
 * Mirrors v3’s public contract: same inputs/outputs for analyse-statements.
 *
 * @param {string} draft
 * @param {Array<{ text: string, label: string }>} sources
 * @param {Record<string, unknown>} options
 */
export async function runPipelineV4(draft, sources, options = {}) {
  const cacheRun = isLlmCacheEnabled() ? beginCacheRun() : null;
  try {
    return await runPipelineV4Inner(draft, sources, options);
  } finally {
    if (cacheRun) {
      logCacheRunSummary(endCacheRun(), "pipeline");
    }
  }
}

async function runPipelineV4Inner(draft, sources, options = {}) {
  const traceId = typeof options?.traceId === "string" ? options.traceId : undefined;
  const safeDraft = typeof draft === "string" ? draft : "";
  const safeSources = Array.isArray(sources) ? sources : [];
  const toggles = resolveReviewToggles(options);
  if (options.authoringOrganisationSource === "request") {
    logAuthoringOrganisationResolution({ request: options.authoringOrganisation });
  } else {
    logAuthoringOrganisationResolution({ argument: options.authoringOrganisation });
  }

  if (!toggles.evidenceEnabled && !toggles.editorialEnabled && !toggles.complianceEnabled) {
    return {
      stage1: { statements: [], source: "none", errors: [] },
      stage2: [],
      qcCards: [],
      _stagesComplete: 0,
      nothingReviewed: true,
      reviewOptions: toggles,
    };
  }

  let stage1Result;
  const frozenIn = Array.isArray(options.frozenStatements) ? options.frozenStatements : null;
  if (frozenIn) {
    const statements = frozenIn.map((s, ord) => ({
      text: typeof s?.text === "string" ? s.text : "",
      charStart: Number.isFinite(s?.charStart) ? s.charStart : Number.isFinite(s?.startChar) ? s.startChar : 0,
      charEnd: Number.isFinite(s?.charEnd) ? s.charEnd : Number.isFinite(s?.endChar) ? s.endChar : 0,
      index: Number.isFinite(s?.index) ? Number(s.index) : ord,
      attempt: "frozen",
    }));
    stage1Result = { statements, droppedNonClaims: [], source: "frozen", errors: [] };
  } else {
    stage1Result = await extractStatementsV4({
      draftText: safeDraft,
      traceId,
    });
  }

  if (!toggles.evidenceEnabled) {
    return runEvidenceSkippedPath(stage1Result, safeDraft, safeSources, options, toggles, traceId);
  }

  const stage1StatementsForPipeline = Array.isArray(stage1Result?.statements)
    ? stage1Result.statements.map((s) => ({
        text: typeof s?.text === "string" ? s.text : "",
        startChar: Number.isFinite(s?.charStart) ? s.charStart : 0,
        endChar: Number.isFinite(s?.charEnd) ? s.charEnd : 0,
      }))
    : [];

  const { matches: stage2PairMatches } = await matchAllSourcesV4({
    statements: Array.isArray(stage1Result?.statements) ? stage1Result.statements : [],
    sources: safeSources,
    traceId,
    stage2SpanEnabled: options.stage2SpanEnabled,
  });
  const stage2SpanEnabled = isStage2SpanEnabled(options);

  const claimSpansEnabled = isClaimSpansEnabled(options);
  let claimSpansByStatementIndex = new Map();
  let claimPairMatches = [];
  let claimSpanStats = { prefilterPassed: 0, decomposed: 0, reverted: [] };
  if (claimSpansEnabled) {
    const stage1bResult = await extractClaimSpans({
      statements: Array.isArray(stage1Result?.statements) ? stage1Result.statements : [],
      draftText: safeDraft,
      traceId,
      options,
    });
    claimSpansByStatementIndex = stage1bResult.byStatementIndex;
    claimSpanStats = stage1bResult.stats;
    const claimJobs = [];
    for (const [statementIndex, claims] of claimSpansByStatementIndex.entries()) {
      const parent =
        (Array.isArray(stage1Result?.statements) ? stage1Result.statements : []).find(
          (s, ord) => (Number.isFinite(s?.index) ? Number(s.index) : ord) === statementIndex
        ) || null;
      const parentSentence = typeof parent?.text === "string" ? parent.text : "";
      for (const claim of claims) {
        claimJobs.push({
          statementIndex,
          claimIndex: claim.index,
          text: claim.text,
          parentSentence,
        });
      }
    }
    if (claimJobs.length > 0) {
      const claimMatchResult = await matchClaimSourcePairs({
        claims: claimJobs,
        sources: safeSources,
        traceId,
        stage2SpanEnabled: options.stage2SpanEnabled,
      });
      claimPairMatches = Array.isArray(claimMatchResult?.matches) ? claimMatchResult.matches : [];
    }
  }
  void claimSpanStats;

  const matchesByStatementIndex = new Map();
  for (const m of stage2PairMatches) {
    const key = m.statementIndex;
    if (!matchesByStatementIndex.has(key)) matchesByStatementIndex.set(key, []);
    matchesByStatementIndex.get(key).push(m);
  }

  /*
   * R7 build A — widened multi-span emit (SEPARATION).
   * WIDENED_SCOPE=${WIDENED_SCOPE}: when "supporting_pairs" (default), only run the widened
   * matcher on (statement × source) pairs whose single-pick classification is
   * confirmed | partially_confirmed | conflicting. Skip single-pick no_support pairs (cost).
   * CRITICAL: widened results go ONLY into supportSpans. They must NEVER be merged into
   * sourceMatches. The intra-source reducer reads locatable span classifications and
   * produces one pair-level class for aggregateVerdictV4. selectExcerptsV4 still
   * reads single-pick sourceMatches only.
   */
  const widenedTasks = [];
  if (options.skipWidenedPass !== true) {
  for (const m of stage2PairMatches) {
    if (!pairNeedsWidenedPass(m?.classification)) continue;
    const statementIndex = Number(m.statementIndex);
    const sourceIndex = Number(m.sourceIndex);
    let statementText = "";
    const stage1Stmts = Array.isArray(stage1Result?.statements) ? stage1Result.statements : [];
    for (let ord = 0; ord < stage1Stmts.length; ord++) {
      const idx = Number.isFinite(stage1Stmts[ord]?.index) ? Number(stage1Stmts[ord].index) : ord;
      if (idx === statementIndex) {
        statementText = typeof stage1Stmts[ord]?.text === "string" ? stage1Stmts[ord].text : "";
        break;
      }
    }
    const src = safeSources[sourceIndex];
    const sourceText = typeof src?.text === "string" ? src.text : "";
    const sourceLabel =
      (typeof m.sourceLabel === "string" && m.sourceLabel) ||
      (typeof src?.label === "string" && src.label) ||
      `Source ${sourceIndex + 1}`;
    widenedTasks.push(
      matchMultipassagePair({
        statementText,
        sourceText,
        statementIndex,
        sourceIndex,
        sourceLabel,
        traceId,
      }).then((passages) =>
        (Array.isArray(passages) ? passages : []).map((p) => ({
          ...p,
          statementIndex,
          sourceIndex,
        }))
      )
    );
  }
  }

  // Await widened before Stage 3 so the intra-source reducer can read locatable spans.
  const widenedPassages = (await Promise.all(widenedTasks)).flat();
  const supportSpansByStatement = new Map();
  const stage1StmtsForSpans = Array.isArray(stage1Result?.statements) ? stage1Result.statements : [];
  for (let ord = 0; ord < stage1StmtsForSpans.length; ord++) {
    const stmtIdx = Number.isFinite(stage1StmtsForSpans[ord]?.index)
      ? Number(stage1StmtsForSpans[ord].index)
      : ord;
    const raw = widenedPassages.filter((p) => Number(p.statementIndex) === stmtIdx);
    supportSpansByStatement.set(
      stmtIdx,
      buildSupportSpans(raw, { statementIndex: stmtIdx, sources: safeSources })
    );
  }

  const editorialContext = buildEditorialReviewContext(options, toggles, traceId, safeSources);

  const asOfBySourceIndex = {};
  for (let i = 0; i < safeSources.length; i++) {
    const text = typeof safeSources[i]?.text === "string" ? safeSources[i].text : "";
    asOfBySourceIndex[i] = extractSourceAsOfDate(text);
  }
  const today = options.today instanceof Date ? options.today : new Date();

  const stageAfterV4Stages34 = stage1StatementsForPipeline.map((statement, ord) => {
    const stmtMeta = Array.isArray(stage1Result?.statements) ? stage1Result.statements[ord] : null;
    const statementIndex = Number.isFinite(stmtMeta?.index) ? Number(stmtMeta.index) : ord;
    const rowMatches = (matchesByStatementIndex.get(statementIndex) || [])
      .slice()
      .sort((a, b) => a.sourceIndex - b.sourceIndex);

    // Single-pick matches ONLY — never append widened passages here.
    const sourceMatches = rowMatches.map((m) => ({
      sourceIndex: m.sourceIndex,
      sourceLabel: m.sourceLabel,
      classification: m.classification,
      passage: m.passage,
      explanation: m.explanation,
      periodAssessment: m.periodAssessment ?? null,
      statementFigures: Array.isArray(m.statementFigures) ? m.statementFigures : [],
      sourceFigures: Array.isArray(m.sourceFigures) ? m.sourceFigures : [],
      systemFingerprint:
        m.systemFingerprint === undefined || m.systemFingerprint === null
          ? null
          : String(m.systemFingerprint),
      costUsd: Number(m.costUsd) || 0,
      usage: m.usage ?? null,
      spanElicitCostUsd: Number(m.spanElicitCostUsd) || 0,
      matchNotReviewed: m.matchNotReviewed === true,
      passageRejected: m.passageRejected === true,
    }));

    const supportSpans = supportSpansByStatement.get(statementIndex) || [];
    const statementText = typeof statement?.text === "string" ? statement.text : "";
    const reducedMatches = applyIntraSourceReducer({
      sourceMatches,
      supportSpans,
      sources: safeSources,
      statementText,
    });

    let agg = aggregateVerdictV4({ statementMatches: reducedMatches });
    const resolved = resolveSupersession({
      statement: statementText,
      aggregateVerdict: agg.verdict,
      sourceMatches: reducedMatches,
      asOfBySourceIndex,
      today,
    });
    if (resolved.verdictOverride) {
      const demoted = new Set((resolved.demotedSourceIndices || []).map(Number));
      for (const m of reducedMatches) {
        if (!demoted.has(Number(m.sourceIndex))) continue;
        m.originalClassification = m.classification;
        m.classification = "superseded";
      }
      for (const m of sourceMatches) {
        if (!demoted.has(Number(m.sourceIndex))) continue;
        m.originalClassification = m.classification;
        m.classification = "superseded";
      }
      agg = aggregateVerdictV4({ statementMatches: reducedMatches });
      agg = { ...agg, verdict: resolved.verdictOverride };
    }

    const confirmingMatches = sourceMatches.filter((m) => normalizeMatchClassification(m.classification) === "confirmed");
    const conflictingMatches = sourceMatches.filter(
      (m) => normalizeMatchClassification(m.classification) === "conflicting"
    );
    const partialMatches = sourceMatches.filter(
      (m) => normalizeMatchClassification(m.classification) === "partially_confirmed"
    );

    const verdictResult = {
      verdict: agg.verdict,
      hasConflict: agg.hasConflict,
      contributingSourceIndices: agg.contributingSourceIndices,
      confirmingMatches,
      conflictingMatches,
      partialMatches,
    };

    const excerptResult = selectExcerptsV4({
      statementMatches: sourceMatches,
      verdict: agg.verdict,
      hasConflict: agg.hasConflict,
      supportSpans,
      sources: safeSources,
    });

    let claimSpans = claimSpansEnabled ? emptyClaimSpanPayload() : null;
    if (claimSpansEnabled) {
      const claims = claimSpansByStatementIndex.get(statementIndex) || [];
      const wholeSentenceHasConflict = reducedMatches.some(
        (m) => normalizeMatchClassification(m.classification) === "conflicting"
      );
      if (claims.length >= 2) {
        const claimRows = [];
        for (const claim of claims) {
          const claimMatches = claimPairMatches.filter(
            (m) => Number(m.statementIndex) === statementIndex && Number(m.claimIndex) === Number(claim.index)
          );
          const claimResolved = applySupersessionToClaimMatches({
            statementText: claim.text,
            sourceMatches: claimMatches,
            asOfBySourceIndex,
            today,
          });
          claimRows.push({
            index: claim.index,
            text: claim.text,
            draftStart: claim.draftStart,
            draftEnd: claim.draftEnd,
            verdict: claimResolved.agg.verdict,
            hasConflict: claimResolved.agg.hasConflict === true,
            matches: compactClaimMatches(claimResolved.matches),
          });
        }
        // Diagnostic only: residualHasUnclaimedAnchor no longer gates the
        // verdict. The signal is that the claims do not cover all of this
        // sentence, which Route B work will want.
        const residual = residualHasUnclaimedAnchor(statementText, claims);
        if (residual.blocked) {
          console.debug(
            `[claim-spans] residual anchors block upgrade statementIndex=${statementIndex} anchors=${JSON.stringify(
              residual.anchors.map((a) => ({ text: a.text, kind: a.kind }))
            )}`
          );
        }
        const rolled = rollupClaimVerdicts({
          vToday: agg.verdict,
          claimVerdicts: claimRows.map((c) => c.verdict),
          residualBlocked: residual.blocked,
          wholeSentenceHasConflict,
        });
        if (rolled.claimUpgrade) {
          verdictResult.verdict = "confirmed";
        }
        claimSpans = {
          decomposed: true,
          claimUpgrade: rolled.claimUpgrade === true,
          claims: claimRows,
          blockedBy: rolled.blockedBy,
        };
      }
    }

    let coverageUnion = null;
    if (isMultisourceCoverageEnabled(options)) {
      const coverage = computeCoverageUnion({ statementText, matches: rowMatches });
      if (shouldPromoteCoverageUnion({ verdict: verdictResult.verdict, coverage })) {
        verdictResult.verdict = "confirmed";
        coverageUnion = coverageUnionPromotionRecord(coverage);
      }
    }

    return {
      statementText,
      startChar: Number.isFinite(statement?.startChar) ? statement.startChar : 0,
      endChar: Number.isFinite(statement?.endChar) ? statement.endChar : 0,
      sourceMatches,
      supportSpans,
      verdictResult,
      excerptResult,
      statementIndex,
      supersededSourceNotes: Array.isArray(resolved.supersededNotes) ? resolved.supersededNotes : [],
      unsupportedSpans: stage2SpanEnabled
        ? buildUnsupportedSpans(rowMatches, { statementIndex })
        : [],
      ...(claimSpans ? { claimSpans } : {}),
      ...(coverageUnion ? { coverageUnion } : {}),
    };
  });

  const stage6Per = stage6TokensPerStatement(safeDraft);
  const stage6Plan = planAndLogStage("stage6", stageAfterV4Stages34.length, stage6Per);
  setRemainingWorkTokens(stageAfterV4Stages34.length * (stage6Per + STAGE5_CALL_TOKENS));
  const stage2WithEditorial = await mapPoolPaced(
    stageAfterV4Stages34,
    stage6Plan.concurrency,
    async (entry, index) => {
      try {
        const pe = entry.excerptResult?.primaryExcerpt;
        const editorialSourceExcerpt =
          pe && typeof pe.passage === "string" && pe.passage.trim()
            ? typeof pe.sourceLabel === "string" && pe.sourceLabel.trim()
              ? `${pe.sourceLabel.trim()}: ${pe.passage.trim()}`
              : pe.passage.trim()
            : null;

        const reviewStatement = {
          text: entry.statementText,
          qcCard: {
            suppressInQcWorkbench: false,
            editorialVerdict: null,
            editorialConcerns: null,
            editorialNote: null,
            editorialSuggestedDirection: null,
            editorialSuggestedRewrite: null,
            complianceVerdict: null,
            complianceConcerns: null,
            complianceNote: null,
            complianceSuggestedDirection: null,
            complianceSuggestedRewrite: null,
          },
        };

        await runEditorialComplianceReview([reviewStatement], {
          ...editorialContext,
          draftText: safeDraft || entry.statementText,
          evidenceVerdict: entry.verdictResult?.verdict,
          previousStatementText: index > 0 ? stageAfterV4Stages34[index - 1].statementText : null,
          nextStatementText:
            index < stageAfterV4Stages34.length - 1 ? stageAfterV4Stages34[index + 1].statementText : null,
          editorialSourceExcerpt,
          statementIndex: index,
        });

        return {
          ...entry,
          editorialResult: reviewStatement.qcCard,
        };
      } catch (err) {
        console.warn(
          `stage6: editorial/compliance review failed for statement ${index}, attaching not_reviewed editorialResult`
        );
        const reason = notReviewedReasonFromFailure(err);
        if (reason === NOT_REVIEWED_REASONS.RATE_LIMIT_WINDOW) {
          incrementBoundHit("editorial");
          incrementBoundHit("compliance");
        }
        return {
          ...entry,
          excerptResult: selectExcerptsV4({
            statementMatches: entry.sourceMatches,
            verdict: entry.verdictResult.verdict,
            hasConflict: entry.verdictResult.hasConflict,
            supportSpans: entry.supportSpans,
            sources: safeSources,
          }),
          editorialResult: notReviewedEditorialResult(toggles, reason),
        };
      } finally {
        addRemainingWorkTokens(-stage6Per);
      }
    },
    { tokensPerItem: stage6Per }
  );

  const stage2WithExcerpts = stage2WithEditorial.map((entry) => ({
    ...entry,
    excerptResult:
      entry.excerptResult ??
      selectExcerptsV4({
        statementMatches: entry.sourceMatches,
        verdict: entry.verdictResult.verdict,
        hasConflict: entry.verdictResult.hasConflict,
        supportSpans: entry.supportSpans,
        sources: safeSources,
      }),
  }));

  const stage2 = options.skipCommentary === true
    ? stage2WithExcerpts.map((entry) => ({ ...entry, commentaryResult: { commentary: "" } }))
    : await mapPoolPaced(
    stage2WithExcerpts,
    planAndLogStage("stage5", stage2WithExcerpts.length, STAGE5_CALL_TOKENS).concurrency,
    async (entry, index) => {
      try {
        const commentaryResult = await generateCommentary({
          statement: entry.statementText,
          verdict: entry?.verdictResult?.verdict,
          hasConflict: entry?.verdictResult?.hasConflict === true,
          primaryExcerpt: entry?.excerptResult?.primaryExcerpt?.passage ?? null,
          conflictExcerpt: entry?.excerptResult?.conflictExcerpt?.passage ?? null,
          sourceExplanations: Array.isArray(entry?.sourceMatches)
            ? entry.sourceMatches.map((m) => ({
                classification: m?.classification,
                explanation: m?.explanation,
              }))
            : undefined,
          traceId,
          statementIndex: index,
        });
        return {
          ...entry,
          commentaryResult,
        };
      } finally {
        addRemainingWorkTokens(-STAGE5_CALL_TOKENS);
      }
    },
    { tokensPerItem: STAGE5_CALL_TOKENS }
  );

  const qcCards = await Promise.all(
    stage2.map((entry, index) => {
      const stmtIdx = Number.isFinite(entry?.statementIndex) ? entry.statementIndex : index;
      const supportSpans = supportSpansByStatement.get(stmtIdx) || [];
      return assembleCard(
        { ...entry, supportSpans },
        index,
        {
          pipelineRoute: "v4",
          traceId,
          outputType: options.outputType,
          sources: safeSources,
          reviewOptions: toggles,
        }
      );
    })
  );

  return {
    stage1: {
      statements: mapStage1StatementsOut(stage1Result),
      source: stage1Result?.source || "fallback",
      errors: Array.isArray(stage1Result?.errors) ? stage1Result.errors : [],
    },
    stage2,
    qcCards,
    draftCoverage: computeDraftCoverage({
      draftText: safeDraft,
      cards: qcCards,
      dropped: Array.isArray(stage1Result?.droppedNonClaims) ? stage1Result.droppedNonClaims : [],
    }),
    _stagesComplete: 7,
    reviewOptions: toggles,
    rateLimitBoundHits: boundHitSnapshot(),
  };
}
