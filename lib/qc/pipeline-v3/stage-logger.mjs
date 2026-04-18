/**
 * A8.14: Temporary qcTrace JSON logs (grep `qcTrace` in Vercel). No API surface.
 */

const TRUNCATE_LEN = 2000;
const TRUNCATE_MARKER = "…[truncated]";

const STRING_KEYS_TO_TRUNCATE = new Set([
  "passage",
  "explanation",
  "rawLLMResponse",
  "commentary",
  "statement",
]);

function truncateString(s) {
  if (typeof s !== "string") return s;
  if (s.length <= TRUNCATE_LEN) return s;
  return s.slice(0, TRUNCATE_LEN) + TRUNCATE_MARKER;
}

function deepTruncateForLog(value, depth = 0) {
  if (depth > 20) return "[max-depth]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((item) => deepTruncateForLog(item, depth + 1));
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === "string" && STRING_KEYS_TO_TRUNCATE.has(k)) {
        out[k] = truncateString(v);
      } else {
        out[k] = deepTruncateForLog(v, depth + 1);
      }
    }
    return out;
  }
  return value;
}

/**
 * @returns {string} e.g. 20260418T1453-ab12
 */
export function makeRunId() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`;
  const suf = Math.random().toString(36).slice(2, 6);
  return `${stamp}-${suf}`;
}

function normalizeClassification(value) {
  const c = typeof value === "string" ? value.trim() : "";
  if (
    c === "confirmed" ||
    c === "partially_confirmed" ||
    c === "conflicting" ||
    c === "no_support"
  ) {
    return c;
  }
  return "no_support";
}

export function deriveRuleThatFired(sourceMatches) {
  const safe = Array.isArray(sourceMatches) ? sourceMatches : [];
  const anyConfirmed = safe.some((m) => normalizeClassification(m?.classification) === "confirmed");
  if (anyConfirmed) return "any_confirmed";
  const anyConflicting = safe.some((m) => normalizeClassification(m?.classification) === "conflicting");
  if (anyConflicting) return "any_conflicting";
  const anyPartial = safe.some((m) => normalizeClassification(m?.classification) === "partially_confirmed");
  if (anyPartial) return "any_partial";
  return "all_no_support";
}

/**
 * @param {{ runId: string, stmtIndex?: number|null, stage: string, payload?: unknown }} args
 */
export function logStage({ runId, stmtIndex = null, stage, payload = {} }) {
  try {
    const safePayload = deepTruncateForLog(payload);
    const line = JSON.stringify({
      qcTrace: true,
      runId,
      stmtIndex,
      stage,
      payload: safePayload,
    });
    console.log(line);
  } catch {
    try {
      console.log(
        JSON.stringify({
          qcTrace: true,
          runId: runId ?? null,
          stmtIndex: stmtIndex ?? null,
          stage: stage ?? "unknown",
          error: "serialize_failed",
        })
      );
    } catch {
      console.log('{"qcTrace":true,"error":"serialize_failed"}');
    }
  }
}
