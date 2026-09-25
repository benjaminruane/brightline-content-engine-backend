/**
 * Compare a run's serving configuration against the last one recorded and log
 * when it changes.
 *
 * Never throws and never blocks. A Review must not fail because the drift log
 * is unavailable. Any database failure (missing URL, or a URL that is present
 * and refusing) degrades to an in-process memory of the last set, which still
 * catches drift inside a warm instance.
 */
import { evaluateModelDrift } from "./model-fingerprints.mjs";

/**
 * B330. From 2026-09-21 the production credential was refused
 * (`password authentication failed for user 'neondb_owner'`). No drift rows
 * were written. After the credential is rotated, the next successful record is
 * a new baseline, not continuity with the last written row.
 */
export const MODEL_DRIFT_BLIND_PERIOD = Object.freeze({
  from: "2026-09-21",
  note:
    "DATABASE_URL rejected password for neondb_owner. Drift rows were not written. The next successful record is a new baseline, not continuity.",
});

/** Last set seen by this process, per stage. Fallback when the DB is unavailable. */
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

function remember(stage, current) {
  inProcessLatest.set(stage, current);
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
    let db = null;
    try {
      db = await loadDbModules();
    } catch (err) {
      console.warn(
        `[model-drift] stage=${stage} check_failed reason=${
          err?.message ? String(err.message).slice(0, 120) : "unknown"
        }`
      );
      db = null;
    }

    let previous = null;
    if (db) {
      try {
        const row = await db.loadLatestFingerprintRecord(db.sql, stage);
        previous = row?.fingerprints ?? null;
      } catch (err) {
        console.warn(
          `[model-drift] stage=${stage} check_failed reason=${
            err?.message ? String(err.message).slice(0, 120) : "unknown"
          }`
        );
        db = null;
        previous = inProcessLatest.get(stage) ?? null;
      }
    } else {
      previous = inProcessLatest.get(stage) ?? null;
    }

    const decision = evaluateModelDrift({ stage, model, current, previous });
    if (decision.level === "warn") alarm(decision.line);
    else if (decision.level === "info") info(decision.line);

    if (decision.level !== "silent") {
      if (db) {
        try {
          await db.recordFingerprintSet(db.sql, { stage, model, fingerprints: current });
        } catch (err) {
          console.warn(
            `[model-drift] stage=${stage} check_failed reason=${
              err?.message ? String(err.message).slice(0, 120) : "unknown"
            }`
          );
          remember(stage, current);
        }
      } else {
        remember(stage, current);
      }
    }
    return decision;
  } catch (err) {
    console.warn(
      `[model-drift] stage=${stage} check_failed reason=${
        err?.message ? String(err.message).slice(0, 120) : "unknown"
      }`
    );
    return silent;
  }
}
