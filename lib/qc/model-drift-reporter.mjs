/**
 * Compare a run's serving configuration against the last one recorded and log
 * when it changes.
 *
 * Never throws and never blocks. A Review must not fail because the drift log
 * is unavailable; a missing DATABASE_URL degrades to an in-process memory of
 * the last set, which still catches drift inside a warm instance.
 */
import { evaluateModelDrift } from "./model-fingerprints.mjs";

/** Last set seen by this process, per stage. Fallback when there is no DB. */
const inProcessLatest = new Map();

/** Test seam. */
export function resetInProcessDriftMemory() {
  inProcessLatest.clear();
}

async function loadDbModules() {
  if (!process.env.DATABASE_URL) return null;
  const [{ getSql }, log] = await Promise.all([
    import("../db/client.mjs"),
    import("../db/model-fingerprint-log.mjs"),
  ]);
  return { sql: getSql(), ...log };
}

/**
 * @param {{
 *   stage: string,
 *   model: string,
 *   fingerprints: string[],
 *   log?: Function,
 *   warn?: Function,
 * }} args
 * @returns {Promise<{ level: "warn"|"info"|"silent", changed: boolean, line: ?string }>}
 */
export async function reportModelDrift({ stage, model, fingerprints, log, warn } = {}) {
  const current = [...new Set((Array.isArray(fingerprints) ? fingerprints : []).filter(Boolean))].sort();
  const silent = { level: "silent", changed: false, line: null };
  if (current.length === 0) return silent;

  const info = typeof log === "function" ? log : console.log;
  const alarm = typeof warn === "function" ? warn : console.warn;

  try {
    const db = await loadDbModules();
    let previous = null;
    if (db) {
      const row = await db.loadLatestFingerprintRecord(db.sql, stage);
      previous = row?.fingerprints ?? null;
    } else {
      previous = inProcessLatest.get(stage) ?? null;
    }

    const decision = evaluateModelDrift({ stage, model, current, previous });
    if (decision.level === "warn") alarm(decision.line);
    else if (decision.level === "info") info(decision.line);

    if (decision.level !== "silent") {
      if (db) await db.recordFingerprintSet(db.sql, { stage, model, fingerprints: current });
      else inProcessLatest.set(stage, current);
    }
    return decision;
  } catch (err) {
    // Observability must not break the request it is observing.
    console.warn(
      `[model-drift] stage=${stage} check_failed reason=${
        err?.message ? String(err.message).slice(0, 120) : "unknown"
      }`
    );
    return silent;
  }
}
