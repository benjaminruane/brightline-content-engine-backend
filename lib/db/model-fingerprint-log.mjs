/**
 * Append-only log of observed model serving configurations, one row per
 * change. Read to answer "what did the previous run use".
 *
 * Nothing here may block or fail a Review. Every caller goes through
 * reportModelDrift in lib/qc/model-drift-reporter.mjs, which swallows errors.
 */

function exec(sql, text, params = []) {
  return sql.query(text, params);
}

/**
 * Most recently recorded configuration for a stage, or null when the log is
 * empty for it.
 *
 * @param {object} sql
 * @param {string} stage
 * @returns {Promise<?{ stage: string, model: string, fingerprints: string[], firstSeen: string }>}
 */
export async function loadLatestFingerprintRecord(sql, stage) {
  const rows = await exec(
    sql,
    `select stage, model, fingerprints, first_seen
       from model_fingerprint_log
      where stage = $1
      order by first_seen desc, id desc
      limit 1`,
    [stage]
  );
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const row = rows[0];
  const fingerprints = Array.isArray(row.fingerprints) ? row.fingerprints : [];
  return {
    stage: row.stage,
    model: row.model,
    fingerprints,
    firstSeen: row.first_seen ?? row.firstSeen ?? null,
  };
}

/**
 * Record a configuration. Appends only when it differs from the latest row,
 * so the table holds one row per change rather than one per request.
 *
 * @param {object} sql
 * @param {{ stage: string, model: string, fingerprints: string[] }} args
 * @returns {Promise<{ recorded: boolean, firstSeen: ?string }>}
 */
export async function recordFingerprintSet(sql, { stage, model, fingerprints }) {
  const list = [...new Set((Array.isArray(fingerprints) ? fingerprints : []).filter(Boolean))].sort();
  const rows = await exec(
    sql,
    `insert into model_fingerprint_log (stage, model, fingerprints)
     values ($1, $2, $3::jsonb)
     returning first_seen`,
    [stage, model, JSON.stringify(list)]
  );
  const saved = Array.isArray(rows) && rows[0] ? rows[0] : null;
  return { recorded: true, firstSeen: saved?.first_seen ?? null };
}
