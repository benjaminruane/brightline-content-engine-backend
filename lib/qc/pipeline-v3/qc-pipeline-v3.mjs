import { extractStatements } from "./stage1-extract-statements.mjs";
import { matchAllSources } from "./stage2-match-sources.mjs";
import { aggregateVerdict } from "./stage3-aggregate-verdict.mjs";
import { selectExcerpts } from "./stage4-select-excerpts.mjs";
import { generateCommentary } from "./stage5-generate-commentary.mjs";
import { runEditorialComplianceReview } from "../editorial-compliance-reviewer.mjs";
import { assembleCard } from "./stage7-assemble-card.mjs";

export async function runPipelineV3(draft, sources, options = {}) {
  const traceId = typeof options?.traceId === "string" ? options.traceId : undefined;
  const stage1 = await extractStatements(typeof draft === "string" ? draft : "", { traceId });
  const stage1Statements = Array.isArray(stage1?.statements) ? stage1.statements : [];
  const safeSources = Array.isArray(sources) ? sources : [];
  const safeDraft = typeof draft === "string" ? draft : "";

  const stage2WithVerdicts = await Promise.all(
    stage1Statements.map(async (statement) => {
      const statementText = typeof statement?.text === "string" ? statement.text : "";
      const sourceMatches = await matchAllSources(statementText, safeSources, { traceId });
      const verdictResult = aggregateVerdict(sourceMatches);
      return {
        statementText,
        startChar: Number.isFinite(statement?.startChar) ? statement.startChar : 0,
        endChar: Number.isFinite(statement?.endChar) ? statement.endChar : 0,
        sourceMatches,
        verdictResult,
      };
    })
  );

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
          // Existing reviewer signature ignores verdict directly, so include it in context payload.
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
    stage2WithExcerpts.map(async (entry, index) => {
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

  return {
    stage1: {
      statements: stage1Statements,
      source: stage1?.source || "fallback",
      ...(stage1?.error ? { error: stage1.error } : {}),
    },
    stage2,
    qcCards,
    _stagesComplete: 7,
  };
}
