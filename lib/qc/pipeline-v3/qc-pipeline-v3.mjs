import { extractStatements } from "./stage1-extract-statements.mjs";
import { matchAllSources } from "./stage2-match-sources.mjs";
import { aggregateVerdict } from "./stage3-aggregate-verdict.mjs";
import { selectExcerpts } from "./stage4-select-excerpts.mjs";
import { generateCommentary } from "./stage5-generate-commentary.mjs";
import { runEditorialComplianceReview } from "../editorial-compliance-reviewer.mjs";
import { assembleCard } from "./stage7-assemble-card.mjs";
import { makeRunId, logStage, deriveRuleThatFired } from "./stage-logger.mjs";

export async function runPipelineV3(draft, sources, options = {}) {
  void options;

  const runId = makeRunId();

  const stage1 = await extractStatements(typeof draft === "string" ? draft : "");
  const stage1Statements = Array.isArray(stage1?.statements) ? stage1.statements : [];
  const safeSources = Array.isArray(sources) ? sources : [];
  const safeDraft = typeof draft === "string" ? draft : "";

  const splitterSource = stage1?.source === "llm" || stage1?.source === "fallback" ? stage1.source : "fallback";
  stage1Statements.forEach((st, stmtIndex) => {
    logStage({
      runId,
      stmtIndex,
      stage: "stage1",
      payload: {
        statement: typeof st?.text === "string" ? st.text : "",
        charStart: Number.isFinite(st?.startChar) ? st.startChar : null,
        charEnd: Number.isFinite(st?.endChar) ? st.endChar : null,
        splitterSource,
      },
    });
  });

  const stage2WithVerdicts = await Promise.all(
    stage1Statements.map(async (statement, stmtIndex) => {
      const statementText = typeof statement?.text === "string" ? statement.text : "";
      const sourceMatches = await matchAllSources(statementText, safeSources, { runId, stmtIndex });
      const verdictResult = aggregateVerdict(sourceMatches);
      logStage({
        runId,
        stmtIndex,
        stage: "stage3",
        payload: {
          statementIndex: stmtIndex,
          perSourceClassifications: sourceMatches.map((m) => ({
            sourceLabel: m.sourceLabel,
            classification: m.classification,
          })),
          aggregatedVerdict: verdictResult.verdict,
          ruleThatFired: deriveRuleThatFired(sourceMatches),
        },
      });
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
          editorialResult: null,
        };
      }
    })
  );

  const stage2WithExcerpts = stage2WithEditorial.map((entry, index) => ({
    ...entry,
    excerptResult: selectExcerpts(entry.verdictResult, { runId, stmtIndex: index }),
  }));

  const stage2 = await Promise.all(
    stage2WithExcerpts.map(async (entry, index) => {
      const commentaryResult = await generateCommentary(
        entry.statementText,
        entry.verdictResult,
        entry.excerptResult,
        { runId, stmtIndex: index }
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
