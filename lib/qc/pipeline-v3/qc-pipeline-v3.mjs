import { extractStatements } from "./stage1-extract-statements.mjs";

export async function runPipelineV3(draft, sources, options = {}) {
  void sources;
  void options;

  const stage1 = await extractStatements(typeof draft === "string" ? draft : "");
  return {
    stage1: {
      statements: Array.isArray(stage1?.statements) ? stage1.statements : [],
      source: stage1?.source || "fallback",
      ...(stage1?.error ? { error: stage1.error } : {}),
    },
    _stagesComplete: 1,
  };
}
