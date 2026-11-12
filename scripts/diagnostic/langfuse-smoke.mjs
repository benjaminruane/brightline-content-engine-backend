/**
 * B493. One live Langfuse trace, then a read-back. No model call.
 * Run: node --env-file=.env.local scripts/diagnostic/langfuse-smoke.mjs
 */
import { createTraceId, flushObservability, logCanaryScore, startTrace } from "../../lib/observability.js";
import { langfuseCredentials, listObservationsV2 } from "./lib/langfuse-public.mjs";

const POLL_MS = 5_000;
const WAIT_MS = 90_000;
const WINDOW_MS = 15 * 60 * 1000;
const SCORE_NAME = "smoke-canary";

function isSet(name) {
  return typeof process.env[name] === "string" && process.env[name].trim() !== "";
}

function redact(text) {
  return String(text)
    .replace(/pk-lf-[A-Za-z0-9_-]+/g, "pk-lf-redacted")
    .replace(/sk-lf-[A-Za-z0-9_-]+/g, "sk-lf-redacted");
}

function baseHost() {
  const raw = String(process.env.LANGFUSE_BASE_URL || process.env.LANGFUSE_HOST || "").trim();
  if (!raw) return "(unset)";
  try {
    return new URL(raw).host || "(unset)";
  } catch {
    return "(unparseable)";
  }
}

function looksLikeSendProblem(text) {
  return /\[langfuse\]|langfuse|exporter|failed to export/i.test(text);
}

function hookConsole() {
  const captured = [];
  const original = { warn: console.warn, error: console.error };
  function take(method, args) {
    const text = redact(args.map((part) => (typeof part === "string" ? part : part?.message || String(part))).join(" "));
    if (looksLikeSendProblem(text)) captured.push(text);
    else original[method].apply(console, args);
  }
  console.warn = (...args) => take("warn", args);
  console.error = (...args) => take("error", args);
  // Held until after the flush, so a warning is printed once.
  return {
    captured,
    restore() {
      console.warn = original.warn;
      console.error = original.error;
    },
  };
}

function scoreMatches(row, traceId) {
  if (row?.name !== SCORE_NAME) return false;
  if (row?.value != null && Number(row.value) !== 1) return false;
  const subject = row?.subject;
  if (subject && typeof subject === "object") {
    const id = subject.id || subject.traceId;
    if (typeof id === "string") return id === traceId;
  }
  if (typeof row?.traceId === "string") return row.traceId === traceId;
  return true;
}

async function readScore(traceId, fromTimestamp) {
  const creds = langfuseCredentials();
  if (!creds) return { yes: false, error: "missing langfuse env" };
  const auth = Buffer.from(`${creds.pub}:${creds.sec}`).toString("base64");
  const toTimestamp = new Date(Date.now() + 60_000).toISOString();
  const query = new URLSearchParams({
    traceId,
    name: SCORE_NAME,
    fromTimestamp,
    toTimestamp,
    fields: "details,subject",
    limit: "10",
  });
  const res = await fetch(`${creds.base}/api/public/v3/scores?${query}`, {
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
  });
  if (!res.ok) return { yes: false, status: res.status, error: `status ${res.status}` };
  const body = await res.json().catch(() => null);
  const rows = Array.isArray(body?.data) ? body.data : [];
  return { yes: rows.some((row) => scoreMatches(row, traceId)), status: res.status };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const baseSet = isSet("LANGFUSE_BASE_URL") || isSet("LANGFUSE_HOST");
console.log(`LANGFUSE_PUBLIC_KEY ${isSet("LANGFUSE_PUBLIC_KEY") ? "yes" : "no"}`);
console.log(`LANGFUSE_SECRET_KEY ${isSet("LANGFUSE_SECRET_KEY") ? "yes" : "no"}`);
console.log(`LANGFUSE_BASE_URL/LANGFUSE_HOST ${baseSet ? "yes" : "no"}`);
console.log(`host ${baseHost()}`);

const hook = hookConsole();
const traceId = createTraceId();
const fromTimestamp = new Date(Date.now() - WINDOW_MS).toISOString();
startTrace({
  traceId,
  traceName: "langfuse-smoke",
  metadata: { smoke: true },
});
logCanaryScore({ traceId, name: SCORE_NAME, value: 1 });
await flushObservability();
hook.restore();

if (hook.captured.length === 0) {
  console.log("send warnings: none");
} else {
  for (const line of hook.captured) console.log(line);
}

const deadline = Date.now() + WAIT_MS;
let listed = null;
let found = null;
while (Date.now() <= deadline) {
  listed = await listObservationsV2({
    fromStartTime: fromTimestamp,
    toStartTime: new Date(Date.now() + 60_000).toISOString(),
    traceId,
    fields: "core,basic",
  });
  if (listed.ok && listed.rows.length > 0) {
    found = listed;
    break;
  }
  if (Date.now() + POLL_MS > deadline) break;
  await sleep(POLL_MS);
}

if (!found) {
  const detail = listed?.error || (listed?.status != null ? `status ${listed.status}` : "no observations in 90s");
  console.log(`SMOKE NOT FOUND ${traceId} ${detail}`);
  process.exitCode = 1;
} else {
  let score = { yes: false, error: "score not read" };
  while (Date.now() <= deadline) {
    score = await readScore(traceId, fromTimestamp);
    if (score.yes) break;
    if (Date.now() + POLL_MS > deadline) break;
    await sleep(POLL_MS);
  }
  if (!score.yes && score.error) console.log(`score read ${score.error}`);
  console.log(`SMOKE FOUND ${traceId} observations=${found.rows.length} score=${score.yes ? "yes" : "no"}`);
  if (!score.yes) process.exitCode = 1;
}
