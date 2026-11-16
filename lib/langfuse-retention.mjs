/**
 * Delete Langfuse traces older than the retention window.
 *
 * List: GET /api/public/v2/observations (the replacement for GET /api/public/traces).
 * fromStartTime is inclusive and toStartTime is exclusive. Rows are grouped by traceId.
 * The trace time is the earliest startTime. fields=core so the page does not pull draft text.
 * Delete: DELETE /api/public/traces {"traceIds":[...]}, at most 1,000 ids per request.
 * Observations v2 sits in the general API bucket (Hobby 30 requests per minute), so list
 * pages pause 2 seconds. Trace deletion also removes observations and scores.
 */
import { langfuseBaseUrl } from "./langfuse-tracing.mjs";

const DAY_MS = 24 * 60 * 60 * 1000;
export const DELETE_BATCH_CAP = 1000;
export const MAX_DELETE_REQUESTS = 10;
export const MAX_TRACE_IDS = 5000;
export const LIST_PAGE_LIMIT = 1000;
export const LIST_PAUSE_MS = 2000;
const WINDOW_DAYS = 30;
const MAX_WINDOWS = 36;

function envTrim(name) {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

function basicAuth(publicKey, secretKey) {
  return `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString("base64")}`;
}

function traceIdOf(row) {
  if (typeof row?.traceId === "string" && row.traceId.trim()) return row.traceId.trim();
  if (typeof row?.id === "string" && row.id.trim()) return row.id.trim();
  return "";
}

function timeOf(row) {
  const raw = typeof row?.startTime === "string" && row.startTime
    ? row.startTime
    : row?.timestamp;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function listEligible({ host, auth, cutoffMs, fetchImpl, sleepImpl }) {
  const earliest = new Map();
  let listCalls = 0;
  let capped = false;

  const eligibleCount = () => {
    let count = 0;
    for (const ms of earliest.values()) if (ms < cutoffMs) count += 1;
    return count;
  };

  for (let windowIndex = 0; windowIndex < MAX_WINDOWS; windowIndex += 1) {
    if (eligibleCount() >= MAX_TRACE_IDS) {
      capped = true;
      break;
    }
    const windowEnd = cutoffMs - windowIndex * WINDOW_DAYS * DAY_MS;
    const windowStart = windowEnd - WINDOW_DAYS * DAY_MS;
    let cursor = "";
    let windowRows = 0;
    for (;;) {
      if (listCalls > 0) await sleepImpl(LIST_PAUSE_MS);
      listCalls += 1;
      const url = new URL("/api/public/v2/observations", host);
      url.searchParams.set("fields", "core");
      url.searchParams.set("limit", String(LIST_PAGE_LIMIT));
      url.searchParams.set("fromStartTime", new Date(windowStart).toISOString());
      url.searchParams.set("toStartTime", new Date(windowEnd).toISOString());
      if (cursor) url.searchParams.set("cursor", cursor);
      const response = await fetchImpl(url, {
        method: "GET",
        headers: { Authorization: auth, Accept: "application/json" },
      });
      if (response.status === 400 && windowIndex > 0) return finish(earliest, cutoffMs, false);
      if (!response.ok) {
        throw new Error(`langfuse retention: list failed (${response.status})`);
      }
      const payload = await readJson(response);
      const rows = Array.isArray(payload?.data) ? payload.data : [];
      windowRows += rows.length;
      for (const row of rows) {
        const id = traceIdOf(row);
        if (!id) continue;
        const ms = timeOf(row);
        if (ms == null) throw new Error("langfuse retention: a listed trace has no timestamp");
        const prev = earliest.get(id);
        if (prev == null || ms < prev) earliest.set(id, ms);
        if (eligibleCount() >= MAX_TRACE_IDS) {
          capped = true;
          return finish(earliest, cutoffMs, true);
        }
      }
      const next = typeof payload?.meta?.cursor === "string" ? payload.meta.cursor : "";
      if (!next) break;
      cursor = next;
    }
    if (windowRows === 0) break;
  }

  return finish(earliest, cutoffMs, capped);
}

function finish(earliest, cutoffMs, capped) {
  const ids = [];
  for (const [id, ms] of earliest) {
    if (ms < cutoffMs) ids.push(id);
    if (ids.length === MAX_TRACE_IDS) break;
  }
  return { ids, capped: capped || ids.length >= MAX_TRACE_IDS && earliest.size > ids.length };
}

async function deleteBatch({ host, auth, ids, fetchImpl }) {
  if (ids.length > DELETE_BATCH_CAP) {
    throw new Error("langfuse retention: delete batch exceeds 1000");
  }
  const response = await fetchImpl(new URL("/api/public/traces", host), {
    method: "DELETE",
    headers: {
      Authorization: auth,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ traceIds: ids }),
  });
  if (!response.ok) {
    throw new Error(`langfuse retention: delete failed (${response.status})`);
  }
}

export async function runRetention({
  now = new Date(),
  retentionDays = 30,
  dryRun = false,
  fetchImpl = globalThis.fetch,
  sleepImpl = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
  if (!(Number.isFinite(retentionDays) && retentionDays >= 7)) {
    throw new Error("retentionDays must be at least 7");
  }
  const host = langfuseBaseUrl().replace(/\/$/, "");
  const publicKey = envTrim("LANGFUSE_PUBLIC_KEY");
  const secretKey = envTrim("LANGFUSE_SECRET_KEY");
  if (!host || !publicKey || !secretKey) return { skipped: "not_configured" };

  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(nowMs)) throw new Error("langfuse retention: now is missing");
  const cutoffMs = nowMs - retentionDays * DAY_MS;
  const cutoff = new Date(cutoffMs).toISOString();
  const auth = basicAuth(publicKey, secretKey);
  const listed = await listEligible({ host, auth, cutoffMs, fetchImpl, sleepImpl });
  const limit = MAX_DELETE_REQUESTS * DELETE_BATCH_CAP;
  const queue = listed.ids.slice(0, limit);
  let deleted = 0;
  let deleteRequests = 0;
  if (!dryRun) {
    for (let index = 0; index < queue.length && deleteRequests < MAX_DELETE_REQUESTS; index += DELETE_BATCH_CAP) {
      const batch = queue.slice(index, index + DELETE_BATCH_CAP);
      await deleteBatch({ host, auth, ids: batch, fetchImpl });
      deleted += batch.length;
      deleteRequests += 1;
    }
  }
  return {
    cutoff,
    found: listed.ids.length,
    deleted,
    deleteRequests,
    capped: listed.capped || listed.ids.length > queue.length,
    dryRun: Boolean(dryRun),
  };
}
