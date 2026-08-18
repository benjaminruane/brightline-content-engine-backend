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
import { matchAllSources as matchAllSourcesV4 } from "./stage2-match-sources.mjs";
import {
  WIDENED_SCOPE,
  buildSupportSpans,
  matchMultipassagePair,
  pairNeedsWidenedPass,
} from "./stage2-match-multipassage.mjs";
import { aggregateVerdict as aggregateVerdictV4 } from "./stage3-aggregate-verdict.mjs";
import { selectExcerpts as selectExcerptsV4 } from "./stage4-select-excerpts.mjs";

function normalizeMatchClassification(value) {
  const c = typeof value === "string" ? value.trim() : "";
  if (c === "confirmed" || c === "partially_confirmed" || c === "conflicting" || c === "no_support") {
    return c;
  }
  return "no_support";
}

function resolveReviewToggles(options = {}) {
  return {
    evidenceEnabled: options.evidenceEnabled !== false,
    editorialEnabled: options.editorialEnabled !== false,
    complianceEnabled: options.complianceEnabled !== false,
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
    await Promise.all(
      reviewStatements.map(async (reviewStatement, index) => {
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
        }
      })
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
    _stagesComplete: stagesComplete,
    reviewOptions: { ...toggles, evidenceEnabled: false },
    evidenceReviewSkipped: true,
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
  const traceId = typeof options?.traceId === "string" ? options.traceId : undefined;
  const safeDraft = typeof draft === "string" ? draft : "";
  const safeSources = Array.isArray(sources) ? sources : [];
  const toggles = resolveReviewToggles(options);

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

  const stage1Result = await extractStatementsV4({
    draftText: safeDraft,
    traceId,
  });

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
  });

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
   * sourceMatches / statementMatches that feed aggregateVerdictV4 or selectExcerptsV4.
   */
  const widenedTasks = [];
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
  // Kick off widened calls in parallel with Stages 3–6; await before Stage 7 assemble.
  const widenedPassagesPromise = Promise.all(widenedTasks).then((chunks) => chunks.flat());

  const editorialContext = buildEditorialReviewContext(options, toggles, traceId, safeSources);

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
    }));

    const agg = aggregateVerdictV4({ statementMatches: sourceMatches });
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
    });

    return {
      statementText: typeof statement?.text === "string" ? statement.text : "",
      startChar: Number.isFinite(statement?.startChar) ? statement.startChar : 0,
      endChar: Number.isFinite(statement?.endChar) ? statement.endChar : 0,
      sourceMatches,
      verdictResult,
      excerptResult,
      statementIndex,
    };
  });

  const stage2WithEditorial = await Promise.all(
    stageAfterV4Stages34.map(async (entry, index) => {
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
          `stage6: editorial/compliance review failed for statement ${index}, attaching null editorialResult`
        );
        return {
          ...entry,
          excerptResult: selectExcerptsV4({
            statementMatches: entry.sourceMatches,
            verdict: entry.verdictResult.verdict,
            hasConflict: entry.verdictResult.hasConflict,
          }),
          editorialResult: null,
        };
      }
    })
  );

  const stage2WithExcerpts = stage2WithEditorial.map((entry) => ({
    ...entry,
    excerptResult:
      entry.excerptResult ??
      selectExcerptsV4({
        statementMatches: entry.sourceMatches,
        verdict: entry.verdictResult.verdict,
        hasConflict: entry.verdictResult.hasConflict,
      }),
  }));

  const stage2 = await Promise.all(
    stage2WithExcerpts.map(async (entry, index) => {
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
    })
  );

  // Resolve widened pass (ran in parallel with Stages 3–6). Gate into supportSpans only.
  const widenedPassages = await widenedPassagesPromise;
  const supportSpansByStatement = new Map();
  for (const entry of stage2) {
    const stmtIdx = Number.isFinite(entry?.statementIndex) ? entry.statementIndex : 0;
    const raw = widenedPassages.filter((p) => Number(p.statementIndex) === stmtIdx);
    supportSpansByStatement.set(
      stmtIdx,
      buildSupportSpans(raw, { statementIndex: stmtIdx, sources: safeSources })
    );
  }

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
    _stagesComplete: 7,
    reviewOptions: toggles,
  };
}
