/**
 * B277. Deterministic token and statement estimates. No model call.
 * OpenAI counts a request against TPM using a character heuristic of the
 * same family; ceil(chars / 4) is the planner's matching estimate.
 */

export const WORDS_PER_STATEMENT = 20;

export function countWords(text) {
  const raw = typeof text === "string" ? text.trim() : "";
  if (!raw) return 0;
  return raw.split(/\s+/).filter(Boolean).length;
}

export function estimateTokensFromChars(text) {
  const raw = typeof text === "string" ? text : "";
  if (!raw) return 0;
  return Math.ceil(raw.length / 4);
}

export function estimateStatementCount(wordCount) {
  const n = Number(wordCount);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.max(1, Math.round(n / WORDS_PER_STATEMENT));
}

export function tpmDefaultForModel(model) {
  const m = typeof model === "string" ? model.toLowerCase() : "";
  if (m.includes("gpt-4o-mini")) return 10_000_000;
  if (m.includes("gpt-5.1") || m.includes("gpt-5-")) return 4_000_000;
  return 2_000_000;
}

export function tpmFloorMs(tokenCount, tpmLimit) {
  const tokens = Math.max(0, Number(tokenCount) || 0);
  const tpm = Math.max(1, Number(tpmLimit) || 1);
  return Math.ceil((tokens / tpm) * 60_000);
}
