import { extractStatements } from "./stage1-extract-statements.mjs";
import { matchAllSources } from "./stage2-match-sources.mjs";

export async function runPipelineV3(draft, sources, options = {}) {
  void options;

  const stage1 = await extractStatements(typeof draft === "string" ? draft : "");
  const stage1Statements = Array.isArray(stage1?.statements) ? stage1.statements : [];
  const safeSources = Array.isArray(sources) ? sources : [];

  const stage2 = await Promise.all(
    stage1Statements.map(async (statement) => {
      const statementText = typeof statement?.text === "string" ? statement.text : "";
      const sourceMatches = await matchAllSources(statementText, safeSources);
      return {
        statementText,
        startChar: Number.isFinite(statement?.startChar) ? statement.startChar : 0,
        endChar: Number.isFinite(statement?.endChar) ? statement.endChar : 0,
        sourceMatches,
      };
    })
  );

  return {
    stage1: {
      statements: stage1Statements,
      source: stage1?.source || "fallback",
      ...(stage1?.error ? { error: stage1.error } : {}),
    },
    stage2,
    _stagesComplete: 2,
  };
}
