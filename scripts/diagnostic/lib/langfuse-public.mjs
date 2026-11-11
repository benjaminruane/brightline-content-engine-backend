/**
 * Reads for the Langfuse Observations API v2.
 * GET /api/public/traces and GET /api/public/observations are removed on
 * Langfuse Cloud on 2026-11-16. v2 returns observation rows. Input and output
 * are raw strings. Pagination is a cursor. A query without a time range is refused.
 */

const PAGE_LIMIT = 100;
const MAX_PAGES = 20;

export function langfuseCredentials() {
  const base = String(process.env.LANGFUSE_BASE_URL || process.env.LANGFUSE_HOST || "")
    .trim()
    .replace(/\/$/, "");
  const pub = String(process.env.LANGFUSE_PUBLIC_KEY || "").trim();
  const sec = String(process.env.LANGFUSE_SECRET_KEY || "").trim();
  if (!base || !pub || !sec) return null;
  return { base, pub, sec };
}

/**
 * @param {unknown} value
 */
export function parseObservationIo(value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

/**
 * @param {Array<{ totalCost?: unknown }>} rows
 * @returns {number|null}
 */
export function sumObservationCost(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  let saw = false;
  let sum = 0;
  for (const row of rows) {
    const n = Number(row?.totalCost);
    if (!Number.isFinite(n)) continue;
    saw = true;
    sum += n;
  }
  return saw ? sum : null;
}

/**
 * @param {object} params
 * @param {string} params.fromStartTime
 * @param {string} params.toStartTime
 * @param {string} [params.traceId]
 * @param {string} [params.fields]
 * @param {number} [params.limit]
 * @param {string} [params.cursor]
 */
export function observationsV2Path(params) {
  const query = new URLSearchParams();
  query.set("fromStartTime", params.fromStartTime);
  query.set("toStartTime", params.toStartTime);
  query.set("fields", params.fields || "core,basic");
  query.set("limit", String(params.limit || PAGE_LIMIT));
  if (params.traceId) query.set("traceId", params.traceId);
  if (params.cursor) query.set("cursor", params.cursor);
  return `/api/public/v2/observations?${query.toString()}`;
}

/**
 * @param {object} params
 * @param {string} params.fromStartTime
 * @param {string} params.toStartTime
 * @param {string} [params.traceId]
 * @param {string} [params.fields]
 * @returns {Promise<{ ok: boolean, status?: number, rows: object[], truncated: boolean, error?: string }>}
 */
export async function listObservationsV2(params) {
  const fromStartTime = typeof params?.fromStartTime === "string" ? params.fromStartTime.trim() : "";
  const toStartTime = typeof params?.toStartTime === "string" ? params.toStartTime.trim() : "";
  if (!fromStartTime || !toStartTime) {
    console.warn(
      "[langfuse] GET /api/public/v2/observations requires fromStartTime and toStartTime. The query was refused."
    );
    return { ok: false, rows: [], truncated: false, error: "missing time range" };
  }
  const creds = langfuseCredentials();
  if (!creds) return { ok: false, rows: [], truncated: false, error: "missing langfuse env" };

  const auth = Buffer.from(`${creds.pub}:${creds.sec}`).toString("base64");
  const rows = [];
  let cursor = "";
  let pages = 0;
  while (pages < MAX_PAGES) {
    pages += 1;
    const path = observationsV2Path({
      fromStartTime,
      toStartTime,
      traceId: params.traceId,
      fields: params.fields,
      limit: params.limit,
      cursor,
    });
    const res = await fetch(`${creds.base}${path}`, {
      headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      console.warn(`[langfuse] observations v2 status=${res.status} page=${pages}`);
      return { ok: false, status: res.status, rows, truncated: false, error: `status ${res.status}` };
    }
    const pageRows = Array.isArray(body?.data) ? body.data : [];
    for (const row of pageRows) {
      rows.push({
        ...row,
        input: parseObservationIo(row?.input),
        output: parseObservationIo(row?.output),
      });
    }
    const next = typeof body?.meta?.cursor === "string" ? body.meta.cursor : "";
    if (!next) return { ok: true, rows, truncated: false };
    cursor = next;
  }
  console.warn(
    `[langfuse] observations v2 stopped after ${MAX_PAGES} pages. Later rows in ${fromStartTime} to ${toStartTime} were not read.`
  );
  return { ok: true, rows, truncated: true };
}
