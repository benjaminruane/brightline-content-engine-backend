/**
 * Per-call record for Suggest diagnostic harnesses.
 * Store what the score is derived from, including the conditions it was
 * produced under. Do not throw the evidence away after scoring.
 *
 * Usage: attach `suggestCallRecord({ completion, prompt, model, temperature, seed })`
 * to each stored run. Do not import from lib/ or api/.
 */
import { createHash } from "node:crypto";

/**
 * @param {unknown} completion callLLM return value
 * @returns {{ present: boolean, value: string|null }}
 */
export function systemFingerprintFromCompletion(completion) {
  const raw = completion?.raw;
  if (!raw || typeof raw !== "object") return { present: false, value: null };
  if (!Object.prototype.hasOwnProperty.call(raw, "system_fingerprint")) {
    return { present: false, value: null };
  }
  const v = raw.system_fingerprint;
  if (v === undefined || v === null) return { present: true, value: null };
  return { present: true, value: String(v) };
}

export function promptSha256(prompt) {
  return createHash("sha256").update(String(prompt ?? ""), "utf8").digest("hex");
}

/**
 * @param {{
 *   completion?: object,
 *   prompt?: string,
 *   model?: string,
 *   temperature?: number,
 *   seed?: number,
 * }} args
 */
export function suggestCallRecord({ completion, prompt, model, temperature, seed } = {}) {
  const fp = systemFingerprintFromCompletion(completion);
  return {
    systemFingerprint: fp.value,
    systemFingerprintPresent: fp.present,
    model: typeof model === "string" ? model : completion?.model ?? null,
    temperature: Number.isFinite(temperature) ? temperature : null,
    seed: Number.isInteger(seed) ? seed : null,
    promptSha256: promptSha256(prompt),
    promptLength: String(prompt ?? "").length,
    inputTokens: completion?.usage?.inputTokens ?? null,
    outputTokens: completion?.usage?.outputTokens ?? null,
    cachedInputTokens: completion?.usage?.cachedInputTokens ?? null,
    rawText: typeof completion?.text === "string" ? completion.text : null,
  };
}
