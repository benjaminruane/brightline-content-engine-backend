// Pipeline v4 — QC rebuild route.
// See QC_Pipeline_Redesign_Architecture.docx for the
// target architecture (Stages 1–7).
// R2.2: Stage 1 (extract) is implemented here.
// R2.3: Stage 2 (match) is implemented here.
// Stages 3+ still use v3 modules (v3 entry point unchanged).

import { aggregateVerdict } from "../pipeline-v3/stage3-aggregate-verdict.mjs";
import { selectExcerpts } from "../pipeline-v3/stage4-select-excerpts.mjs";
import { generateCommentary } from "../pipeline-v3/stage5-generate-commentary.mjs";
import { runEditorialComplianceReview } from "../editorial-compliance-reviewer.mjs";
import { assembleCard } from "../pipeline-v3/stage7-assemble-card.mjs";
import { extractStatements as extractStatementsV4 } from "./stage1-extract-statements.mjs";
import { matchAllSources as matchAllSourcesV4 } from "./stage2-match-sources.mjs";

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

  const stage1Result = await extractStatementsV4({
    draftText: safeDraft,
    traceId,
  });

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

  const stage2WithVerdicts = stage1StatementsForPipeline.map((statement, ord) => {
    const stmtMeta = Array.isArray(stage1Result?.statements) ? stage1Result.statements[ord] : null;
    const statementIndex = Number.isFinite(stmtMeta?.index) ? Number(stmtMeta.index) : ord;
    const rowMatches = (matchesByStatementIndex.get(statementIndex) || []).slice().sort((a, b) => a.sourceIndex - b.sourceIndex);
    const sourceMatches = rowMatches.map((m) => ({
      sourceIndex: m.sourceIndex,
      sourceLabel: m.sourceLabel,
      classification: m.classification,
      passage: m.passage,
      explanation: m.explanation,
    }));
    const verdictResult = aggregateVerdict(sourceMatches);
    return {
      statementText: typeof statement?.text === "string" ? statement.text : "",
      startChar: Number.isFinite(statement?.startChar) ? statement.startChar : 0,
      endChar: Number.isFinite(statement?.endChar) ? statement.endChar : 0,
      sourceMatches,
      verdictResult,
    };
  });

  const stage2WithEditorial = await Promise.all(
    stage2WithVerdicts.map(async (entry, index) => {
      try {
        const excerptResult = selectExcerpts(entry.verdictResult);
        const pe = excerptResult?.primaryExcerpt;
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
          draftText: safeDraft || entry.statementText,
          outputType: undefined,
          requiredVersion: undefined,
          eventType: undefined,
          evidenceVerdict: entry.verdictResult?.verdict,
          previousStatementText: index > 0 ? stage2WithVerdicts[index - 1].statementText : null,
          nextStatementText:
            index < stage2WithVerdicts.length - 1 ? stage2WithVerdicts[index + 1].statementText : null,
          editorialSourceExcerpt,
          statementIndex: index,
          traceId,
        });

        return {
          ...entry,
          excerptResult,
          editorialResult: reviewStatement.qcCard,
        };
      } catch (err) {
        console.warn(
          `stage6: editorial/compliance review failed for statement ${index}, attaching null editorialResult`
        );
        return {
          ...entry,
          excerptResult: selectExcerpts(entry.verdictResult),
          editorialResult: null,
        };
      }
    })
  );

  const stage2WithExcerpts = stage2WithEditorial.map((entry) => ({
    ...entry,
    excerptResult: entry.excerptResult ?? selectExcerpts(entry.verdictResult),
  }));

  const stage2 = await Promise.all(
    stage2WithExcerpts.map(async (entry) => {
      const commentaryResult = await generateCommentary(
        entry.statementText,
        entry.verdictResult,
        entry.excerptResult,
        { traceId }
      );
      return {
        ...entry,
        commentaryResult,
      };
    })
  );
  const qcCards = stage2.map((entry, index) => assembleCard(entry, index));

  const stage1StatementsOut = Array.isArray(stage1Result?.statements)
    ? stage1Result.statements.map((s) => ({
        text: typeof s?.text === "string" ? s.text : "",
        startChar: Number.isFinite(s?.charStart) ? s.charStart : 0,
        endChar: Number.isFinite(s?.charEnd) ? s.charEnd : 0,
        index: Number.isFinite(s?.index) ? s.index : 0,
        attempt: typeof s?.attempt === "string" ? s.attempt : "fallback",
      }))
    : [];

  return {
    stage1: {
      statements: stage1StatementsOut,
      source: stage1Result?.source || "fallback",
      errors: Array.isArray(stage1Result?.errors) ? stage1Result.errors : [],
    },
    stage2,
    qcCards,
    _stagesComplete: 7,
  };
}
