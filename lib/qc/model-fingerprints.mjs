/**
 * Model configuration drift: record which serving configuration produced a
 * run, and warn when it changes.
 *
 * Background: on 2026-08-27 a production Review returned supported_partial on
 * a statement that the identical request on the identical document returns
 * supported_full on today's configuration. Each configuration is internally
 * deterministic; they disagree with each other. Nothing recorded the
 * fingerprint, so the change was invisible.
 *
 * Pure functions only. Persistence lives in lib/db/model-fingerprint-log.mjs
 * and must never block or fail a Review.
 */
import { STAGE_MODELS } from "./model-config.mjs";

/** Stages a Review may call. Recorded so a run names its own configuration. */
export const REVIEW_STAGE_KEYS = [
  "stage1-splitting",
  "stage1b-claim-spans",
  "stage2-matching",
  "stage5-commentary",
  "editorial-review",
  "editorial-style-review",
  "compliance-review",
  "style-review",
];

export const SUGGEST_STAGE_KEYS = ["writing-rewrite"];

/**
 * Every distinct Stage 2 system fingerprint on a set of assembled cards.
 * Sorted so the set is comparable across runs.
 *
 * @param {Array<object>} qcCards
 * @returns {string[]}
 */
export function collectStage2Fingerprints(qcCards) {
  const seen = new Set();
  for (const card of Array.isArray(qcCards) ? qcCards : []) {
    const rows = Array.isArray(card?.stage2SourceFingerprints)
      ? card.stage2SourceFingerprints
      : [];
    for (const row of rows) {
      const fp = typeof row?.systemFingerprint === "string" ? row.systemFingerprint.trim() : "";
      if (fp) seen.add(fp);
    }
  }
  return [...seen].sort();
}

/**
 * The serving fingerprint on a callLLM result, when the provider returns one.
 * All calls go through chat.completions (lib/observability.js:296), so the
 * field is available wherever OpenAI populates it.
 *
 * @param {?{ raw?: object }} completion
 * @returns {?string}
 */
export function systemFingerprintFromCompletion(completion) {
  const raw = completion?.raw;
  if (!raw || typeof raw !== "object") return null;
  const fp = raw.system_fingerprint;
  return typeof fp === "string" && fp.trim() ? fp.trim() : null;
}

/**
 * The model string actually configured for each stage.
 * @param {string[]} stageKeys
 * @returns {Record<string, { provider: string, model: string }>}
 */
export function collectStageModels(stageKeys) {
  const out = {};
  for (const key of Array.isArray(stageKeys) ? stageKeys : []) {
    const row = STAGE_MODELS[key];
    if (!row) continue;
    out[key] = { provider: row.provider, model: row.model };
  }
  return out;
}

/**
 * Additive record for the review response. Not surfaced in the main UI.
 *
 * @param {{ qcCards?: Array<object>, stageKeys?: string[], ranAt?: string }} args
 * @returns {{ ranAt: string, stage2Fingerprints: string[], stageModels: object }}
 */
export function buildModelConfigRecord({ qcCards, stageKeys = REVIEW_STAGE_KEYS, ranAt } = {}) {
  return {
    ranAt: typeof ranAt === "string" && ranAt ? ranAt : new Date().toISOString(),
    stage2Fingerprints: collectStage2Fingerprints(qcCards),
    stageModels: collectStageModels(stageKeys),
  };
}

/**
 * @param {string[]} a
 * @param {string[]} b
 * @returns {boolean}
 */
export function fingerprintSetsEqual(a, b) {
  const left = Array.isArray(a) ? [...a].sort() : [];
  const right = Array.isArray(b) ? [...b].sort() : [];
  if (left.length !== right.length) return false;
  return left.every((v, i) => v === right[i]);
}

function formatSet(list) {
  const arr = Array.isArray(list) ? list : [];
  return arr.length ? arr.join(",") : "none";
}

/**
 * Drift decision. Silence is the normal case: when the sets match, nothing is
 * emitted, or the alarm becomes noise.
 *
 * @param {{ stage: string, model: string, current: string[], previous: ?string[], firstSeen?: string }} args
 * @returns {{ changed: boolean, level: "warn"|"info"|"silent", line: ?string }}
 */
export function evaluateModelDrift({ stage, model, current, previous, firstSeen } = {}) {
  const currentSet = Array.isArray(current) ? current.filter(Boolean) : [];
  if (currentSet.length === 0) {
    return { changed: false, level: "silent", line: null };
  }
  const at = typeof firstSeen === "string" && firstSeen ? firstSeen : new Date().toISOString();

  if (!Array.isArray(previous) || previous.length === 0) {
    return {
      changed: false,
      level: "info",
      line:
        `[model-drift] stage=${stage} baseline=${formatSet(currentSet)} ` +
        `model=${model} firstSeen=${at}`,
    };
  }

  if (fingerprintSetsEqual(currentSet, previous)) {
    return { changed: false, level: "silent", line: null };
  }

  return {
    changed: true,
    level: "warn",
    line:
      `[model-drift] stage=${stage} previous=${formatSet(previous)} ` +
      `current=${formatSet(currentSet)} model=${model} firstSeen=${at}`,
  };
}
