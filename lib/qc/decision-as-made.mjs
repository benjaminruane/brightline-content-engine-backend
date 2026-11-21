/**
 * B560. A source that recommends, proposes, or plans a step, and a draft that
 * states that step as decided, is amber. It is not red on its own.
 * A draft that claims the step is completed stays on the existing path.
 */
export const DECISION_AS_MADE_REASON = "The source recommends this; confirm the decision was taken.";

const SOURCE_RECOMMENDS = /\b(?:recommends?|recommended|proposes?|proposed|plans to|plan to|we plan|seek(?:s|ing)? approval)\b/i;
const SOURCE_ALREADY_DECIDED = /\b(?:has committed|have committed|committed to|agreed to invest|agreed to acquire|agreed to commit)\b/i;
const DRAFT_DECIDED = /\bcommitted\b|\bagreed to (?:invest|acquire|commit)\b/i;
const DRAFT_COMPLETED = /\b(?:completed|completion|has acquired|have acquired|had acquired|was acquired|were acquired)\b/i;

function stepIds(text) {
  const ids = new Set();
  for (const match of String(text).matchAll(/\b(?:fund|funds)\s+([IVX]{1,6}|\d+)\b/gi)) {
    ids.add(match[1].toUpperCase());
  }
  return ids;
}

/** A past commitment to a different fund is not this decision. */
function sourceAlreadyStatesThisDecision(draft, source) {
  const wanted = stepIds(draft);
  const sentences = source.split(/(?<=[.!?])\s+/);
  for (const sentence of sentences) {
    if (!SOURCE_ALREADY_DECIDED.test(sentence)) continue;
    const stated = stepIds(sentence);
    if (wanted.size === 0 || stated.size === 0) return true;
    for (const id of stated) if (wanted.has(id)) return true;
  }
  return false;
}

export function decisionStatedAsMade(statement, sourceText) {
  const draft = typeof statement === "string" ? statement : "";
  const source = typeof sourceText === "string" ? sourceText : "";
  if (!draft.trim() || !source.trim()) return false;
  if (!DRAFT_DECIDED.test(draft)) return false;
  if (DRAFT_COMPLETED.test(draft)) return false;
  if (!SOURCE_RECOMMENDS.test(source)) return false;
  if (sourceAlreadyStatesThisDecision(draft, source)) return false;
  return true;
}
