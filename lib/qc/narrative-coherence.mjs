/**
 * B348. narrative_coherence is switched off by ruling, not deleted.
 * Flag QC_NARRATIVE_COHERENCE, default off. When off, the rule is omitted from
 * the editorial prompt and no narrative_coherence concern may reach a card.
 * Editorial still ran; this is not a turned-off check.
 */

export const NARRATIVE_COHERENCE_RULE_ID = "narrative_coherence";

export function isNarrativeCoherenceEnabled(env = process.env) {
  const v = String(env?.QC_NARRATIVE_COHERENCE || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export function gateNarrativeCoherenceRules(rules, env = process.env) {
  const list = Array.isArray(rules) ? rules : [];
  if (isNarrativeCoherenceEnabled(env)) return list;
  return list.filter((r) => r?.id !== NARRATIVE_COHERENCE_RULE_ID);
}

export function concernIsNarrativeCoherence(concern) {
  const code = typeof concern?.concernCode === "string" ? concern.concernCode.trim() : "";
  const rule = typeof concern?.rule === "string" ? concern.rule.trim() : "";
  return code === NARRATIVE_COHERENCE_RULE_ID || rule === NARRATIVE_COHERENCE_RULE_ID;
}

export function dropNarrativeCoherenceConcerns(concerns, env = process.env) {
  const list = Array.isArray(concerns) ? concerns : [];
  if (isNarrativeCoherenceEnabled(env)) return list;
  return list.filter((c) => !concernIsNarrativeCoherence(c));
}
