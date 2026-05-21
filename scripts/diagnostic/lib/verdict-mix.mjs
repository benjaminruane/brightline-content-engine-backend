const VERDICT_KEYS = ["confirmed", "partially_confirmed", "conflicting", "not_supported"];

/**
 * @param {object} pipelineResult
 */
export function countVerdictMix(pipelineResult) {
  const mix = {
    confirmed: 0,
    partially_confirmed: 0,
    conflicting: 0,
    not_supported: 0,
  };
  const stage2 = Array.isArray(pipelineResult?.stage2) ? pipelineResult.stage2 : [];
  for (const entry of stage2) {
    const v = typeof entry?.verdictResult?.verdict === "string" ? entry.verdictResult.verdict : "not_supported";
    if (mix[v] !== undefined) mix[v] += 1;
    else mix.not_supported += 1;
  }
  return mix;
}

export function formatVerdictMix(mix) {
  return VERDICT_KEYS.map((k) => `${k}=${mix[k] ?? 0}`).join(" ");
}

export function statementCount(pipelineResult) {
  const cards = Array.isArray(pipelineResult?.qcCards) ? pipelineResult.qcCards : [];
  if (cards.length > 0) return cards.length;
  const s1 = Array.isArray(pipelineResult?.stage1?.statements) ? pipelineResult.stage1.statements : [];
  return s1.length;
}
