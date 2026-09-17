#!/usr/bin/env node
/**
 * B195 category noise floor. Sequential Reviews against a local API.
 *
 *   node scripts/diagnostic/noise-floor/run-category-noise-floor.mjs \
 *     --fixture 18 --runs 10 --label cache-off
 *   node scripts/diagnostic/noise-floor/run-category-noise-floor.mjs --dry
 */

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadLocalEnvFiles } from "../lib/env.mjs";
import { loadAllFixtures, parseIdsArg } from "../lib/fixtures.mjs";
import { loadPipelineSources } from "../lib/sources.mjs";
import { extractLogCountsFromFile, emptyLogCounts } from "./extract-server-log-counts.mjs";
import { extractRunFromResponse, scoreFixtureRuns, formatScoreTable } from "./score-category-noise-floor.mjs";

loadLocalEnvFiles({ liveMeasurement: true });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUNS_DIR = path.join(__dirname, "runs");
const DEFAULT_API = "http://127.0.0.1:3000";
const DEFAULT_LOG = "/tmp/b195-server.log";
const REQUEST_TIMEOUT_MS = 12 * 60 * 1000;
const COST_GATE_USD = 25;

/** Spec: fixture 18 is about USD 0.35. Others scaled by sources * draft chars. */
const FIXTURE_18_ESTIMATE_USD = 0.35;
const FIXTURE_18_CHARS = 1857;
const FIXTURE_18_SOURCES = 2;

function parseArgs(argv) {
  const opts = {
    fixture: null,
    runs: 1,
    label: "run",
    dry: false,
    apiBase: process.env.QC_NOISE_FLOOR_API || DEFAULT_API,
    logFile: process.env.QC_NOISE_FLOOR_LOG || DEFAULT_LOG,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry") {
      opts.dry = true;
      continue;
    }
    if (arg === "--fixture" && argv[i + 1]) {
      opts.fixture = String(argv[++i]);
      continue;
    }
    if (arg === "--runs" && argv[i + 1]) {
      opts.runs = Math.max(1, Number(argv[++i]) || 1);
      continue;
    }
    if (arg === "--label" && argv[i + 1]) {
      opts.label = String(argv[++i]);
      continue;
    }
    if (arg === "--api-base" && argv[i + 1]) {
      opts.apiBase = String(argv[++i]);
      continue;
    }
    if (arg === "--log-file" && argv[i + 1]) {
      opts.logFile = String(argv[++i]);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return opts;
}

function utf8Bytes(value) {
  return Buffer.byteLength(typeof value === "string" ? value : JSON.stringify(value), "utf8");
}

function padId(id) {
  return String(id ?? "").padStart(2, "0");
}

function estimateCostUsd(fixture) {
  const draft = typeof fixture.data?.draft === "string" ? fixture.data.draft : "";
  const sources = Array.isArray(fixture.data?.sources) ? fixture.data.sources.length : 0;
  const scale =
    (Math.max(1, sources) * Math.max(1, draft.length)) /
    (FIXTURE_18_SOURCES * FIXTURE_18_CHARS);
  return FIXTURE_18_ESTIMATE_USD * scale;
}

/**
 * Same fields the frontend Review sends (useDraftState runStatementAnalysis).
 */
function buildAnalyseRequest(fixture, sources, runIndex, label) {
  const cfg = fixture.data?.config && typeof fixture.data.config === "object" ? fixture.data.config : {};
  const outputType = typeof cfg.outputType === "string" ? cfg.outputType.trim() : "";
  const requiredVersion = cfg.requiredVersion === "public" ? "public" : "complete";
  const draftText = typeof fixture.data?.draft === "string" ? fixture.data.draft : "";
  const sourcePayloads = sources.map((row, index) => ({
    id: `src_${index}`,
    kind: "file",
    name: `${row.label}.txt`,
    title: `${row.label}.txt`,
    text: row.text,
    publicationState: row.publicationState || "unknown",
  }));
  return {
    draftText,
    versionId: `noise-floor-${padId(fixture.data.id)}-${label}-${runIndex}`,
    sources: sourcePayloads,
    publicSearch: false,
    web: { enabled: false, mode: "OFF" },
    engine: "v2",
    evidenceEnabled: true,
    editorialEnabled: true,
    complianceEnabled: true,
    selectedTypes: outputType ? [outputType] : [],
    ...(requiredVersion ? { versionType: requiredVersion } : {}),
  };
}

async function logFileSize(filePath) {
  if (!filePath || !existsSync(filePath)) return 0;
  return (await stat(filePath)).size;
}

async function fetchJson(url, body, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = { ok: false, parseError: true, raw: text.slice(0, 500) };
    }
    return { status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

function walkCostUsd(node, acc = { costUsd: 0, hits: 0 }) {
  if (!node || typeof node !== "object") return acc;
  if (Array.isArray(node)) {
    for (const item of node) walkCostUsd(item, acc);
    return acc;
  }
  if (Number.isFinite(node.costUsd) && node.costUsd > 0) {
    acc.costUsd += Number(node.costUsd);
    acc.hits += 1;
  }
  for (const value of Object.values(node)) {
    if (value && typeof value === "object") walkCostUsd(value, acc);
  }
  return acc;
}

async function fetchLangfuseCost(traceId) {
  const host = String(process.env.LANGFUSE_HOST || "").trim();
  const pub = String(process.env.LANGFUSE_PUBLIC_KEY || "").trim();
  const sec = String(process.env.LANGFUSE_SECRET_KEY || "").trim();
  if (!host || !pub || !sec || !traceId) return null;
  const auth = Buffer.from(`${pub}:${sec}`).toString("base64");
  const url = `${host.replace(/\/$/, "")}/api/public/traces/${encodeURIComponent(traceId)}`;
  try {
    const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
    if (!res.ok) return null;
    const data = await res.json();
    const candidates = [
      data?.totalCost,
      data?.calculatedTotalCost,
      data?.latency?.totalCost,
    ];
    for (const value of candidates) {
      const n = Number(value);
      if (Number.isFinite(n) && n > 0) return n;
    }
  } catch {
    return null;
  }
  return null;
}

function d6Gaps(run) {
  const gaps = [];
  if (!Number.isFinite(run.statementCount) || run.statementCount <= 0) gaps.push("statementCount");
  if (!Array.isArray(run.cards) || run.cards.length === 0) gaps.push("cards");
  for (const [index, card] of (run.cards || []).entries()) {
    if (!card.text) gaps.push(`cards[${index}].text`);
    if (card.displayVerdict == null || card.displayVerdict === "") gaps.push(`cards[${index}].displayVerdict`);
    if (!("editorialVerdict" in card)) gaps.push(`cards[${index}].editorialVerdict`);
    if (!("complianceVerdict" in card)) gaps.push(`cards[${index}].complianceVerdict`);
    if (!card.summaryClass || typeof card.summaryClass !== "object") gaps.push(`cards[${index}].summaryClass`);
  }
  if (!run.reviewSummary || typeof run.reviewSummary !== "object") gaps.push("reviewSummary");
  if (!run.modelConfig || typeof run.modelConfig !== "object") gaps.push("modelConfig");
  if (!Number.isFinite(run.wallTimeMs)) gaps.push("wallTimeMs");
  if (!Number.isFinite(run.costUsd)) gaps.push("costUsd");
  if (!run.log || typeof run.log !== "object") gaps.push("log");
  return gaps;
}

async function sumSpendFromRunsDir() {
  if (!existsSync(RUNS_DIR)) return 0;
  const { readdir } = await import("node:fs/promises");
  const names = await readdir(RUNS_DIR);
  let total = 0;
  for (const name of names) {
    if (!name.endsWith(".json") || name.startsWith("_")) continue;
    try {
      const row = JSON.parse(await readFile(path.join(RUNS_DIR, name), "utf8"));
      const n = Number(row?.extracted?.costUsd);
      if (Number.isFinite(n)) total += n;
    } catch {
      /* skip */
    }
  }
  return total;
}

function runFileName(label, fixtureId, runIndex) {
  return `${label}-${padId(fixtureId)}-run${String(runIndex).padStart(2, "0")}.json`;
}

async function resolveFixture(id) {
  const all = await loadAllFixtures();
  const want = padId(id);
  const found = all.find((row) => padId(row.data.id) === want);
  if (!found) throw new Error(`Fixture ${id} not found`);
  return found;
}

function printDryPlan(rows) {
  let totalEst = 0;
  console.log("B195 --dry planned requests");
  for (const row of rows) {
    totalEst += row.estimateUsd * row.runs;
    console.log(
      `fixture ${row.id} ${row.label} runs=${row.runs} draftChars=${row.draftChars} ` +
        `sources=${row.sourceCount} bodyBytes=${row.bodyBytes} estimateUsdPerRun=${row.estimateUsd.toFixed(4)} ` +
        `estimateUsdTotal=${(row.estimateUsd * row.runs).toFixed(4)}`
    );
  }
  console.log(`estimateUsdGrand=${totalEst.toFixed(4)} (from fixture-18 $0.35 scaled; not a billed figure)`);
}

async function runOne({ fixture, sources, opts, runIndex }) {
  const body = buildAnalyseRequest(fixture, sources, runIndex, opts.label);
  const url = `${opts.apiBase.replace(/\/$/, "")}/api/analyse-statements`;
  const startByte = await logFileSize(opts.logFile);
  const t0 = Date.now();
  const { status, data } = await fetchJson(url, body, REQUEST_TIMEOUT_MS);
  const wallTimeMs = Date.now() - t0;
  const endByte = await logFileSize(opts.logFile);
  let log = emptyLogCounts();
  if (existsSync(opts.logFile)) {
    log = await extractLogCountsFromFile(opts.logFile, { startByte, endByte });
  }
  const walked = walkCostUsd(data);
  let costUsd = null;
  let costSource = "unreadable_via_http";
  const traceId = data?.meta?.traceId;
  if (walked.hits > 0 && walked.costUsd > 0) {
    costUsd = walked.costUsd;
    costSource = "response_costUsd_fields";
  }
  if (!Number.isFinite(costUsd) && traceId) {
    await new Promise((r) => setTimeout(r, 1500));
    const fromTrace = await fetchLangfuseCost(traceId);
    if (Number.isFinite(fromTrace)) {
      costUsd = fromTrace;
      costSource = "langfuse_trace";
    }
  }
  const extracted = extractRunFromResponse(data, { wallTimeMs, costUsd, costSource, log });
  return {
    fixtureId: padId(fixture.data.id),
    fixtureLabel: fixture.data.label,
    label: opts.label,
    runIndex,
    startedAt: new Date(t0).toISOString(),
    endedAt: new Date(t0 + wallTimeMs).toISOString(),
    httpStatus: status,
    requestBytes: utf8Bytes(body),
    logFile: opts.logFile,
    logByteRange: { startByte, endByte },
    extracted,
    ok: data?.ok === true && status === 200,
    error: data?.ok === true ? null : data?.meta?.fatal || `http ${status}`,
  };
}

async function main() {
  const opts = parseArgs(process.argv);
  await mkdir(RUNS_DIR, { recursive: true });

  const targetIds = opts.fixture ? parseIdsArg(opts.fixture) : ["18", "24", "10"];
  const fixtures = [];
  for (const id of targetIds) fixtures.push(await resolveFixture(id));

  const planned = [];
  for (const fixture of fixtures) {
    const sources = await loadPipelineSources(fixture.data.sources);
    const body = buildAnalyseRequest(fixture, sources, 1, opts.label);
    planned.push({
      id: padId(fixture.data.id),
      label: fixture.data.label,
      runs: opts.dry ? (opts.fixture ? opts.runs : 10) : opts.runs,
      draftChars: typeof fixture.data.draft === "string" ? fixture.data.draft.length : 0,
      sourceCount: sources.length,
      bodyBytes: utf8Bytes(body),
      estimateUsd: estimateCostUsd(fixture),
      fixture,
      sources,
    });
  }

  if (opts.dry) {
    printDryPlan(planned);
    return;
  }

  if (!opts.fixture) {
    throw new Error("Billed runs require --fixture <id>");
  }

  const row = planned[0];
  const written = [];
  for (let i = 1; i <= opts.runs; i++) {
    const spendBefore = await sumSpendFromRunsDir();
    console.log(
      `starting ${opts.label} fixture ${row.id} run ${i}/${opts.runs} spendSoFar=${spendBefore.toFixed(4)}`
    );
    const result = await runOne({
      fixture: row.fixture,
      sources: row.sources,
      opts,
      runIndex: i,
    });
    const outPath = path.join(RUNS_DIR, runFileName(opts.label, row.id, i));
    await writeFile(outPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    written.push(outPath);
    const extracted = result.extracted;
    const gaps = d6Gaps(extracted);
    const spendAfter = await sumSpendFromRunsDir();
    console.log(
      `wrote ${path.basename(outPath)} http=${result.httpStatus} statements=${extracted.statementCount} ` +
        `wallMs=${extracted.wallTimeMs} costUsd=${extracted.costUsd ?? "null"} (${extracted.costSource}) ` +
        `cacheHits=${extracted.log?.cacheHits ?? 0} spendTotal=${spendAfter.toFixed(4)}`
    );
    if (gaps.length) {
      console.log(`D6 gaps: ${gaps.join(", ")}`);
    }
    if (opts.label === "pilot") {
      const projected = Number(extracted.costUsd) * 32;
      console.log(`COST GATE 1: pilot x 32 = ${Number.isFinite(projected) ? projected.toFixed(4) : "unreadable"}`);
      if (Number.isFinite(projected) && projected > COST_GATE_USD) {
        console.log("COST GATE 1 STOP");
        process.exitCode = 2;
        return;
      }
      if (!Number.isFinite(extracted.costUsd)) {
        console.log("COST GATE 1: cost unreadable; continuing with log and Langfuse retries on later runs");
      }
    }
    if (spendAfter > COST_GATE_USD) {
      console.log(`COST GATE 2 STOP after current run spend=${spendAfter.toFixed(4)}`);
      process.exitCode = 2;
      return;
    }
  }

  const runs = [];
  for (const filePath of written) {
    const json = JSON.parse(await readFile(filePath, "utf8"));
    runs.push(json.extracted);
  }
  if (runs.length > 1) {
    const scored = scoreFixtureRuns(runs);
    console.log(formatScoreTable(scored));
    console.log(`splitChanged=${scored.splitChanged} flips=${scored.flips.length}`);
  }
}

main().catch((err) => {
  console.error(err?.stack || err?.message || String(err));
  process.exit(1);
});
